// Applied after the dashboard's original inline script has loaded.
(function(){
  const originalAdFunnel=renderAdFunnel;
  const decorateChart=(name)=>{
    const original=window[name];
    if(typeof original!=="function")return;
    window[name]=function(...args){
      return String(original.apply(this,args)).replaceAll('<b>EGP ', '<b><small class="meta-spend-label">Spend</small>EGP ');
    };
  };
  decorateChart("renderMetaPlatformAnalysis");
  decorateChart("renderMetaPlacementAnalysis");

  function polishDailyMetaTable(){
    const table=document.querySelector(".daily-meta-sticky-date");
    if(!table||table.dataset.polished==="1"||!table.tHead||!table.tBodies.length)return;
    table.dataset.polished="1";
    const panel=table.closest(".panel");
    if(!panel)return;
    panel.classList.add("meta-daily-panel");
    const originalHeaders=Array.from(table.tHead.rows[0].cells);
    const headerByName=new Map(originalHeaders.map((cell,index)=>[cell.textContent.trim(),index]));
    if(!headerByName.has("Date")||!headerByName.has("Ad Spend"))return;
    const byDate=new Map((dashboard?.adFunnel?.daily||[]).map(r=>[String(r.date||""),r]));
    const purchaseByDate=new Map((dashboard?.funnelDays?.ads||[]).map(r=>[String(r.date||""),Number(r.purchases)||0]));
    const messageByDate=new Map();
    for(const r of dashboard?.metaExplorerRows||[]){
      if(!r.date||r.messages==null||!Number.isFinite(Number(r.messages)))continue;
      const prior=messageByDate.get(String(r.date))||0;
      messageByDate.set(String(r.date),prior+Number(r.messages));
    }
    const money=n=>Number.isFinite(n)?"EGP "+n.toLocaleString("en-US",{maximumFractionDigits:0,minimumFractionDigits:0}):"—";
    const messageTotal=[...messageByDate.values()].reduce((s,n)=>s+n,0);
    const groups=[
      {name:"SPEND & RESULTS",className:"meta-daily-spend",labels:["Ad Spend","CPA (Meta)","Messages","Meta purchases"]},
      {name:"AD PERFORMANCE",className:"meta-daily-media",labels:["CTR (Meta Sales)","CPM (Meta Sales)","Link clicks","Landing page views","Views / clicks"]},
      {name:"CONVERSION FUNNEL",className:"meta-daily-funnel",labels:["Add to carts","Carts / views","Checkouts","Checkouts / carts","Purchases / checkouts"]},
      {name:"SHOPIFY OUTCOMES",className:"meta-daily-shopify",labels:["Meta Ads Orders (Shopify)","Meta Ads Delivered Orders (Shopify)","Cost per Order","Actual Cost per Order","Meta Ads Delivery Rate","Meta Organic Orders (first click)"]},
      {name:"CUSTOMER QUALITY",className:"meta-daily-quality",labels:["AOV","Avg Session Duration (GA4)","Avg Engagement Time (GA4)","Avg Visited Pages Per Session","Avg Days to Convert","Avg Sessions to Convert"]}
    ];
    const order=["Date"];
    for(const group of groups)for(const label of group.labels)if(headerByName.has(label)||label==="CPA (Meta)"||label==="Messages")order.push(label);
    const unseen=originalHeaders.map(c=>c.textContent.trim()).filter(x=>!order.includes(x));
    if(unseen.length){groups.push({name:"OTHER",className:"meta-daily-other",labels:unseen});order.push(...unseen);}
    const headerNodes=order.map((label)=>{
      if(headerByName.has(label))return originalHeaders[headerByName.get(label)];
      const th=document.createElement("th");th.textContent=label;th.title=label==="CPA (Meta)"?"Meta ad spend divided by Meta-reported purchases":"Meta-reported messaging conversations started";return th;
    });
    for(const tr of Array.from(table.tBodies[0].rows)){
      const cells=Array.from(tr.cells);
      if(!cells.length||!cells[0])continue;
      const date=cells[0].textContent.trim();
      const daily=byDate.get(date);
      const spend=Number(daily?.spend);
      const purchases=purchaseByDate.get(date)||0;
      const cpa=(daily&&Number.isFinite(spend)&&purchases>0)?spend/purchases:null;
      const special=(label)=>{
        const td=document.createElement("td");td.className="meta-daily-extra";
        if(label==="CPA (Meta)")td.textContent=cpa===null?"—":money(cpa);
        else td.textContent=messageByDate.has(date)?Math.round(messageByDate.get(date)).toLocaleString("en-US"):"—";
        return td;
      };
      tr.replaceChildren(...order.map(label=>headerByName.has(label)?cells[headerByName.get(label)]:special(label)));
    }
    const top=document.createElement("tr");top.className="meta-daily-groups";
    const dateHeader=headerNodes[0];dateHeader.rowSpan=2;dateHeader.classList.add("meta-daily-date");
    top.appendChild(dateHeader);
    const bottom=document.createElement("tr");bottom.className="meta-daily-headings";
    let offset=1;
    for(const group of groups){
      const cells=group.labels.filter(label=>order.includes(label));
      if(!cells.length)continue;
      const th=document.createElement("th");th.colSpan=cells.length;th.textContent=group.name;th.className=group.className;
      top.appendChild(th);
      for(const label of cells){
        const node=headerNodes[offset++];node.classList.add(group.className);
        if(label==="Cost per Order")node.textContent="CPA (Shopify)";
        if(label==="Actual Cost per Order")node.textContent="Delivered CPA (Shopify)";
        bottom.appendChild(node);
      }
    }
    table.tHead.replaceChildren(top,bottom);
    const outer=document.createElement("div");outer.className="meta-daily-scroller";
    table.parentElement.insertBefore(outer,table);
    outer.appendChild(table);
    const dailyRows=Array.from(byDate.values());
    const spendTotal=dailyRows.reduce((s,r)=>s+(Number(r.spend)||0),0);
    const purchasesTotal=[...purchaseByDate.values()].reduce((s,n)=>s+n,0);
    const summary=document.createElement("div");summary.className="meta-daily-summary";
    const values=[
      ["Ad spend",money(spendTotal)],
      ["CPA (Meta)",purchasesTotal?money(spendTotal/purchasesTotal):"—"],
      ["Messages",messageByDate.size?Math.round(messageTotal).toLocaleString("en-US"):"—"],
      ["Meta purchases",purchasesTotal.toLocaleString("en-US")]
    ];
    for(const [label,value] of values){
      const item=document.createElement("div");item.className="meta-daily-summary-item";
      const title=document.createElement("span");title.textContent=label;
      const amount=document.createElement("strong");amount.textContent=value;
      item.append(title,amount);summary.appendChild(item);
    }
    const intro=panel.querySelector("p.hint");
    if(intro)intro.after(summary);else panel.prepend(summary);
    const heading=panel.querySelector("h3");if(heading)heading.textContent="Daily Meta Ads performance";
  }
  renderAdFunnel=function(...args){
    const value=originalAdFunnel.apply(this,args);
    polishDailyMetaTable();
    return value;
  };
})();