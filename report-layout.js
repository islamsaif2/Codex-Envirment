/* Ultramedix report reorganizations, after all previous enhancements. */
(function(){
"use strict";
const findHeading=(root,title)=>[...root.querySelectorAll("h2,h3,h4")].find(x=>x.textContent.trim().toLowerCase()===title.toLowerCase());
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const asNumber=v=>Number.isFinite(Number(v))?Number(v):null;
const fmtNum=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const moneyNum=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":typeof money==="function"?money(Number(v)):fmtNum(v)+" EGP";
const percent=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":(Number(v)*100).toFixed(1)+"%";
const regionKey=v=>{const key=String(v??"").toLowerCase().trim().replace(/\s+/g," ");return /^(6th of october|6 october|6th october|6 october city|6th of october city)$/.test(key)?"giza":key;};
let regionLimit=25;
function regionPanel(){
  const data=typeof dashboard==="undefined"?null:dashboard;
  const source=data?.regionsAnalysis||[];
  const sales=new Map();
  for(const r of data?.regionPerformance||[]){
    const key=regionKey(r.region),old=sales.get(key)||{revenue:0,deliveredOrders:0};
    old.revenue+=Number(r.revenue)||0;
    old.deliveredOrders+=Number(r.deliveredOrders)||0;
    old.averageOrderValue=old.deliveredOrders?old.revenue/old.deliveredOrders:null;
    sales.set(key,old);
  }
  const duration=new Map();
  for(const r of data?.demographics?.deliveryDurations||[]){
    const key=regionKey(r.region),v=duration.get(key)||{minutes:0,count:0};
    if(Number.isFinite(r.averageMinutes)&&Number.isFinite(r.count)){v.minutes+=r.averageMinutes*r.count;v.count+=r.count;}
    duration.set(key,v);
  }
  const panel=node("section","panel ultra-report-region");
  panel.append(node("h2","","Region Analysis"));
  panel.append(node("p","hint","Shipping-region order and delivery data combined with GA4 sessions by standardized region. Missing values are shown as —; no rates or revenue are estimated."));
  const keys=["Region","Delivery Rate","Delivered Orders","Delivered Sales","Sessions","Conversion Rate","AOV","Orders","Avg Days to Convert","Avg Sessions to Convert","Avg Session Duration","Creation → Delivery","Bounce Rate","New Customers","Returning Customers"];
  const wrap=node("div","ultra-region-scroll");
  const table=node("table","insight-table ultra-region-table");
  const head=node("thead"),hr=node("tr");
  for(const label of keys)hr.append(node("th","",label));
  head.append(hr);table.append(head);
  const body=node("tbody");
  const normalized=source.map(r=>{
    const info=sales.get(regionKey(r.region))||{};
    const d=duration.get(regionKey(r.region));
    const durationMinutes=r.averageDeliveryMinutes??(d?.count?d.minutes/d.count:null);
    return [
      r.region,percent(r.deliveryRate),fmtNum(r.deliveredOrders),
      moneyNum(r.deliveredSales??info.revenue),
      fmtNum(r.sessions),percent(r.conversionRate),
      moneyNum(r.averageOrderValue??info.averageOrderValue),
      fmtNum(r.orders),fmtNum(r.averageDaysToConvert),
      fmtNum(r.averageSessionsToConvert),
      r.averageSessionDuration==null?"—":fmtNum(r.averageSessionDuration)+" sec",
      durationMinutes==null?"—":fmtNum(durationMinutes/1440)+" days",
      percent(r.bounceRate),fmtNum(r.newCustomers),fmtNum(r.returningCustomers)
    ];
  });
  const draw=()=>{
    body.replaceChildren();
    for(const values of normalized.slice(0,regionLimit)){
      const tr=node("tr");
      for(const value of values)tr.append(node("td","",value));
      body.append(tr);
    }
    if(!source.length){const tr=node("tr"),td=node("td","","No regional data for this period.");td.colSpan=keys.length;tr.append(td);body.append(tr);}
    load.hidden=regionLimit>=normalized.length;
    load.textContent="Load more ("+Math.max(0,normalized.length-regionLimit)+" remaining)";
  };
  table.append(body);wrap.append(table);panel.append(wrap);
  const load=node("button","btn ultra-region-more");load.type="button";load.onclick=()=>{regionLimit+=25;draw();};panel.append(load);
  draw();return panel;
}
function shipping(){
  if(typeof page==="undefined"||page!=="Shipping and operation Analysis")return;
  const root=document.getElementById("content");if(!root)return;
  // Remove both old, redundant regional reports.
  for(const title of ["Shipping outcomes by region","Revenue by region"]){
    const h=findHeading(root,title);
    if(h)(h.closest("section.panel")||h.closest(".panel")||h.closest("section"))?.remove();
  }
  const grid=root.querySelector(".shipping-grid");
  const originalStages=findHeading(root,"Shipping Stages")?.closest("section.panel");
  const reasons=findHeading(root,"Cancellation Reasons")?.closest("section.panel");
  const firstHead=root.querySelector(":scope > .section-head");
  if(!grid||!firstHead)return;
  const h=firstHead.querySelector("h2");if(h)h.textContent="Shipping and Operations";
  firstHead.querySelector("p")?.remove();
  root.querySelector(":scope > .banner")?.remove();
  const region=regionPanel();
  firstHead.after(region);
  const cardsHead=node("h2","ultra-report-section-title","Operations Metrics");
  region.after(cardsHead);
  // Stage card was nested inside metrics grid; move it to section three.
  if(originalStages)originalStages.remove();
  const stages=node("section","ultra-report-stages");
  stages.append(node("h2","ultra-report-section-title","Shipping and warehouse stages"));
  if(originalStages){originalStages.querySelector("h3")?.remove();stages.append(originalStages);}
  else stages.append(node("p","hint","No warehouse-stage data for these dates."));
  grid.after(stages);
  if(reasons){
    const heading=findHeading(reasons,"Cancellation Reasons");if(heading)heading.textContent="Cancellation reasons";
    stages.after(reasons);
  }
  if(typeof bindMetricDetails==="function")bindMetricDetails();
}
function customer(){
  if(typeof page==="undefined"||page!=="Customer Analysis & Retention")return;
  const root=document.getElementById("content");if(!root)return;
  const firstGrid=root.querySelector(":scope > section.grid");
  const model=typeof dashboard==="undefined"?null:dashboard;
  if(firstGrid&&model?.metrics&&typeof card==="function"){
    // A real Total Sales card, with its existing comparison series and click-through.
    const tpl=document.createElement("template");
    tpl.innerHTML=card("Total Sales",moneyNum(model.metrics.totalSales),"Total Shopify sales for all orders in the selected date range");
    const added=tpl.content.querySelector(".kpi");
    if(added)firstGrid.prepend(added);
  }
  const orderSection=findHeading(root,"Orders by customer type")?.closest("section.panel");
  const customerPanel=findHeading(root,"New vs returning customers")?.closest(".panel");
  if(orderSection&&customerPanel){
    const existing=orderSection.querySelectorAll(".kpi");
    const move=[...existing].filter(c=>/^(New customer orders|Returning customer orders|Orders without customer ID)\b/i.test(c.querySelector(".kt")?.textContent.trim()||""));
    if(move.length){
      const group=node("div","ultra-customer-order-cards");
      move.forEach(c=>group.append(c));
      customerPanel.append(group);
    }
    orderSection.remove();
  }
  const revenuePanel=findHeading(root,"Female vs Male by Delivered Revenue")?.closest(".panel");
  const ratePanel=findHeading(root,"Female vs Male by Delivery Rate")?.closest(".panel");
  if(revenuePanel&&ratePanel){
    const extra=node("div","ultra-gender-rate");
    extra.append(node("h4","","Female vs Male by Delivery Rate"));
    [...ratePanel.children].filter(x=>!/^H3$/i.test(x.tagName)).forEach(x=>extra.append(x));
    const genderRow=revenuePanel.parentElement;
    revenuePanel.append(extra);ratePanel.remove();
    if(genderRow)genderRow.classList.add("ultra-gender-combined");
  }
  // The region table now lives in Shipping and Operations.
  findHeading(root,"Regions Analysis")?.closest("section.panel")?.remove();
  if(typeof bindMetricDetails==="function")bindMetricDetails();
}
const brandIcons={
  meta:'<svg viewBox="0 0 32 20" width="15" height="13" aria-hidden="true"><path d="M2 14C5 4 9 2 13 7c4 5 7 11 11 9 3-2 4-9 6-9" fill="none" stroke="#1877f2" stroke-width="3" stroke-linecap="round"/></svg>',
  shopify:'<svg viewBox="0 0 24 25" width="14" height="14" aria-hidden="true"><path d="m3 5 16-3 3 5-1 16-18 1z" fill="#81b441"/><text x="8" y="18" font-size="11" font-weight="900" fill="#fff">S</text></svg>',
  bosta:'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M2 5h13v12H2zM15 10h4l3 4v3h-7z" fill="none" stroke="#de7937" stroke-width="2"/><circle cx="7" cy="18" r="2" fill="#de7937"/><circle cx="19" cy="18" r="2" fill="#de7937"/></svg>',
  ga4:'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="5" cy="17" r="3.2" fill="#f9ab00"/><rect x="10" y="4" width="5" height="16" rx="2.5" fill="#e37400"/><rect x="17" y="10" width="5" height="10" rx="2.5" fill="#f9ab00"/></svg>'
};
function sourcesFor(title){
  const s=title.toLowerCase();
  if(/session duration|engagement time|visited pages|pages per session|bounce rate/.test(s))return ["ga4"];
  if(/days to convert|sessions to convert/.test(s))return ["shopify"];
  if(/delivered orders \(shopify\)|actual cost per order|delivery rate/.test(s))return ["meta","shopify","bosta"];
  if(/meta ads orders \(shopify\)|meta organic orders/.test(s))return ["shopify"];
  if(/cost per order/.test(s))return ["meta","shopify"];
  if(/\baov\b/.test(s))return ["meta"];
  if(/shopify|attributed/.test(s))return ["shopify"];
  return ["meta"];
}
function ads(){
  if(typeof page==="undefined"||page!=="Ads")return;
  const root=document.getElementById("content");if(!root)return;
  root.querySelector(":scope > .banner")?.remove();
  const header=root.querySelector(":scope > .section-head");
  if(header){const title=findHeading(header,"Advertising conversion funnel");title?.remove();
    [...header.querySelectorAll("p")].filter(x=>/Ad metrics come from Meta Ads|attributed orders and revenue/i.test(x.textContent)).forEach(x=>x.remove());}
  // Remove outdated introductory text, not the actual funnel or date controls.
  const daily=findHeading(root,"Daily Meta Ads performance")?.closest("section.panel");
  if(daily){
    [...daily.querySelectorAll("p.hint")].filter(x=>/first-click attribution/i.test(x.textContent)).forEach(x=>x.remove());
    const heads=[...daily.querySelectorAll("thead tr:last-child th")];
    for(const th of heads.slice(1)){
      if(th.querySelector(".ultra-source-icons"))continue;
      const names=sourcesFor(th.textContent.trim());
      const icons=node("span","ultra-source-icons");
      icons.setAttribute("role","img");
      icons.setAttribute("aria-label","Source: "+names.join(", "));
      icons.title="Source: "+names.join(" + ");
      for(const name of names){
        const mark=node("span","ultra-source-icon");mark.innerHTML=brandIcons[name];icons.append(mark);
      }
      th.append(icons);
    }
  }
  // The old first-click-only rule no longer describes the Meta-only Overview selector.
  const rule=findHeading(root,"Shopify attribution rule")?.closest("section.panel");
  if(rule)rule.remove();
  const sequence=findHeading(root,"Advertising conversion sequence")?.closest("section.panel");
  if(sequence){[...sequence.querySelectorAll("p.hint")].filter(x=>/first.click/i.test(x.textContent)).forEach(x=>x.remove());}
}
function chartMappings(){
  if(typeof sparkSpecs==="undefined")return;
  const adds={
    "AVG orders per day":["metric","orders"],
    "Avg Orders per Day":["metric","orders"],
    "Delivered":["metric","deliveredOrders"],
    "Returned to business":["metric","returnedOrders"],
    "Canceled Orders (Before Pickup)":["metric","cancelledBeforePickupOrders"],
    "New customers":["metric","newOrders"],
    "Average engagement time":["ga","avgEngagementTime"],
    "Landing page views (Meta)":["meta","landingPageViews"],
    "Conversion rate (Meta)":["ads","purchases/landing"],
    "Meta Orders / Purchases":["ads","purchases"]
  };
  for(const [name,spec] of Object.entries(adds))if(!sparkSpecs[name])sparkSpecs[name]=spec;
}
chartMappings();
if(typeof renderShippingAnalysis==="function"){
 const base=renderShippingAnalysis;
 renderShippingAnalysis=function(...args){const r=base.apply(this,args);shipping();return r;};
}
if(typeof renderCustomerAnalysis==="function"){
 const base=renderCustomerAnalysis;
 renderCustomerAnalysis=function(...args){const r=base.apply(this,args);customer();return r;};
}
if(typeof renderAdFunnel==="function"){
 const base=renderAdFunnel;
 renderAdFunnel=function(...args){const r=base.apply(this,args);ads();return r;};
}
})();