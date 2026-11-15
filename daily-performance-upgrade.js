
/* Daily Performance V7 — monthly funnel conversion, inventory, offers, channel mix. */
(function(){
 'use strict';
 if(typeof dayBusinessCards==='undefined'||typeof dayBusinessMonthCards!=='function'||typeof renderDayBusiness!=='function')return;

 const previousMonthCards=dayBusinessMonthCards;
 const previousRender=renderDayBusiness;
 const remoteCache=new Map();
 const pending=new Map();
 const previousMixCache=new Map();
 const previousMixPending=new Map();
 let observer=null;
 const wide=new Set(['metaFunnel','ga4Funnel']);
 const remote=new Set(['offersPerformance','paidOrganicMix']);
 const E=value=>esc(String(value??''));
 const num=value=>Number.isFinite(value)?fmt(value):'—';
 const percent=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
 const dateShift=(date,n)=>graphShift(date,n);
 const firstDay=month=>month+'-01';
 const monthAfter=month=>dayBusinessMonth(firstDay(month),1);
 const monthLast=month=>dateShift(monthAfter(month),-1);
 const previousMonth=month=>dayBusinessMonth(firstDay(month),-1).slice(0,7);
 const sourceIcon=source=>{
   const item=dayBusinessIcons[source]||dayBusinessIcons.shopify;
   return '<svg viewBox="0 0 16 16" width="13" height="13" role="img" aria-label="'+E(item[0])+'" style="color:'+item[1]+'"><title>'+E(item[0])+'</title>'+item[2]+'</svg>';
 };
 function monthlyRows(month){
   return (dayBusiness.rows||[]).filter(r=>r.date>=firstDay(month)&&r.date<=monthLast(month));
 }
 function comparableRows(month){
   const current=monthlyRows(month);
   const prior=previousMonth(month);
   const prev=monthlyRows(prior);
   // A partial month is compared with exactly the same elapsed calendar days.
   const last=current.reduce((max,r)=>r.date>max?r.date:max,'');
   const maxDay=last?Number(last.slice(8)):0;
   const daysInMonth=Number(monthLast(month).slice(8));
   const partial=maxDay&&maxDay<daysInMonth;
   const selectedPrevious=partial?prev.filter(r=>Number(r.date.slice(8))<=maxDay):prev;
   return {current,previous:selectedPrevious,partial,maxDay};
 }
 function ratio(rows,n,d){
   const matched=rows.filter(r=>Number.isFinite(r[n])&&Number.isFinite(r[d]));
   if(!matched.length)return null;
   const sum=key=>matched.reduce((s,r)=>s+r[key],0);
   const denominator=sum(d);
   return denominator>0?sum(n)/denominator:null;
 }
 function stage(label,numerator,denominator){
   return {label,num:numerator,den:denominator};
 }
 const stages={
   metaFunnel:[
     stage('Landing / Clicks','metaLanding','metaClicks'),
     stage('Add to cart / Landing','metaCarts','metaLanding'),
     stage('Checkout / Cart','metaCheckouts','metaCarts'),
     stage('Purchases / Checkout','purchases','metaCheckouts')
   ],
   ga4Funnel:[
     stage('Engaged / Sessions','engagedSessions','sessions'),
     stage('Add to cart / Engaged','gaAddToCart','engagedSessions'),
     stage('Checkout / Cart','gaCheckouts','gaAddToCart'),
     stage('Shopify orders / Checkout','orders','gaCheckouts')
   ]
 };
 function funnelMarkup(key,month){
   const pair=comparableRows(month);
   const items=stages[key];
   const rows=items.map(({label,num:n,den:d})=>{
     const current=ratio(pair.current,n,d),prior=ratio(pair.previous,n,d);
     const currentW=current===null?0:Math.max(0,Math.min(100,current*100));
     const priorW=prior===null?0:Math.max(0,Math.min(100,prior*100));
     const difference=current!==null&&prior!==null?((current-prior)*100):null;
     return '<div class="db-v7-funnel-row">'+
       '<div class="db-v7-funnel-heading"><span title="'+E(label)+'">'+E(label)+'</span><strong>'+percent(current)+'</strong></div>'+
       '<div class="db-v7-track" title="Current '+percent(current)+' | Previous '+percent(prior)+'">'+
         '<i class="db-v7-bar-prior" style="width:'+priorW.toFixed(2)+'%"></i>'+
         '<i class="db-v7-bar-now" style="width:'+currentW.toFixed(2)+'%"></i></div>'+
       '<div class="db-v7-funnel-label"><span>Previous '+percent(prior)+'</span><span class="'+(difference===null?'':difference>=0?'db-v7-up':'db-v7-down')+'">'+(difference===null?'—':(difference>0?'+':'')+difference.toFixed(1)+' pp')+'</span></div>'+
       '</div>';
   }).join('');
   return '<p class="db-v7-note">Current vs previous month'+(pair.partial?' (same elapsed days)':'')+'. Percent of the immediately preceding step.</p>'+
     '<div class="db-v7-funnel-list">'+rows+'</div>'+
     (key==='ga4Funnel'?'<p class="db-v7-footnote">Final step combines Shopify orders with GA4 checkouts; sources and attribution differ.</p>':
       '<p class="db-v7-footnote">Meta-reported events and purchases; not Shopify-attributed purchases.</p>');
 }
 function norm(value){
   return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\u200c-\u200f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 }
 function stockByName(){
   const grouped=new Map();
   for(const v of dayBusiness.inventorySnapshot||[]){
     const name=norm(v.product);
     if(!name)continue;
     const group=grouped.get(name)||[];
     group.push(v);grouped.set(name,group);
   }
   return grouped;
 }
 function stockStatus(product,groups){
   const all=groups.get(norm(product))||[];
   const active=all.filter(v=>v.active!==false);
   const tracked=active.filter(v=>v.tracked&&Number.isFinite(v.stock));
   if(!active.length||!tracked.length)return {label:'Unknown',tone:'unknown',extra:'No verified stock quantity'};
   const available=tracked.filter(v=>v.stock>0);
   const soldOut=tracked.filter(v=>v.stock<=0);
   const units=tracked.reduce((s,v)=>s+Math.max(0,v.stock),0);
   const label=!available.length?'Out':soldOut.length||tracked.length<active.length?'Partial':'In stock';
   return {label,tone:!available.length?'out':soldOut.length?'partial':'in',extra:num(units)+' sellable units · '+available.length+'/'+active.length+' variants available now'};
 }
 function stockEnhance(markup,data){
   const wrapper=document.createElement('div');
   wrapper.innerHTML=markup;
   const group=stockByName();
   const card=wrapper.querySelector('article.db-month-card');
   if(!card)return markup;
   card.classList.add('db-v7-products');
   const list=card.querySelector('ol');
   if(!list)return wrapper.innerHTML;
   list.insertAdjacentHTML('beforebegin','<div class="db-v7-product-columns"><span>Product</span><span>Orders</span><span>Stock now</span></div>');
   for(const li of list.querySelectorAll(':scope > li')){
     const heading=li.querySelector('.db-rank-title');
     if(!heading)continue;
     const name=heading.querySelector('strong')?.textContent||'';
     const status=stockStatus(name,group);
     heading.insertAdjacentHTML('beforeend','<span class="db-v7-stock-badge '+status.tone+'" title="'+E(status.extra)+'">'+E(status.label)+'</span>');
   }
   card.insertAdjacentHTML('beforeend','<small class="db-v7-inventory-caption">Stock is a current snapshot, not historical month-end availability.</small>');
   return wrapper.innerHTML;
 }
 function remoteMarkup(key,month){
   const cacheKey=businessId+'|'+month;
   const entry=remoteCache.get(cacheKey);
   if(!entry)return '<div class="db-v7-remote" data-db-v7-month="'+E(month)+'" data-db-v7-key="'+E(key)+'"><small>Loading monthly data when visible…</small></div>';
   if(entry.error)return '<div class="db-v7-remote" data-db-v7-month="'+E(month)+'" data-db-v7-key="'+E(key)+'"><small>Monthly details unavailable. Try scrolling away and back.</small></div>';
   const data=entry.data;
   if(key==='offersPerformance'){
     const points=data?.diagnostic?.offers;
     if(!Array.isArray(points))return '<div class="db-v7-remote" data-db-v7-month="'+E(month)+'" data-db-v7-key="'+E(key)+'"><small>Discount-code data unavailable.</small></div>';
     const offers=points.map(r=>({date:r.date,value:r.offers})),total=points.map(r=>({date:r.date,value:r.orders}));
     const offered=offers.reduce((v,r)=>v+(r.value||0),0),all=total.reduce((v,r)=>v+(r.value||0),0);
     return '<div class="db-v7-remote" data-db-v7-month="'+E(month)+'" data-db-v7-key="'+E(key)+'">'+
       '<div class="db-v7-summary">'+num(offered)+' with offers · '+num(all)+' total orders</div>'+
       (points.length>=1?diagnosticLine([['Total Orders',total],['Orders with Offers',offers]],fmt):'<small>No offer history for this month.</small>')+
       '</div>';
   }
   const mix=(source)=>{
     const groups=source?.paidOrganicFirst||{};
     const rows=(source?.orderVisitChannelAnalysis||[]).reduce((a,row)=>{
       const type=String(row.medium||'').toLowerCase();
       a[type==='paid'?'paid':type==='organic'?'organic':'unknown']+=Number(row.firstOrders||0);
       return a;
     },{paid:0,organic:0,unknown:0});
     const counts=groups.total!==undefined?groups:rows;
     const paid=Number(counts.paid)||0,organic=Number(counts.organic)||0,unknown=Number(counts.unknown)||0;
     return {paid,organic,unknown,total:paid+organic+unknown};
   };
   const current=mix(data);
   const prior=previousMixCache.get(previousMixKey(month));
   const old=prior?.data?mix(prior.data):null;
   const slice=comparableRows(month);
   const share=(channel)=>current.total>0?current[channel]/current.total*100:0;
   const paidShare=share('paid'),organicShare=share('organic'),unknownShare=share('unknown');
   // One donut for the CURRENT period. Percentages appear on this donut only.
   // Order-count comparisons belong exclusively to the breakdown below.
   const chart='<div class="db-v9-donut-wrap">'+
     '<div class="db-v7-donut db-v9-donut" role="img" aria-label="Current orders: Paid '+paidShare.toFixed(1)+'%, Organic '+organicShare.toFixed(1)+'%, Unknown '+unknownShare.toFixed(1)+'%" '+
     'style="background:conic-gradient(#6880f6 0% '+paidShare.toFixed(2)+'%,#20b99a '+paidShare.toFixed(2)+'% '+(paidShare+organicShare).toFixed(2)+'%,#f2a65a '+(paidShare+organicShare).toFixed(2)+'% 100%)">'+
     '<div class="db-v7-donut-inner"><strong>'+num(current.total)+'</strong><small>Current orders</small></div></div>'+
     '<div class="db-v9-donut-pcts">'+
       [['Paid','paid',paidShare],['Organic','organic',organicShare],['Unknown','unknown',unknownShare]].map(([name,key,value])=>
       '<span class="db-v9-donut-pct '+key+'"><i></i>'+E(name)+' '+value.toFixed(1)+'%</span>').join('')+
     '</div></div>';
   const rows=[['Paid','paid'],['Organic','organic'],['Unknown','unknown']].map(([label,key])=>{
     const currentOrders=current[key];
     const previousOrders=old?old[key]:null;
     const change=previousOrders===null?null:currentOrders-previousOrders;
     return '<div class="db-v9-count-row"><span class="db-v7-dot '+key+'"></span><span class="db-v9-channel">'+E(label)+'</span>'+
       '<b>'+num(currentOrders)+'</b>'+
       '<span class="db-v9-previous">'+(previousOrders===null?'—':num(previousOrders))+'</span>'+
       '<strong class="'+(change===null?'':change>0?'db-v7-up':change<0?'db-v7-down':'')+'">'+
       (change===null?'—':change>0?'+'+num(change):num(change))+'</strong></div>';
   }).join('');
   const periodText=old?'Current vs previous month'+(slice.partial?' · same elapsed days':''):
     prior?.error?'Previous month unavailable':'Loading previous month…';
   return '<div class="db-v7-remote db-v9-paid-counts" data-db-v7-month="'+E(month)+'" data-db-v7-key="'+E(key)+'">'+
     chart+'<div class="db-v8-mix-summary">'+E(periodText)+'</div>'+
     '<div class="db-v9-count-head"><span>Channel</span><span>Current</span><span>Previous</span><span>Δ Orders</span></div>'+
     '<div class="db-v9-count-rows">'+rows+'</div>'+
     '<small class="db-v7-footnote">Shopify first-visit attribution · all order statuses. Percentage shares are shown only on the current donut; comparisons use order counts.</small></div>';
 }
 function smallCard(key,rows,data,icon,month){
   if(remote.has(key)){
     const title=dayBusinessCards[key];
     const body=remoteMarkup(key,month);
     return '<article class="db-month-card db-v7-special '+(key==='offersPerformance'?'db-v7-offers':'db-v7-pie')+'"><h4>'+sourceIcon(title[1])+' '+E(title[0])+'</h4>'+body+'</article>';
   }
   // Preserve existing card calculations and media, only add the current stock column.
   let original=previousMonthCards(rows,data,[key],icon,month);
   original=original.replace(/^<div class="db-card-grid">/,'').replace(/<\/div>$/,'');
   return key==='products'?stockEnhance(original,data):original;
 }
 function wideCard(key,month){
   const [title,source]=dayBusinessCards[key];
   return '<article class="db-month-card db-v7-wide"><h4>'+sourceIcon(source)+' '+E(title)+'</h4>'+funnelMarkup(key,month)+'</article>';
 }
 dayBusinessMonthCards=function(rows,data,keys,icon,month){
   const normal=keys.filter(k=>!wide.has(k)),large=keys.filter(k=>wide.has(k));
   return '<div class="db-card-grid db-v7-grid">'+normal.map(k=>smallCard(k,rows,data,icon,month)).join('')+
     large.map(k=>wideCard(k,month)).join('')+'</div>';
 };
 function previousMixKey(month){
   const {partial,maxDay}=comparableRows(month);
   const prior=previousMonth(month);
   const cutoff=partial?Math.min(maxDay,Number(monthLast(prior).slice(8))):0;
   return businessId+'|mix-previous|'+month+'|'+(cutoff||'full');
 }
 function loadPreviousMix(month){
   if(!dayBusiness.cards.includes('paidOrganicMix'))return;
   const key=previousMixKey(month);
   if(previousMixCache.has(key)||previousMixPending.has(key))return;
   const prior=previousMonth(month);
   const {partial,maxDay}=comparableRows(month);
   const end=partial?prior+'-'+String(Math.min(maxDay,Number(monthLast(prior).slice(8)))).padStart(2,'0'):monthLast(prior);
   const request=api('/api/dashboard?businessId='+encodeURIComponent(businessId)+'&startDate='+firstDay(prior)+'&endDate='+end+'&details=diagnostic')
     .then(data=>{previousMixCache.set(key,{data});})
     .catch(error=>{previousMixCache.set(key,{error:String(error?.message||error)});})
     .finally(()=>{previousMixPending.delete(key);refreshRemote(month);});
   previousMixPending.set(key,request);
 }
 async function loadMonth(month){
   const key=businessId+'|'+month;
   if(dayBusiness.cards.includes('paidOrganicMix'))loadPreviousMix(month);
   if(pending.has(key)||remoteCache.has(key))return;
   const start=firstDay(month),end=monthLast(month);
   const promise=api('/api/dashboard?businessId='+encodeURIComponent(businessId)+'&startDate='+start+'&endDate='+end+'&details=diagnostic')
     .then(data=>{remoteCache.set(key,{data});})
     .catch(error=>{remoteCache.set(key,{error:String(error?.message||error)});})
     .finally(()=>{pending.delete(key);refreshRemote(month);});
   pending.set(key,promise);
 }
 function refreshRemote(month){
   const root=$('content');
   if(!root||page!==dayBusinessTitle)return;
   const elements=[...root.querySelectorAll('.db-v7-remote[data-db-v7-month="'+month+'"]')];
   for(const element of elements){
     const key=element.dataset.dbV7Key;
     const wrap=document.createElement('div');
     wrap.innerHTML=remoteMarkup(key,month);
     element.replaceWith(...Array.from(wrap.childNodes));
   }
 }
 function attachMonthVisibility(root){
   observer?.disconnect();observer=null;
   const strip=root.querySelector('.db-months');
   if(!strip)return;
   const months=[...strip.querySelectorAll('.db-month')];
   // Observe monthly columns, not every KPI, so historical months load only when viewed.
   if(typeof IntersectionObserver==='undefined'){
     months.slice(0,2).forEach(monthNode=>{
       const month=monthNode.querySelector('[data-db-v7-month]')?.dataset.dbV7Month;
       if(month)loadMonth(month);
     });
     return;
   }
   observer=new IntersectionObserver(entries=>{
     for(const entry of entries){
       if(!entry.isIntersecting)continue;
       const month=entry.target.querySelector('[data-db-v7-month]')?.dataset.dbV7Month;
       if(month)loadMonth(month);
     }
   },{root:strip,rootMargin:'180px',threshold:0.01});
   months.forEach(el=>{if(el.querySelector('[data-db-v7-month]'))observer.observe(el);});
 }
 renderDayBusiness=function(...args){
   const result=previousRender.apply(this,args);
   if(page===dayBusinessTitle&&dayBusiness.rows)attachMonthVisibility($('content'));
   return result;
 };
})();
