/* V11: Restore real Channels sessions/conversion and single Paid Ads attribution selector. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const number=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const cash=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":typeof money==="function"?money(Number(v)):number(v)+" EGP";
const percent=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":(Number(v)*100).toFixed(2)+"%";
const esc11=v=>{const t=document.createElement("span");t.textContent=String(v??"");return t.innerHTML;};
const iconSvg={shopify:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 15-2 2 16-18 1z" fill="#83b83b"/><text x="8" y="18" fill="white" font-size="10" font-weight="900">S</text></svg>',meta:'<svg viewBox="0 0 32 22" aria-hidden="true"><path d="M2 16C6 4 9 3 12 7c5 6 8 13 13 8 3-3 4-9 6-9" fill="none" stroke="#1877f2" stroke-width="3" stroke-linecap="round"/></svg>',bosta:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h13v12H2zM15 10h4l3 4v3h-7z" fill="none" stroke="#e17e38" stroke-width="2"/><circle cx="7" cy="18" r="2" fill="#e17e38"/><circle cx="19" cy="18" r="2" fill="#e17e38"/></svg>'};
let paidModel="first",channelModel="shopify",renderLock=false;
function kpi(title,value,hint,sources){
 if(typeof card!=="function")return null;
 const t=document.createElement("template");
 t.innerHTML=card(title,value,hint);
 const el=t.content.querySelector(".kpi");if(!el)return null;
 el.dataset.ultraMetric=title;
 el.classList.add("ultra-overview-card","ultra-v11-card");
 const heading=el.querySelector(".kt");
 heading?.querySelectorAll(".ultra-source-collection,.ultra-source-mark,.source-brand-icon").forEach(i=>i.remove());
 if(heading){
  const icons=document.createElement("span");icons.className="ultra-source-collection ultra-v11-icons";
  for(const name of new Set(sources||["shopify"])){
   const badge=document.createElement("span");badge.className="ultra-source-mark";badge.title="Source: "+name;
   badge.innerHTML=iconSvg[name]||"";icons.append(badge);
  }
  heading.append(icons);
 }
 return el;
}
function slot(parent,items){
 const row=document.createElement("div");row.className="ultra-overview-row ultra-v11-paid-grid";
 items.filter(Boolean).forEach(x=>row.append(x));parent.append(row);return row;
}
function titleFix(){
 const wrap=$(".ultra-overview-v10");if(!wrap)return;
 for(const el of wrap.querySelectorAll(".kpi")){
  const header=el.querySelector(".kt");
  if(!header)continue;
  // Keep a single right-hand group of source icons, never duplicate left-side icons.
  const groups=[...header.querySelectorAll(".ultra-source-collection")];
  groups.slice(1).forEach(x=>x.remove());
  header.querySelectorAll(":scope > .ultra-source-mark,:scope > .source-brand-icon").forEach(x=>x.remove());
  const source=groups[0];
  if(source)source.classList.add("ultra-v11-icons");
  const title=el.dataset.ultraMetric;
  const existing=(header.childNodes[0]?.nodeType===Node.TEXT_NODE?header.childNodes[0].textContent:"").trim();
  if(title && !existing)header.prepend(document.createTextNode(title));
  if(title==="Total Sessions"&&!header.textContent.includes("Total Sessions"))header.prepend(document.createTextNode("Total Sessions"));
 }
}
function aliases(){
 if(typeof sparkSpecs!=="undefined"){
  Object.assign(sparkSpecs,{
   "Meta Total Orders":["metric",paidModel==="last"?"ultra11sheetOrders":"ultra11firstOrders"],
   "Meta Total Sales":["metric",paidModel==="last"?"ultra11lastSales":"ultra11firstSales"],
   "Meta Delivered Sales":["metric",paidModel==="last"?"ultra11lastDeliveredSales":"ultra11firstDeliveredSales"],
   "Meta Delivered Orders":["metric",paidModel==="last"?"ultra11lastDeliveredOrders":"ultra11firstDeliveredOrders"],
   "Meta Delivery Rate":["metric",paidModel==="last"?"ultra11lastDeliveryRate":"ultra11firstDeliveryRate"],
   "Meta Orders / Purchases":["ads","purchases"],
   "Meta Cost Per Order":["meta","costPerOrder"],
   "Meta Actual Cost Per Order":["meta","actualCostPerOrder"]
  });
 }
}
function attribution(){
 const data=typeof dashboard!=="undefined"?dashboard:null;
 return data?.ultra11SessionReport||{};
}
function paintPaid(){
 const root=$(".ultra-overview-v10 .ultra-paid");
 if(!root||typeof dashboard==="undefined")return;
 const m=dashboard.metrics||{},ad=dashboard.adFunnel||{},details=attribution();
 let row=root.querySelector(".ultra-v11-paid-grid");
 let controls=root.querySelector(".ultra-v11-select");
 if(!controls){
  const heading=root.querySelector(".ultra-overview-heading");
  if(!heading)return;
  const select=document.createElement("select");
  select.className="ultra-v11-select btn";
  select.setAttribute("aria-label","Paid Ads attribution model");
  [["first","Meta Attributed Orders by Shopify First Click"],["last","Meta Attributed Orders by Shopify Last Click"],["meta","Meta Attributed Orders by Meta records itself"]].forEach(([value,label])=>{
   const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);
  });
  select.value=paidModel;
  select.addEventListener("change",()=>{
   paidModel=select.value;
   paintPaid();
  });
  heading.append(select);controls=select;
 }
 let area=root.querySelector(".ultra-v11-paid-list");
 if(!area){root.querySelector(".ultra-paid-split")?.remove();area=document.createElement("div");area.className="ultra-v11-paid-list";root.append(area);}
 aliases();
 const isMeta=paidModel==="meta";
 const raw=details[paidModel]||{};
 const sheetOrder=details.lastClickShopifyOrders;
 // ShopifyQL aggregate Orders are last-click only; first click comes from qualified order-level UTM history.
 const reportedOrders=isMeta?ad.metaPurchases:paidModel==="last"?(sheetOrder??raw.orders):raw.orders;
 const delivered=isMeta?null:raw.deliveredOrders;
 const cpa=isMeta?ad.metaCpa:Number(reportedOrders)>0?Number(m.advertisingSpend)/Number(reportedOrders):null;
 const actual=isMeta?null:Number(delivered)>0?Number(m.advertisingSpend)/Number(delivered):null;
 const stable=[
  kpi("Meta Total Spend",cash(m.advertisingSpend),"Meta Ads spend from Meta reporting",["meta"]),
  kpi("Delivery Rate",percent(m.deliveryRate),"All Shopify orders: delivered / (delivered + returned); unchanged by attribution selection",["shopify","bosta"])
 ];
 const change=isMeta?[
   kpi("Meta Orders / Purchases",number(ad.metaPurchases),"Meta-reported purchase events",["meta"]),
   kpi("Meta CPA",cash(ad.metaCpa),"Meta spend / Meta purchase events",["meta"])
 ]:[
   kpi("Meta Total Sales",cash(raw.sales),"Sales from order-level "+paidModel+"-click paid Meta UTMs",["shopify"]),
   kpi("Meta Total Orders",number(reportedOrders),paidModel==="last"?
      "Shopify Sessions Data: Paid Facebook + Instagram orders (ShopifyQL last click)":"First-click qualified paid Meta orders from Shopify UTMs",["shopify"]),
   kpi("Meta Delivered Sales",cash(raw.deliveredSales),"Delivered revenue from matched order-level Shopify UTMs",["shopify","bosta"]),
   kpi("Meta Delivered Orders",number(delivered),"Delivered attributed Shopify orders",["shopify","bosta"]),
   kpi("Meta Delivery Rate",percent(raw.deliveryRate),"Attributed delivered / (attributed delivered + returned)",["shopify","bosta"]),
   kpi("Meta Cost Per Order",cash(cpa),"Meta spend / attributed Shopify orders",["meta","shopify"]),
   kpi("Meta Actual Cost Per Order",cash(actual),"Meta spend / delivered attributed Shopify orders",["meta","shopify"])
 ];
 area.replaceChildren();
 slot(area,stable.concat(change));
 let note=root.querySelector(".ultra-v11-paid-note");
 if(!note){note=document.createElement("p");note.className="ultra-v11-paid-note";root.append(note);}
 note.textContent=isMeta?
  "Meta reports purchase events, not individual Shopify orders. Delivered sales/orders are unavailable in Meta records; global Shopify delivery rate remains visible.":
  paidModel==="last"?
  "Shopify Sessions Data supplies aggregate last-click paid Meta orders. Revenue and delivery use order-level last-visit UTMs; their attribution bases may differ. The sheet does not expose individual last-click order IDs.":
  "First click uses order-level Shopify first-visit UTMs with the existing campaign-matching rule. Shopify Sessions Data has no separate first-click orders field.";
 // Keep user choice while date filters or period comparisons rerender.
 aliases();
}
function channelRows(){
 const dashboardData=typeof dashboard!=="undefined"?dashboard:null;
 const raw=dashboardData?.channelAnalysis||[];
 const visit=dashboardData?.orderVisitChannelAnalysis||[];
 const normalize=v=>String(v||"").toLowerCase().replace(/\s+/g," ").trim();
 const map=new Map(visit.map(x=>[normalize(x.name),x]));
 return raw.map(x=>{
  const key=normalize(x.source+" · "+x.medium);
  const linked=map.get(key)||{};
  const sessions=Number(x.sessions)||0;
  const orders=channelModel==="shopify"?(x.ordersAvailable?Number(x.shopifyOrders):null):
   channelModel==="first"?Number(linked.firstOrders||0):Number(linked.lastOrders||0);
  return {source:x.source,medium:x.medium,sessions,orders,rate:orders!==null&&sessions>0?orders/sessions:null};
 });
}
function renderChannelPanel(){
 if(typeof page==="undefined"||page!=="Channels")return;
 const root=$("#content");if(!root||typeof dashboard==="undefined")return;
 const heading=[...root.querySelectorAll("section.panel h3")].find(h=>h.textContent.includes("Channel Analysis"));
 if(!heading)return;
 const panel=heading.closest("section.panel");if(!panel)return;
 const selector=panel.querySelector("#source-attribution");
 if(selector){
  selector.replaceChildren();
  [["shopify","ShopifyQL Last Click (Sessions Data)"],["first","First Click (Order UTMs)"],["last","Last Click (Order UTMs)"]].forEach(([value,label])=>{
   const o=document.createElement("option");o.value=value;o.textContent=label;selector.append(o);
  });
  selector.value=channelModel;
  selector.onchange=()=>{channelModel=selector.value;refreshChannelData(panel);};
 }
 refreshChannelData(panel);
}
function refreshChannelData(panel){
 const rows=channelRows().sort((a,b)=>b.sessions-a.sessions||String(a.source).localeCompare(String(b.source)));
 const tbody=panel.querySelector(".channel-analysis-table tbody");if(!tbody)return;
 let visible=8;
 function draw(){
  tbody.innerHTML=rows.slice(0,visible).map(r=>'<tr><td><strong>'+esc11(r.source)+'</strong> <small>'+esc11(r.medium)+'</small></td><td class="channel-number">'+number(r.orders)+'</td><td class="channel-number">'+number(r.sessions)+'</td><td class="channel-number">'+percent(r.rate)+'</td></tr>').join("")||'<tr><td colspan="4">No Shopify Sessions Data for the selected period.</td></tr>';
  const old=panel.querySelector("#more-channel-orders");old?.remove();
  if(visible<rows.length){const button=document.createElement("button");button.id="more-channel-orders";button.className="btn analysis-more";button.textContent="Load more";button.onclick=()=>{visible+=8;draw()};panel.append(button);}
 }
 draw();
 const h=panel.querySelector(".hint");if(h)h.textContent="Sessions: Shopify Sessions Data (Source + Medium). "+(channelModel==="shopify"?"Orders: ShopifyQL aggregate last click.":"Orders: Order Tracking Details "+channelModel+"-visit attribution; these orders are not from Shopify Sessions Data.")+" Conversion = orders ÷ sessions.";
}
function apply(){
 if(typeof page==="undefined")return;
 if(page==="Overview"){
  aliases();titleFix();
  if($(".ultra-overview-v10 .ultra-paid"))paintPaidGuarded();
 }else if(page==="Channels" && !$("#source-attribution")?.dataset.ultraV11Bound){
  renderChannelPanel();
  const sel=$("#source-attribution");if(sel)sel.dataset.ultraV11Bound="1";
 }
}
let lastDashboard=null,lastPage="";
function paintPaidGuarded(){
 const section=$(".ultra-overview-v10 .ultra-paid");
 if(!section)return;
 if(section.dataset.ultraV11Dashboard!==String(dashboard?.generatedAt||"") || !section.querySelector(".ultra-v11-paid-list")){
  section.dataset.ultraV11Dashboard=String(dashboard?.generatedAt||"");
  paintPaid();
 }
}
let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
function start(){
 const root=$("#content");if(!root)return;
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();