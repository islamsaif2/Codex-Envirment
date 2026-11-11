/* Shopify Attribution: live Channels section, backed by /api/shopify-attribution. */
(function () {
  "use strict";
  const MODELS = [
    ["last_non_direct_click","Last non-direct click","Direct is ignored. 100% credit is given to the last non-direct channel clicked."],
    ["last_click","Last click","100% credit is given to the last channel clicked."],
    ["first_click","First click","100% credit is given to the first channel clicked."],
    ["any_click","Any click","100% credit is given to each channel clicked."],
    ["linear","Linear","Equal credit is given to each click."]
  ];
  const TRAFFIC = [
    ["all","All traffic","Paid, organic, unknown, direct, and unattributed traffic."],
    ["marketing","Marketing traffic","Paid, organic, and unknown traffic."],
    ["paid","Paid traffic","Paid traffic only."],
    ["organic","Organic traffic","Organic traffic only."]
  ];
  const state={model:"linear",traffic:"all",store:"all",sort:"sales",descending:true,limit:12,request:0};
  const number = v => Number(v||0).toLocaleString("en-US",{maximumFractionDigits:2});
  const money = v => Number(v||0).toLocaleString("en-US",{style:"currency",currency:"EGP",maximumFractionDigits:2});
  const percentage = v => v==null?"—":(Number(v)*100).toFixed(2)+"%";
  function el(tag,cls,text) {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  }
  function createSelect(items,value,onChange){
    const select=el("select","shop-attr-select");
    for(const [id,label] of items)select.add(new Option(label,id));
    select.value=value;select.addEventListener("change",()=>onChange(select.value));
    return select;
  }
  function dateRange(){
    // Prefer the main dashboard's selected range. Do not invent dates when unavailable.
    const d=typeof dashboard!=="undefined" ? dashboard : null;
    const candidates=[d?.range,d?.dateRange,d?.filters,d?.period,d?.selection];
    for(const p of candidates){
      if(!p||typeof p!=="object")continue;
      const start=p.start||p.from||p.startDate||p.dateFrom;
      const end=p.end||p.to||p.endDate||p.dateTo;
      if(/^\d{4}-\d\d-\d\d$/.test(String(start))&&/^\d{4}-\d\d-\d\d$/.test(String(end)))
        return {start:String(start),end:String(end)};
    }
    // Main app may expose a date range in its current dashboard request.
    const inputs=[...document.querySelectorAll('input[type="date"]')].filter(x=>x.value);
    if(inputs.length>=2)return {start:inputs[0].value,end:inputs[1].value};
    return {start:"",end:""};
  }
  function findPanel(){
    const root=document.getElementById("content");if(!root)return null;
    const old=root.querySelector("#source-attribution");
    if(old)return old.closest("section.panel");
    const heading=[...root.querySelectorAll("section.panel h3")].find(h=>h.textContent.trim()==="Channel Analysis");
    return heading?.closest("section.panel")||null;
  }
  function mount(panel){
    if(panel.dataset.shopifyAttributionMounted)return;
    panel.dataset.shopifyAttributionMounted="1";
    panel.classList.add("shop-attr-panel");
    const title=el("h3","","Shopify Attribution");
    const header=el("div","shop-attr-heading");
    const filters=el("div","shop-attr-filters");
    const modelLabel=el("label","shop-attr-filter");
    modelLabel.append(el("span","","Attribution model"));
    const modelSelect=createSelect(MODELS,state.model,v=>{state.model=v;state.limit=12;describe();load();});
    const modelHelp=el("small","shop-attr-help");
    modelLabel.append(modelSelect,modelHelp);
    const trafficLabel=el("label","shop-attr-filter");
    trafficLabel.append(el("span","","Traffic type"));
    const trafficSelect=createSelect(TRAFFIC,state.traffic,v=>{state.traffic=v;state.limit=12;describe();load();});
    const trafficHelp=el("small","shop-attr-help");
    trafficLabel.append(trafficSelect,trafficHelp);
    const storeLabel=el("label","shop-attr-filter shop-attr-store");
    storeLabel.append(el("span","","Source store"));
    const storeSelect=createSelect([["all","All stores"]],"all",v=>{state.store=v;load();});
    storeLabel.append(storeSelect);
    filters.append(modelLabel,trafficLabel,storeLabel);
    header.append(title,filters);
    const summary=el("div","shop-attr-kpis");
    const stats=[["sales","Attributed total sales"],["orders","Attributed orders"],["sessions","Sessions"],["conversionRate","Shopify native conversion rate"]];
    const statNodes={};
    for(const [key,label] of stats){
      const c=el("div","shop-attr-kpi");c.append(el("span","",label));
      const value=el("strong","","—");c.append(value);summary.append(c);statNodes[key]=value;
    }
    const message=el("p","shop-attr-message");
    const scroller=el("div","shop-attr-scroll");
    const table=el("table","shop-attr-table");
    const thead=el("thead"),headrow=el("tr");
    const columns=[["channel","Marketing channel"],["traffic","Traffic type"],["sessions","Sessions"],["checkouts","Converted sessions"],["conversionRate","Conversion rate"],["orders","Attributed orders"],["sales","Attributed sales"]];
    for(const [key,label] of columns){
      const th=el("th"),button=el("button","shop-attr-sort",label);button.type="button";
      button.onclick=()=>{state.descending=state.sort===key?!state.descending:true;state.sort=key;draw();};
      th.append(button);headrow.append(th);
    }
    thead.append(headrow);const tbody=el("tbody");table.append(thead,tbody);scroller.append(table);
    const more=el("button","btn shop-attr-more","Load more");more.type="button";more.onclick=()=>{state.limit+=12;draw();};
    const note=el("p","shop-attr-note","Sessions and native conversion rate do not depend on the attribution model. Any click may credit an order to multiple channels; Linear may show fractional orders.");
    panel.replaceChildren(header,summary,message,scroller,more,note);
    let current=null;
    function describe(){
      modelHelp.textContent=MODELS.find(r=>r[0]===state.model)?.[2]||"";
      trafficHelp.textContent=TRAFFIC.find(r=>r[0]===state.traffic)?.[2]||"";
    }
    function draw(){
      if(!current)return;
      const rows=[...current.channels];
      const direction=state.descending?-1:1;
      rows.sort((a,b)=>{
        let x=a[state.sort],y=b[state.sort];
        const delta=typeof x==="string"?x.localeCompare(y):Number(x||0)-Number(y||0);
        return direction*delta||a.channel.localeCompare(b.channel);
      });
      for(const [i,[key,label]] of columns.entries())
        headrow.cells[i].firstChild.textContent=label+(state.sort===key?(state.descending?" ↓":" ↑"):"");
      tbody.replaceChildren();
      for(const row of rows.slice(0,state.limit)){
        const tr=el("tr");
        const values=[row.channel,row.traffic,number(row.sessions),number(row.checkouts),percentage(row.conversionRate),number(row.orders),money(row.sales)];
        values.forEach((v,i)=>tr.append(el("td",i>=2?"shop-attr-numeric":"",v)));
        tbody.append(tr);
      }
      if(!rows.length){const tr=el("tr"),td=el("td","","No attribution data for the selected filters.");td.colSpan=7;tr.append(td);tbody.append(tr);}
      more.hidden=rows.length<=state.limit;
    }
    async function load(){
      const request=++state.request;
      message.textContent="Loading Shopify attribution data…";
      const range=dateRange();
      const query=new URLSearchParams({model:state.model,traffic:state.traffic,store:state.store});
      if(range.start)query.set("start",range.start);
      if(range.end)query.set("end",range.end);
      try{
        const response=await fetch("/api/shopify-attribution?"+query,{headers:{"Accept":"application/json"}});
        const data=await response.json();
        if(!response.ok)throw Error(data.error||"HTTP "+response.status);
        if(request!==state.request||!panel.isConnected)return;
        current=data;
        const storeList=[["all","All stores"],...(data.stores||[]).map(s=>[s,s])];
        const selected=state.store;storeSelect.replaceChildren();
        for(const [v,label] of storeList)storeSelect.add(new Option(label,v));
        storeSelect.value=selected;
        statNodes.sales.textContent=money(data.totals.sales);
        statNodes.orders.textContent=number(data.totals.orders);
        statNodes.sessions.textContent=number(data.totals.sessions);
        statNodes.conversionRate.textContent=percentage(data.totals.conversionRate);
        message.textContent=data.matchedRows?(range.start&&range.end?range.start+" to "+range.end+" · ":"")+data.matchedRows+" attribution rows":"No attribution data for the selected dates and filters.";
        draw();
      }catch(error){
        if(request!==state.request)return;
        current={channels:[]};for(const x of Object.values(statNodes))x.textContent="—";
        message.textContent="Unable to load Shopify Attribution Data: "+(error?.message||String(error));
        draw();
      }
    }
    describe();load();
    // Keep the existing global date controls authoritative when they change.
    let dateTimer=0;
    function refreshDate(event){
      if(!panel.isConnected)return;
      if(event.target?.matches?.('input[type="date"], #apply-date, [data-date-apply]')){
        clearTimeout(dateTimer);dateTimer=setTimeout(load,200);
      }
    }
    document.addEventListener("change",refreshDate,true);
    document.addEventListener("click",refreshDate,true);
  }
  let scheduled=false;
  function scan(){
    scheduled=false;
    if(typeof page!=="undefined"&&page!=="Channels")return;
    const panel=findPanel();if(panel)mount(panel);
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(scan);}
  function start(){
    const root=document.getElementById("content");if(!root)return;
    new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
    schedule();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();