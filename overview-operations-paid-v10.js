/* Ultramedix V10 Overview-only layout. No changes to existing tab rendering. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const text=x=>String(x??"");
const fmt=x=>Number.isFinite(Number(x))?Number(x).toLocaleString("en-US",{maximumFractionDigits:2}):"N/A";
const cash=x=>Number.isFinite(Number(x))?(typeof money==="function"?money(Number(x)):fmt(x)+" EGP"):"N/A";
const rate=x=>Number.isFinite(Number(x))?(typeof pct==="function"?pct(Number(x)):(Number(x)*100).toFixed(1)+"%"):"N/A";
const icons={
 shopify:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 15-2 2 16-18 1z" fill="#83b83b"/><path d="M9 9V6c0-4 6-4 6 0v2" stroke="#47751a" stroke-width="1.5" fill="none"/><text x="8" y="18" fill="white" font-size="10" font-weight="900">S</text></svg>',
 meta:'<svg viewBox="0 0 32 22" aria-hidden="true"><path d="M2 16C5 6 8 4 11 6c4 2 7 11 12 11 4 0 7-7 7-10 0-3-3-3-4 0-2 5-6 12-11 12C8 19 7 9 5 9c-1 0-2 3-3 7z" fill="none" stroke="#1877f2" stroke-width="2.7" stroke-linecap="round"/></svg>',
 bosta:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h13v12H2zM15 10h4l3 4v3h-7z" fill="none" stroke="#e17e38" stroke-width="1.8"/><circle cx="7" cy="18" r="2" fill="#e17e38"/><circle cx="19" cy="18" r="2" fill="#e17e38"/></svg>',
 ga4:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="18" r="3" fill="#f9ab00"/><rect x="12" y="3" width="6" height="13" rx="3" fill="#e37400"/><rect x="3" y="10" width="6" height="12" rx="3" fill="#f9ab00"/></svg>'
};
function icon(k){return '<span class="ultra-source-mark ultra-source-'+k+'" title="Source: '+({shopify:"Shopify",meta:"Meta Ads",bosta:"Bosta shipping status",ga4:"Google Analytics 4"}[k]||k)+'">'+(icons[k]||"")+'</span>';}
function aliases(){
 if(typeof sparkSpecs!=="undefined")Object.assign(sparkSpecs,{
 "Delivered Sales":["metric","deliveredRevenue"],"Shipping Cost":["metric","ultraShippingCost"],
 "Shipping Discounts":["metric","ultraShippingDiscount"],"Orders Discounts":["metric","ultraOrderDiscount"],
 "Revenue After Delivery / Ads / Discounts / Shipping":["metric","ultraNetRevenue"],
 "Meta Total Spend":["meta","spend"],"Meta Orders / Purchases":["ads","purchases"],
 "Meta CPA":["special","metaCPA"],
 "Meta Total Sales":["metric","ultraMetaTotalSales"],"Meta Total Orders":["metric","ultraMetaTotalOrders"],
 "Meta Delivered Sales":["metric","ultraMetaDeliveredSales"],"Meta Delivered Orders":["metric","ultraMetaDeliveredOrders"],
 "Meta Delivery Rate":["metric","ultraMetaDeliveryRate"],"Meta Cost Per Order":["meta","costPerOrder"],
 "Meta Actual Cost Per Order":["meta","actualCostPerOrder"],
 "Avg Line Items":["metric","avgLineItems"]});
 if(typeof cardMetricPaths!=="undefined")Object.assign(cardMetricPaths,{
 "Delivered Sales":"metrics.deliveredRevenue","Shipping Cost":"metrics.totalShippingCosts",
 "Shipping Discounts":"metrics.freeShippingDiscounts","Orders Discounts":"metrics.totalOrderDiscounts",
 "Revenue After Delivery / Ads / Discounts / Shipping":"metrics.revenueAfterDeliveryAndAdCosts",
 "Meta Total Spend":"metrics.advertisingSpend","Meta Orders / Purchases":"adFunnel.metaPurchases",
 "Meta CPA":"adFunnel.metaCpa","Meta Total Sales":"metrics.ultraMetaTotalSales",
 "Meta Total Orders":"metrics.ultraMetaTotalOrders","Meta Delivered Sales":"metrics.ultraMetaDeliveredSales",
 "Meta Delivered Orders":"metrics.ultraMetaDeliveredOrders",
 "Meta Delivery Rate":"metrics.ultraMetaDeliveryRate",
 "Meta Cost Per Order":"metrics.costPerOrderAds","Meta Actual Cost Per Order":"metrics.actualCostPerOrderAds"});
}
function title(el){const t=el?.querySelector(".kt");return (t?.childNodes?.[0]?.textContent||"").trim();}
function rename(el,name){if(!el)return;const t=el.querySelector(".kt");if(!t)return;if(t.firstChild)t.firstChild.textContent=name;else t.prepend(document.createTextNode(name));}
function cardElement(label,value,hint,source){
 if(typeof card!=="function")return null;
 const temp=document.createElement("template");
 temp.innerHTML=card(label,value,hint);
 const element=temp.content.querySelector(".kpi");
 if(element)decorate(element,source,label);
 return element;
}
function decorate(element,source,label){
 const header=element.querySelector(".kt");
 if(!header)return;
 if(!header.querySelector(".ultra-source-collection")){
  const span=document.createElement("span");span.className="ultra-source-collection";
  for(const k of source||["shopify"])span.innerHTML+=icon(k);
  header.insertBefore(span,header.firstChild);
 }
 element.dataset.ultraMetric=label;
 element.classList.add("ultra-overview-card");
 // The previous V9 layer attaches the existing detail + comparison behavior.
}
function extractMetricCard(lookup,name,source,renamed){
 const key=name.toLowerCase(),el=lookup.get(key);
 if(!el)return null;lookup.delete(key);
 if(renamed)rename(el,renamed);
 decorate(el,source,renamed||name);
 return el;
}
function section(parent,heading,sub,className){
 const s=document.createElement("section");s.className="ultra-overview-section "+(className||"");
 const h=document.createElement("div");h.className="ultra-overview-heading";
 const title=document.createElement("h2");title.textContent=heading;
 const hint=document.createElement("p");hint.textContent=sub;
 h.append(title,hint);s.append(h);parent.append(s);return s;
}
function grid(parent,elements,className){
 const row=document.createElement("div");row.className="ultra-overview-row "+(className||"");
 elements.filter(Boolean).forEach(el=>row.append(el));
 if(row.children.length)parent.append(row);
 return row;
}
function applyOverview(){
 if(typeof page==="undefined"||page!=="Overview"||typeof dashboard==="undefined"||!dashboard?.metrics)return;
 const root=$("#content");if(!root||root.querySelector(".ultra-overview-v10"))return;
 const legacy=root.querySelector(".ultra-business-priority");
 const oldGrid=[...root.querySelectorAll("section.grid")].find(e=>e.classList.contains("ultra-rest-metrics")||[...e.querySelectorAll(".kpi")].some(c=>title(c)==="Total Sales"));
 if(!legacy&&!oldGrid)return;
 aliases();
 const oldCards=[...(legacy?.querySelectorAll(".kpi")||[]),...(oldGrid?.querySelectorAll(".kpi")||[])];
 const lookup=new Map(oldCards.map(el=>[title(el).toLowerCase(),el]).filter(x=>x[0]));
 const m=dashboard.metrics,ads=dashboard.adFunnel||{},days=(()=>{
  const f=typeof dateFrom!=="undefined"?Date.parse(dateFrom+"T12:00:00Z"):NaN;
  const t=typeof dateTo!=="undefined"?Date.parse(dateTo+"T12:00:00Z"):NaN;
  return Number.isFinite(f)&&Number.isFinite(t)?Math.max(1,Math.round((t-f)/86400000)+1):1;
 })();
 const wrap=document.createElement("div");wrap.className="ultra-overview-v10";
 const bus=section(wrap,"Business Overview","Daily averages, total performance and conversion efficiency","ultra-overview-business");
 const averageOrders=extractMetricCard(lookup,"Avg Orders per Day",["shopify"])||
    extractMetricCard(lookup,"AVG orders per day",["shopify"],"Avg Orders per Day");
 const avgSales=extractMetricCard(lookup,"Avg Sales per Day",["shopify"])||
    cardElement("Avg Sales per Day",cash(m.totalSales/days),"Total sales divided by days in the selected period",["shopify"]);
 const avgSessions=extractMetricCard(lookup,"Avg Sessions per Day",["ga4"])||
    cardElement("Avg Sessions per Day",fmt(m.sessions/days),"GA4 sessions divided by days in the selected period",["ga4"]);
 const totalSales=extractMetricCard(lookup,"Total Sales",["shopify"]);
 const totalOrders=extractMetricCard(lookup,"Total Orders",["shopify"]);
 const totalSessions=extractMetricCard(lookup,"Total Sessions",["ga4"])||
    extractMetricCard(lookup,"Google Sessions",["ga4"],"Total Sessions");
 const conversion=extractMetricCard(lookup,"Conversion Rate",["shopify","ga4"]);
 const aov=extractMetricCard(lookup,"AOV",["shopify"]);
 const lines=extractMetricCard(lookup,"Avg line items",["shopify"],"Avg Line Items")||
    cardElement("Avg Line Items",fmt(m.avgLineItems),"Average quantity per Shopify order",["shopify"]);
 grid(bus,[avgSales,averageOrders,avgSessions],"ultra-business-averages");
 grid(bus,[totalSales,totalOrders,totalSessions],"ultra-business-totals");
 grid(bus,[conversion,aov,lines],"ultra-business-rates");
 const ops=section(wrap,"Operations","Deliverability, shipping costs, discounts and net revenue","ultra-operations");
 grid(ops,[
  cardElement("Delivered Sales",cash(m.deliveredRevenue),"Delivered sales after order discounts",["shopify","bosta"]),
  cardElement("Delivered Orders",fmt(m.deliveredOrders),"Orders with Delivered shipping status",["shopify","bosta"]),
  cardElement("Delivery Rate",rate(m.deliveryRate),"Delivered / (Delivered + Returned)",["bosta"]),
  cardElement("Shipping Cost",cash(m.totalShippingCosts),"Order Tracking Details column T",["shopify"])
 ],"ultra-operation-row");
 grid(ops,[
  cardElement("Shipping Discounts",cash(m.freeShippingDiscounts),"Order Tracking Details column AI = T minus AH",["shopify"]),
  cardElement("Orders Discounts",cash(m.totalOrderDiscounts),"Order Tracking Details column U",["shopify"]),
  cardElement("Revenue After Delivery / Ads / Discounts / Shipping",cash(m.revenueAfterDeliveryAndAdCosts),"Delivered sales after discounts, less Meta spend and shipping costs",["shopify","meta"])
 ],"ultra-operation-row");
 const paid=section(wrap,"Paid Ads","Meta-reported purchases on the left, Shopify first-click attributed sales on the right","ultra-paid");
 const split=document.createElement("div");split.className="ultra-paid-split";paid.append(split);
 const left=document.createElement("div");left.className="ultra-paid-half";
 left.innerHTML='<div class="ultra-paid-subhead">'+icon("meta")+'<h3>Meta Ads · Platform reporting</h3></div>';
 split.append(left);
 grid(left,[
  cardElement("Meta Total Spend",cash(m.advertisingSpend),"Meta Ads spend for the selected period",["meta"]),
  cardElement("Meta Orders / Purchases",fmt(ads.metaPurchases),"Meta-reported purchase events, not Shopify orders",["meta"]),
  cardElement("Meta CPA",cash(ads.metaCpa),"Meta Ads spend / Meta purchase events",["meta"])
 ],"ultra-paid-cards");
 const right=document.createElement("div");right.className="ultra-paid-half";
 right.innerHTML='<div class="ultra-paid-subhead">'+icon("shopify")+'<h3>Shopify · Paid Meta attribution</h3></div>';
 split.append(right);
 grid(right,[
  cardElement("Meta Total Sales",cash(m.ultraMetaTotalSales),"Total Shopify sales with qualifying paid Meta first-visit attribution",["shopify","meta"]),
  cardElement("Meta Total Orders",fmt(m.ultraMetaTotalOrders),"Qualifying Shopify paid Meta orders",["shopify","meta"]),
  cardElement("Meta Delivered Sales",cash(m.ultraMetaDeliveredSales),"Delivered Shopify paid Meta revenue after order discounts",["shopify","bosta"]),
  cardElement("Meta Delivered Orders",fmt(m.ultraMetaDeliveredOrders),"Delivered orders with qualifying paid Meta attribution",["shopify","bosta"]),
  cardElement("Meta Delivery Rate",rate(m.ultraMetaDeliveryRate),"Attributed delivered / (delivered + returned)",["shopify","bosta"]),
  cardElement("Meta Cost Per Order",cash(m.costPerOrderAds),"Meta Ads spend / attributed Shopify orders",["meta","shopify"]),
  cardElement("Meta Actual Cost Per Order",cash(m.actualCostPerOrderAds),"Meta Ads spend / delivered attributed Shopify orders",["meta","shopify"])
 ],"ultra-paid-cards");
 // Move only required existing cards; remove the rest from Overview, not from application code.
 const anchor=legacy||oldGrid;
 anchor.before(wrap);
 legacy?.remove();
 oldGrid?.remove();
 root.querySelectorAll(".funnel-panel").forEach(el=>el.remove());
 // The app's original comparisons, date pickers, API functions and detail pages remain untouched.
}
let queued=false;
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;applyOverview();});}
function start(){aliases();const root=$("#content");if(!root)return;new MutationObserver(queue).observe(root,{childList:true,subtree:true});queue();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();