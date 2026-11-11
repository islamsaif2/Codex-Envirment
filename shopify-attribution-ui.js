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
  // Accessible Shopify-style dropdown: each option contains its own description.
  function createChoiceMenu(label,items,selected,onChange){
    const field=el("div","shop-attr-filter");
    field.append(el("span","shop-attr-filter-label",label));
    const details=el("details","shop-attr-menu");
    const summary=el("summary","shop-attr-menu-button");
    const chosenTitle=el("strong","shop-attr-menu-title");
    const chevron=el("span","shop-attr-chevron","⌄");
    const heading=el("div","shop-attr-menu-heading");
    heading.append(chosenTitle,chevron);
    const chosenDescription=el("small","shop-attr-menu-desc");
    summary.append(heading,chosenDescription);
    const list=el("div","shop-attr-menu-list");
    list.setAttribute("role","group");list.setAttribute("aria-label",label);
    function paint(){
      const current=items.find(item=>item[0]===selected())||items[0];
      chosenTitle.textContent=current[1];chosenDescription.textContent=current[2];
      list.replaceChildren();
      for(const [id,title,description] of items){
        const active=id===current[0];
        const option=el("button","shop-attr-choice"+(active?" is-selected":""));
        option.type="button";option.setAttribute("aria-pressed",String(active));
        const head=el("span","shop-attr-choice-heading");
        head.append(el("span","shop-attr-choice-check",active?"✓":""));
        head.append(el("span","shop-attr-choice-title",title));
        option.append(head,el("span","shop-attr-choice-desc",description));
        option.addEventListener("click",()=>{
          details.open=false;
          if(id!==selected()){onChange(id);paint();}
        });
        list.append(option);
      }
    }
    details.append(summary,list);
    field.append(details);
    paint();
    return {field,details,paint};
  }
  document.addEventListener("click",event=>{
    for(const open of document.querySelectorAll(".shop-attr-menu[open]")){
      if(!open.contains(event.target))open.open=false;
    }
  });
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
    const titleRow=el("div","shop-attr-title-row");
    const logo=el("span","shop-attr-shopify-icon");
    logo.setAttribute("role","img");logo.setAttribute("aria-label","Shopify");
    logo.innerHTML='<svg viewBox="0 0 24 26" width="20" height="21" aria-hidden="true"><path fill="#87B938" d="M2 5 18 2 22 7 21 24 2 26z"/><path fill="#496C19" d="M18 2 22 7 18 9z"/><path d="M10 3c0-4 6-3 6 3M7 5c0-5 7-6 7 0" fill="none" stroke="#fff" stroke-width="1.5"/><text x="7.7" y="19" font-size="13" font-family="Arial,sans-serif" font-weight="900" fill="white" transform="rotate(-7 11 15)">S</text></svg>';
    titleRow.append(logo,el("h3","","Shopify Attribution"));
    const header=el("div","shop-attr-heading");
    const filters=el("div","shop-attr-filters");
    const modelMenu=createChoiceMenu("Attribution model",MODELS,()=>state.model,v=>{state.model=v;state.limit=12;load();});
    const trafficMenu=createChoiceMenu("Traffic type",TRAFFIC,()=>state.traffic,v=>{state.traffic=v;state.limit=12;load();});
    const storeLabel=el("label","shop-attr-filter shop-attr-store");
    storeLabel.append(el("span","shop-attr-filter-label","Source store"));
    const storeSelect=el("select","shop-attr-select");
    storeSelect.add(new Option("All stores","all"));
    storeSelect.addEventListener("change",()=>{state.store=storeSelect.value;load();});
    storeLabel.append(storeSelect);
    filters.append(modelMenu.field,trafficMenu.field,storeLabel);
    header.append(titleRow,filters);
    const message=el("p","shop-attr-message");
    const scroller=el("div","shop-attr-scroll");
    const table=el("table","shop-attr-table");
    const thead=el("thead"),headrow=el("tr");
    const columns=[["channel","Marketing Channel"],["traffic","Traffic Type"],["sessions","Sessions"],["orders","Attributed Orders"],["sales","Attributed Sales"],["checkouts","Converted Sessions (Last Click)"],["conversionRate","Shopify Native Conversion Rate"]];
    for(const [key,label] of columns){
      const th=el("th",key==="channel"?"shop-attr-primary-col":""),button=el("button","shop-attr-sort",label);button.type="button";
      button.onclick=()=>{state.descending=state.sort===key?!state.descending:true;state.sort=key;draw();};
      th.append(button);headrow.append(th);
    }
    thead.append(headrow);const tbody=el("tbody");table.append(thead,tbody);scroller.append(table);
    const more=el("button","btn shop-attr-more","Load more");more.type="button";more.onclick=()=>{state.limit+=12;draw();};
    const note=el("p","shop-attr-note","Converted Sessions (Last Click) counts sessions where checkout was completed in that visit; it is not a last-click attributed order metric. Sessions and native conversion rate do not depend on the attribution model. Any click may credit an order to multiple channels; Linear may show fractional orders.");
    panel.replaceChildren(header,message,scroller,more,note);
    let current=null;
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
        const values=[row.channel,row.traffic,number(row.sessions),number(row.orders),money(row.sales),number(row.checkouts),percentage(row.conversionRate)];
        values.forEach((v,i)=>tr.append(el("td",i===0?"shop-attr-primary-col":i>=2?"shop-attr-numeric":"",v)));
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
        message.textContent=data.matchedRows?(range.start&&range.end?range.start+" to "+range.end+" · ":"")+data.matchedRows+" attribution rows":"No attribution data for the selected dates and filters.";
        draw();
      }catch(error){
        if(request!==state.request)return;
        current={channels:[]};
        message.textContent="Unable to load Shopify Attribution Data: "+(error?.message||String(error));
        draw();
      }
    }
    load();
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
  // The former Channels intro described the retired first-visit order report.
  // Remove that stale copy without changing the Channels navigation label.
  function removeLegacyChannelsIntro(){
    const root=document.getElementById("content");
    if(!root)return;
    const legacy="First-visit order attribution from Order Tracking Details; sessions and conversion rates are not first-click attributed";
    for(const node of root.querySelectorAll("p,small,.hint,.subtitle,.subheading")){
      if(node.textContent.trim()===legacy)node.remove();
    }
  }
  let scheduled=false;
  function scan(){
    scheduled=false;
    if(typeof page!=="undefined"&&page!=="Channels")return;
    removeLegacyChannelsIntro();
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