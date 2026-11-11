/* V11: Restore real Channels sessions/conversion and single Paid Ads attribution selector. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const number=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const cash=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":typeof money==="function"?money(Number(v)):number(v)+" EGP";
const percent=v=>v===null||v===undefined||!Number.isFinite(Number(v))?"—":(Number(v)*100).toFixed(2)+"%";
const esc11=v=>{const t=document.createElement("span");t.textContent=String(v??"");return t.innerHTML;};
const iconSvg={shopify:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 15-2 2 16-18 1z" fill="#83b83b"/><text x="8" y="18" fill="white" font-size="10" font-weight="900">S</text></svg>',meta:'<svg viewBox="0 0 32 22" aria-hidden="true"><path d="M2 16C6 4 9 3 12 7c5 6 8 13 13 8 3-3 4-9 6-9" fill="none" stroke="#1877f2" stroke-width="3" stroke-linecap="round"/></svg>',bosta:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h13v12H2zM15 10h4l3 4v3h-7z" fill="none" stroke="#e17e38" stroke-width="2"/><circle cx="7" cy="18" r="2" fill="#e17e38"/><circle cx="19" cy="18" r="2" fill="#e17e38"/></svg>'};
let paidModel="first",channelModel="last",renderLock=false;
function kpi(label,value,hint,sources){
 if(typeof card!=="function")return null;
 const template=document.createElement("template");
 template.innerHTML=card(label,value,hint);
 const el=template.content.querySelector(".kpi");if(!el)return null;
 el.dataset.ultraMetric=label;
 el.classList.add("ultra-overview-card","ultra-v11-card");
 const heading=el.querySelector(".kt");
 if(heading){
   heading.dataset.metricSourcesDecorated="yes";
   heading.querySelectorAll(".ultra-source-collection,.ultra-source-mark,.source-brand-icon").forEach(x=>x.remove());
   [...heading.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());
   heading.prepend(document.createTextNode(label));
   const icons=document.createElement("span");icons.className="ultra-source-collection ultra-v11-icons";
   for(const source of new Set(sources||["shopify"])){
     const badge=document.createElement("span");badge.className="ultra-source-mark";
     badge.title="Source: "+source;badge.innerHTML=iconSvg[source]||"";icons.append(badge);
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
 for(const el of wrap.querySelectorAll(".kpi[data-ultra-metric]")){
   const heading=el.querySelector(".kt");if(!heading)continue;
   const label=el.dataset.ultraMetric;
   heading.dataset.metricSourcesDecorated="yes";
   heading.querySelectorAll(".metric-source-heading,.metric-source-icons,.source-brand-icon").forEach(node=>node.remove());
   const textNodes=[...heading.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE);
   if(textNodes.length!==1||textNodes[0].textContent!==label){
     textNodes.forEach(node=>node.remove());
     heading.prepend(document.createTextNode(label));
   }
   const [icons,...duplicates]=heading.querySelectorAll(".ultra-source-collection");
   duplicates.forEach(node=>node.remove());
   heading.querySelectorAll(":scope > .ultra-source-mark").forEach(node=>node.remove());
   icons?.classList.add("ultra-v11-icons");
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
   "Meta Orders":["metric",paidModel==="last"?"ultra11sheetOrders":"ultra11firstOrders"],
   "Meta Orders / Purchases":["ads","purchases"],
   "Meta Cost Per Order":paidModel==="meta"?["special","metaCPA"]:["metric",paidModel==="last"?"ultra11lastCPA":"ultra11firstCPA"],
   "Meta Actual Cost Per Order":paidModel==="meta"?["metric","ultra11unavailableActualCPA"]:["metric",paidModel==="last"?"ultra11lastActualCPA":"ultra11firstActualCPA"]
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
 const m=dashboard.metrics||{},ad=dashboard.adFunnel||{},detail=attribution();
 let selector=root.querySelector(".ultra-v11-select");
 if(!selector){
   const heading=root.querySelector(".ultra-overview-heading");if(!heading)return;
   selector=document.createElement("select");
   selector.className="ultra-v11-select btn";
   selector.setAttribute("aria-label","Paid Ads attribution model");
   [["first","Meta Attributed Orders by Shopify First Click"],
    ["last","Meta Attributed Orders by Shopify Last Click"],
    ["meta","Meta Attributed Orders by Meta records itself"]].forEach(([value,label])=>{
      const o=document.createElement("option");o.value=value;o.textContent=label;selector.append(o);
   });
   selector.addEventListener("change",()=>{
     paidModel=selector.value;
     paintPaid();
   });
   heading.append(selector);
 }
 selector.value=paidModel;
 let area=root.querySelector(".ultra-v11-paid-list");
 if(!area){
   root.querySelector(".ultra-paid-split")?.remove();
   area=document.createElement("div");area.className="ultra-v11-paid-list";root.append(area);
 }
 aliases();
 const spend=Number(m.advertisingSpend);
 const source=detail[paidModel === "last" ? "lastClick" : "firstClick"] || {};
 const shopifyOrders=paidModel==="last"?detail.lastClickShopifyOrders:source.orders;
 const orders=shopifyOrders==null?null:Number(shopifyOrders);
 const delivered=source.deliveredOrders==null?null:Number(source.deliveredOrders);
 const cpa=orders>0&&Number.isFinite(spend)?spend/orders:null;
 const actual=delivered>0&&Number.isFinite(spend)?spend/delivered:null;
 let cards,notes;
 if(paidModel==="meta"){
   cards=[
     kpi("Meta Total Spend",cash(m.advertisingSpend),"Meta Ads total spend from Meta records",["meta"]),
     kpi("Meta Orders / Purchases",number(ad.metaPurchases),"Purchase events reported directly by Meta",["meta"]),
     kpi("Meta Cost Per Order",cash(ad.metaCpa),"Meta spend divided by Meta-reported purchase events",["meta"]),
     kpi("Meta Actual Cost Per Order","—","Meta records do not expose independently verified delivered Shopify orders; cannot calculate an actual delivered-order CPA from Meta alone",["meta"])
   ];
   notes="All four cards use Meta reporting. Actual delivered-order cost is unavailable from Meta-only data, so it is shown as unavailable rather than inventing a value.";
 }else{
   const model=paidModel==="first"?"first":"last";
   cards=[
     kpi("Meta Total Spend",cash(m.advertisingSpend),"Meta Ads total spend from Meta",["meta"]),
     kpi("Meta Orders",number(orders),model==="last"?
       "Paid Facebook + Instagram ShopifyQL last-click orders from Shopify Sessions Data":
       "Qualified first-visit Facebook + Instagram paid Shopify orders",["shopify"]),
     kpi("Meta Cost Per Order",cash(cpa),"Meta spend divided by "+model+"-click Shopify-attributed orders",["meta","shopify"]),
     kpi("Meta Delivery Rate",percent(source.deliveryRate),"Attributed delivered orders divided by delivered plus returned",["shopify","bosta"]),
     kpi("Meta Delivered Sales",cash(source.deliveredSales),"Delivered revenue for attributed Shopify orders after discounts",["shopify","bosta"]),
     kpi("Meta Delivered Orders",number(delivered),"Delivered orders under "+model+"-click Shopify attribution",["shopify","bosta"]),
     kpi("Meta Actual Cost Per Order",cash(actual),"Meta spend divided by delivered attributed Shopify orders",["meta","shopify"])
   ];
   notes=model==="last"?
     "Last-click order count comes from Shopify Sessions Data. Delivered orders and sales use order-level last-visit UTMs, so attribution populations can differ.":
     "First-click attribution uses qualified paid Shopify first-visit UTMs and original campaign-matching conditions.";
 }
 area.replaceChildren();
 slot(area,cards);
 let note=root.querySelector(".ultra-v11-paid-note");
 if(!note){note=document.createElement("p");note.className="ultra-v11-paid-note";root.append(note);}
 if(note.textContent!==notes)note.textContent=notes;
 root.dataset.ultraV11Model=paidModel;
}
const channelSort = {key:"orders", direction:-1};
const channelColumns = [["channel","Channel"],["orders","Orders"],["sessions","Sessions"],["rate","Conversion rate"]];

function channelRows(){
 const raw = dashboard?.channelAnalysis || [];
 return raw.filter(row=>row.fromSessionsSheet).map(row=>{
  const orders = channelModel==="last" && row.ordersAvailable ? Number(row.shopifyOrders) : null;
  return {channel:row.source+" · "+row.medium, sessions:row.sessions, orders,
    rate:orders!==null && row.sessions>0 ? orders/row.sessions : null};
 });
}
function renderChannelPanel(){
 const selector = $("#source-attribution");
 const panel = selector?.closest("section.panel");
 if (!panel) return;
 selector.replaceChildren(new Option("First Click (Order UTMs)","first"),new Option("Last Click (Order UTMs)","last"));
 selector.value=channelModel;
 selector.onchange=()=>{channelModel=selector.value;refreshChannelData(panel);};
 refreshChannelData(panel);
}
function refreshChannelData(panel){
 const table=panel.querySelector(".channel-analysis-table");
 const tbody=table?.tBodies[0];
 if(!tbody)return;
 const headings=table.tHead.rows[0].cells;
 let visible=8;
 const rows=channelRows();
 const barMetric=channelModel==="first"?"sessions":"orders";
 const barMax=rows.reduce((max,row)=>Math.max(max,row[barMetric]??0),0);
 function channelLabel(row){
  const value=row[barMetric];
  const width=Number.isFinite(value)&&barMax>0?value/barMax*100:0;
  const meter=value==null?"":'<span class="channel-meter" aria-hidden="true"><i style="width:'+width+'%"></i></span>';
  return '<span class="channel-row-label"><strong>'+esc11(row.channel)+'</strong>'+meter+'</span>';
 }
 function draw(){
  const {key,direction}=channelSort;
  rows.sort((a,b)=>{
   const x=a[key],y=b[key];
   if (x==null || y==null) return (x==null)-(y==null)||a.channel.localeCompare(b.channel);
   const delta=typeof x==="string"?x.localeCompare(y):x-y;
   return direction*delta||a.channel.localeCompare(b.channel);
  });
  tbody.innerHTML=rows.slice(0,visible).map(r=>'<tr><td>'+channelLabel(r)+'</td><td class="channel-number">'+number(r.orders)+'</td><td class="channel-number">'+number(r.sessions)+'</td><td class="channel-number">'+percent(r.rate)+'</td></tr>').join("")||'<tr><td colspan="4">No Shopify Sessions Data for the selected dates.</td></tr>';
  channelColumns.forEach(([column,label],index)=>{
   const cell=headings[index];
   cell.setAttribute("aria-sort",column===key?(direction===-1?"descending":"ascending"):"none");
   const button=cell.firstElementChild;
   button.textContent=label+(column===key?(direction===-1?" ↓":" ↑"):"");
  });
  panel.querySelector("#more-channel-orders")?.remove();
  if(visible<rows.length){
   const button=document.createElement("button");button.id="more-channel-orders";
   button.className="btn analysis-more";button.textContent="Load more";
   button.onclick=()=>{visible+=8;draw()};panel.append(button);
  }
 }
 channelColumns.forEach(([key],index)=>{
  const button=document.createElement("button");
  button.type="button";
  button.className="channel-sort-button";
  button.onclick=()=>{
   channelSort.direction=channelSort.key===key?-channelSort.direction:-1;
   channelSort.key=key;
   draw();
  };
  headings[index].replaceChildren(button);
 });
 draw();
 const hint=panel.querySelector(".hint");
 if(hint)hint.textContent=channelModel==="first"
  ?"Shopify Sessions Data does not provide first-click order counts. Bars show sessions."
  :"Shopify Sessions Data supplies sessions and last-click orders. Bars show orders. Conversion rate is orders divided by sessions.";
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
