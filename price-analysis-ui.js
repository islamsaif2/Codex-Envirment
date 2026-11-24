const priceAnalysisTitle='Price Change Analysis';
const priceView={business:'',data:null,error:'',loading:false,serial:0,product:'',from:'',to:'',window:14,direction:'down',selected:'',metric:'cr',sort:'date',asc:false,extra:[],limit:40};
const paNumber=(n,d=1)=>Number.isFinite(n)?Number(n).toLocaleString('en',{maximumFractionDigits:d}):'—';
const paMoney=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{style:'currency',currency:'EGP',minimumFractionDigits:0,maximumFractionDigits:2}).format(n):'—';
const paPercent=n=>Number.isFinite(n)?(n*100).toFixed(2)+'%':'—';
const paDelta=(v,neutral=false)=>!Number.isFinite(v)?'<span class="pa-change neutral">No baseline</span>':'<span class="pa-change '+(neutral?'neutral':v>=0?'positive':'negative')+'">'+(v>0?'+':'')+(v*100).toFixed(1)+'%</span>';
const paIcon=source=>'<span class="pa-source '+source+'" title="'+source.toUpperCase()+'" aria-label="'+source.toUpperCase()+'">'+(source==='ga4'?'<svg viewBox="0 0 20 20"><path d="M3 12h3v6H3zm5-5h4v11H8zm6-5h4v16h-4z" fill="currentColor"/></svg>':'<svg viewBox="0 0 20 20"><path d="M4 6h12l1 12H3L4 6zm3 0V5a3 3 0 016 0v1" fill="none" stroke="currentColor" stroke-width="2"/></svg>')+'</span>';
function paImage(product){return product?.image?'<img class="pa-product-img" src="'+esc(product.image)+'" alt="" loading="lazy" onerror="this.hidden=true">':'';}
function paPath(values,width=600,height=100,stepped=false,bounds=null){
 const valid=values.filter(Number.isFinite);if(!valid.length)return '';
 const low=bounds?.[0]??Math.min(...valid),high=bounds?.[1]??Math.max(...valid),span=high-low||Math.max(high*.1,1),bottom=height-12,top=12;
 let p='',previous=false;
 values.forEach((v,i)=>{if(!Number.isFinite(v)){previous=false;return;}const x=12+(width-24)*i/Math.max(1,values.length-1),y=bottom-(v-low)/span*(bottom-top);p+=(previous?(stepped?'H'+x+'V'+y:'L'+x+','+y):'M'+x+','+y);previous=true;});
 return p;
}
function paTimeline(product,from,to,metric='cr',large=false){
 const rows=product.daily.filter(r=>r.date>=from&&r.date<=to),width=900,height=large?200:115;
 if(!rows.length)return '<div class="empty">No daily data in this range.</div>';
 const selected=priceView.current;
 const values=rows.map(r=>metric==='cr'?(r.sessions>0?r.orders/r.sessions:null):metric==='orders'?r.orders:metric==='sessions'?r.sessions:metric==='revenue'?(r.revenueExact?r.revenue:null):r.price);
 const format=metric==='cr'?paPercent:metric==='price'||metric==='revenue'?paMoney:paNumber;
 const valid=values.filter(Number.isFinite),max=valid.length?Math.max(...valid):null,min=valid.length?Math.min(...valid):null;
 const markers=rows.map((r,i)=>'<circle cx="'+(12+(width-24)*i/Math.max(1,rows.length-1))+'" cy="'+(height-12-(Number.isFinite(values[i])?(values[i]-(min||0))/((max-min)||Math.max(max*.1,1)):0)*(height-24))+'" r="6" fill="transparent"><title>'+esc(r.date+' · '+(metric==='price'?'Offered price':metric)+' '+format(values[i])+' · '+r.orders+' orders · '+paNumber(r.sessions)+' sessions')+'</title></circle>').join('');
 const eventX=selected&&selected.date>=from&&selected.date<=to?12+(width-24)*Math.max(0,rows.findIndex(r=>r.date===selected.date))/Math.max(1,rows.length-1):null;
 const bands=selected?[['beforeFrom','beforeTo','pa-before-band'],['afterFrom','afterTo','pa-after-band']].map(([a,b,c])=>{const indices=rows.map((r,i)=>r.date>=selected[a]&&r.date<=selected[b]?i:-1).filter(i=>i>=0);return indices.length?'<rect class="'+c+'" x="'+(12+(width-24)*indices[0]/Math.max(1,rows.length-1))+'" y="0" width="'+Math.max(2,(width-24)*(indices.at(-1)-indices[0])/Math.max(1,rows.length-1))+'" height="'+height+'"/>':'';}).join(''):'';
 return '<div class="pa-chart"><div class="pa-axis"><span>'+format(max)+'</span><span>'+format(min)+'</span></div><svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" role="img" aria-label="'+esc(metric+' by day for '+product.name)+'">'+bands+[.25,.5,.75].map(y=>'<line class="pa-gridline" x1="0" x2="900" y1="'+height*y+'" y2="'+height*y+'"/>').join('')+(eventX!==null?'<line class="pa-event-line" x1="'+eventX+'" x2="'+eventX+'" y1="0" y2="'+height+'"/>':'')+'<path class="pa-main-line '+(metric==='price'?'pa-price-line':'')+'" d="'+paPath(values,width,height,metric==='price')+'"/>'+markers+'</svg></div><div class="pa-chart-dates"><span>'+rows[0].date+'</span><span>'+rows[Math.floor(rows.length/2)].date+'</span><span>'+rows.at(-1).date+'</span></div>';
}
function paResponseText(value){return Number.isFinite(value)?(value>0?'+':'')+(value*100).toFixed(1)+'%':'Not enough comparable data';}
function paV2Controls(){
 const s=priceView;
 return '<section class="panel pa-controls"><label>Product<select id="pa-product"><option value="">All products</option>'+s.data.products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<option value="'+esc(p.id)+'" '+(s.product===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><div class="pa-date-control"><span>Dates of price changes</span>'+calendarControl(s.from,s.to,true)+'</div><label>Compare up to<select id="pa-window">'+[7,14,28].map(n=>'<option value="'+n+'" '+(s.window===n?'selected':'')+'>'+n+' days at each price</option>').join('')+'</select></label><label>Price changes<select id="pa-direction"><option value="down" '+(s.direction==='down'?'selected':'')+'>Decreases</option><option value="up" '+(s.direction==='up'?'selected':'')+'>Increases</option><option value="all" '+(s.direction==='all'?'selected':'')+'>All changes</option></select></label><button type="button" class="btn" id="pa-refresh">Refresh</button></section>';
}
function paResponseChart(events){
 const rows=events.filter(e=>Number.isFinite(e.normalizedResponse));
 const max=Math.max(.01,...rows.map(e=>Math.abs(e.normalizedResponse)));
 const bins=new Map();for(const e of rows){const key=(e.priceChange*100).toFixed(1);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(e);}
 const groups=[...bins].sort((a,b)=>+a[0]-+b[0]);
 const bars=groups.map(([discount,items])=>{
  const w=e=>2*e.before.sessions*e.after.sessions/(e.before.sessions+e.after.sessions),total=items.reduce((n,e)=>n+w(e),0),value=items.reduce((n,e)=>n+e.crChange*w(e),0)/total;
  const priceWords=+discount<0?'Price fell by ': 'Price rose by ';
  const conversionWords=value>0?'Conversion rose by ':value<0?'Conversion fell by ':'Conversion did not change';
  const conversionValue=value===0?'':Math.abs(value*100).toFixed(1)+'%';
  return '<tr><td><strong>'+priceWords+Math.abs(+discount).toFixed(1)+'%</strong><small>Based on '+items.length+' before-and-after comparison'+(items.length===1?'':'s')+'</small></td><td><strong class="'+(value>=0?'pa-positive-text':'pa-negative-text')+'">'+conversionWords+conversionValue+'</strong><div class="pa-response-track" aria-hidden="true"><i class="'+(value>=0?'positive':'negative')+'" style="width:'+Math.max(2,Math.min(100,Math.abs(value)/(Math.max(.01,...rows.map(x=>Math.abs(x.crChange))))*100))+'%"></i></div></td></tr>';
 }).join('');
 const xMin=Math.min(-.01,...rows.map(e=>e.priceChange)),xMax=Math.max(.01,...rows.map(e=>e.priceChange)),yMin=Math.min(-.01,...rows.map(e=>e.crChange)),yMax=Math.max(.01,...rows.map(e=>e.crChange));
 const x=v=>55+(v-xMin)/(xMax-xMin)*510,y=v=>190-(v-yMin)/(yMax-yMin)*160;
 const scatter='<svg class="pa-scatter" viewBox="0 0 620 230" role="img" aria-label="Observed conversion changes at each price change">'+[0,.5,1].map(t=>'<line class="pa-gridline" x1="55" x2="565" y1="'+(190-t*160)+'" y2="'+(190-t*160)+'"/><text x="48" y="'+(194-t*160)+'" text-anchor="end">'+paResponseText(yMin+(yMax-yMin)*t)+'</text>').join('')+rows.map(e=>'<circle class="'+(e.crChange<0?'pa-negative-point':'')+'" cx="'+x(e.priceChange)+'" cy="'+y(e.crChange)+'" r="7"><title>'+esc(e.name+' · '+e.date+' · price '+(e.priceChange*100).toFixed(1)+'% · conversion '+paResponseText(e.crChange))+'</title></circle>').join('')+'<text x="55" y="220">'+(xMin*100).toFixed(1)+'% price</text><text x="565" y="220" text-anchor="end">'+(xMax*100).toFixed(1)+'% price</text></svg>';
 return '<section class="panel"><div class="pa-level-grid pa-v2-charts"><div><h3>Price change vs conversion change</h3><p class="hint">Horizontal axis: price change (%). Vertical axis: conversion-rate change (%). Hover over a point for details.</p>'+scatter+'</div><div><h3>How conversion changed after a price change</h3><p class="hint">Actual changes observed in your history. Conversion changes are relative percentages, not percentage points.</p><div class="pa-response-rows"><table class="pa-response-table" aria-label="Price changes and their observed conversion changes"><thead><tr><th scope="col">Change in price</th><th scope="col">Change in conversion rate</th></tr></thead><tbody>'+bars+'</tbody></table></div></div></div></section>';
}
function paV2Table(events){
 const heads=[['name','Product / group'],['date','Date'],['priceChange','Price change'],['beforeCR','Before CR'],['afterCR','After CR'],['crChange','CR change'],['normalizedResponse','CR response per 10%'],['days','Days at each price']];
 const header=heads.map(([k,label])=>'<th aria-sort="'+(priceView.sort===k?(priceView.asc?'ascending':'descending'):'none')+'"><button type="button" data-pa-sort="'+k+'">'+label+' '+(priceView.sort===k?(priceView.asc?'↑':'↓'):'↕')+'</button></th>').join('');
 return '<div class="pa-table-scroll"><table class="pa-table pa-v2-table"><thead><tr>'+header+'</tr></thead><tbody>'+events.slice(0,priceView.limit).map(e=>'<tr><th><button type="button" class="pa-row-product" data-pa-event="'+esc(e.id)+'">'+paImage(e)+'<span>'+esc(e.members&&e.members.length>1?e.members.length+' products':e.name)+'<small>'+(!priceView.product?'View products & results':'View this change')+' ↗</small></span></button></th><td>'+e.date+'</td><td>'+paDelta(e.priceChange,true)+(priceView.product?'<small>'+paMoney(e.oldPrice)+' → '+paMoney(e.newPrice)+'</small>':'')+'</td><td>'+paPercent(e.before.cr)+'<small>'+paNumber(e.before.orders,0)+' orders / '+paNumber(e.before.sessions,0)+' sessions</small></td><td>'+paPercent(e.after.cr)+'<small>'+paNumber(e.after.orders,0)+' orders / '+paNumber(e.after.sessions,0)+' sessions</small></td><td>'+paDelta(e.crChange)+'</td><td><strong class="'+(e.normalizedResponse>=0?'pa-positive-text':'pa-negative-text')+'">'+paResponseText(e.normalizedResponse)+'</strong><small>per 10% '+(e.priceChange<0?'lower':'higher')+' price</small></td><td>'+e.days+' days'+(e.days<7?'<small>Short comparison</small>':'')+'</td></tr>').join('')+'</tbody></table></div>'+(events.length>priceView.limit?'<button type="button" class="btn pa-more" id="pa-more">Show more comparisons</button>':'');
}
async function loadPriceAnalysis(force=false){
 const state=priceView;
 if(state.business!==businessId){Object.assign(state,{business:businessId,data:null,error:'',loading:false,selected:'',product:'',from:'',to:''});state.serial++;}
 if(state.loading||state.data&&!force)return;
 state.loading=true;state.error='';const serial=++state.serial;
 try{const data=await api('/api/price-analysis?businessId='+encodeURIComponent(businessId));if(serial!==state.serial)return;state.data=data;state.from=state.from||data.start;state.to=state.to||data.end;}
 catch(e){if(serial===state.serial)state.error=e.message;}
 finally{if(serial===state.serial){state.loading=false;if(page===priceAnalysisTitle)renderPriceAnalysis();}}
}
function renderPriceAnalysis(){
 if(page!==priceAnalysisTitle)return;
 const s=priceView,C=PriceChangeCore;
 if(s.business!==businessId||!s.data&&!s.loading&&!s.error)loadPriceAnalysis();
 if(!s.data){$('content').innerHTML='<section class="panel pa-loading"><h3>'+(s.error?'Could not load price analysis':'Loading prices & conversion…')+'</h3><p>'+esc(s.error||'Reading your connected Google Sheets data.')+'</p>'+(s.error?'<button class="btn" id="pa-retry">Retry</button>':'')+'</section>';document.getElementById('pa-retry')?.addEventListener('click',()=>loadPriceAnalysis(true));return;}
 const products=s.data.products.filter(p=>!s.product||p.id===s.product);
 const raw=products.flatMap(p=>C.events(p,s.window,s.to)).filter(e=>e.date>=s.from&&e.date<=s.to&&(s.direction==='all'||s.direction==='down'&&e.priceChange<0||s.direction==='up'&&e.priceChange>0));
 const candidates=s.product?raw:C.combineEvents(raw);
 let events=candidates.filter(C.usable);
 events.sort((a,b)=>{const field=x=>s.sort==='beforeCR'?x.before.cr:s.sort==='afterCR'?x.after.cr:x[s.sort],x=field(a),y=field(b);return (s.asc?1:-1)*(typeof x==='string'?x.localeCompare(y):x-y)||a.name.localeCompare(b.name);});
 s.visibleEvents=events;s.current=null;s.currentProduct=null;
 const direction=s.direction==='up'?'up':'down',summary=C.responseSummary(events,direction),verb=direction==='up'?'increase':'decrease';
 const selected=s.product?products[0]:null,title=selected?.name||'All products';
 const excluded=Math.max(0,candidates.length-events.length);
 let body='<div class="pa-note">ⓘ This analysis does not account for stock availability.</div>'+paV2Controls();
 body+='<div class="pa-selected-heading">'+paImage(selected)+'<div><h2>'+esc(title)+'</h2><p>'+(s.product?'Results for this product only.':'Combined results across comparable products — no single product is selected.')+'</p></div></div>';
 body+='<section class="pa-v2-summary"><div class="pa-v2-main-card"><div class="pa-kpi-head"><b>'+paIcon('shopify')+paIcon('ga4')+' For every 10% price '+verb+'</b></div><strong class="'+(summary.response>=0?'pa-positive-text':'pa-negative-text')+'">'+paResponseText(summary.response)+'</strong><p>observed change in conversion rate</p><small>Normalized from '+summary.comparisons+' observed price '+verb+' comparisons, weighted by sessions and the size of the price change. This is a historical relationship, not a forecast.</small></div><div class="pa-v2-support-card"><small>Comparable '+(s.product?'price changes':'product groups')+'</small><strong>'+summary.comparisons+'</strong><span>'+summary.products+' product'+(summary.products===1?'':'s')+' represented</span></div><div class="pa-v2-support-card"><small>Sessions behind the comparisons</small><strong>'+paNumber(summary.sessions,0)+'</strong><span>Before + after product-page sessions; periods can overlap.</span></div></section>';
 if(events.length)body+=paResponseChart(events);
 body+='<section class="panel"><div class="pa-section-heading"><div><h3>Comparable price changes</h3><p class="hint">Price change → conversion change → equivalent response per 10%. Click a row for its supporting data.</p></div><small class="pa-caption">'+events.length+' comparisons</small></div>'+(events.length?paV2Table(events):'<div class="empty">No comparison in this selection has enough product-page sessions and a nonzero starting conversion rate. Try All products or a wider date range.</div>')+(excluded?'<p class="pa-caption">'+excluded+' other changes are left out because the price move is below 1%, or they lack comparable traffic or a nonzero starting conversion rate.</p>':'')+'</section>';
 if(selected){s.currentProduct=selected;body+='<details class="panel pa-v2-trend"><summary>Daily price & conversion for '+esc(selected.name)+'</summary><div class="pa-chart-label">Offered price</div>'+paTimeline(selected,s.from,s.to,'price')+'<div class="pa-chart-label">Conversion rate</div>'+paTimeline(selected,s.from,s.to,'cr')+'</details>';}
 body+='<details class="panel pa-method"><summary>How the 10% metric is calculated</summary><p>If price decreased 20% and conversion increased 40%, the normalized response is +20% conversion per 10% lower price: 40% ÷ 20% × 10%. This is a relative conversion-rate change, not percentage points, and is not a prediction for a new price.</p><p>All products combines orders and product-page sessions for the same products before and after each shared price change. The overall 10% response fits a session-weighted linear relationship to the observed changes. Changes below 1% are excluded to avoid scaling tiny rounding adjustments into misleading 10% results. Conversion = Shopify product orders ÷ GA4 product-page sessions. These are product-order conversions, not the store-wide purchase conversion rate.</p><p>Windows use equally many available days at each price and stop at another price change. Days where order prices disagree with the daily price are excluded. Short comparisons are labelled. Results need at least 20 sessions on each side and a nonzero starting conversion rate. Stock availability is not included.</p></details>';
 $('content').innerHTML='<div class="pa-page pa-v2">'+body+'</div>';
 const reset=()=>{s.limit=40;renderPriceAnalysis();};
 $('pa-product').onchange=e=>{s.product=e.target.value;reset();};$('pa-window').onchange=e=>{s.window=+e.target.value;reset();};$('pa-direction').onchange=e=>{s.direction=e.target.value;reset();};$('pa-refresh').onclick=()=>loadPriceAnalysis(true);
 bindClickCalendar(document.querySelector('.pa-date-control .click-calendar'),()=>[s.from,s.to],(from,to)=>{s.from=from||s.data.start;s.to=to||from||s.data.end;reset();});
 document.querySelectorAll('[data-pa-sort]').forEach(b=>b.onclick=()=>{const k=b.dataset.paSort;s.asc=s.sort===k?!s.asc:false;s.sort=k;renderPriceAnalysis();});
 document.querySelectorAll('[data-pa-event]').forEach(b=>b.onclick=()=>paOpenComparison(events.find(e=>e.id===b.dataset.paEvent)));
 $('pa-more')?.addEventListener('click',()=>{s.limit+=40;renderPriceAnalysis();});
}
function paOpenComparison(e){
 if(!e)return;
 const members=e.members||[e],dialog=document.createElement('dialog');dialog.className='pa-dialog';
 dialog.innerHTML='<div class="pa-section-heading"><div><h3>'+esc(e.members&&e.members.length>1?e.members.length+' products · '+e.date:e.name+' · '+e.date)+'</h3><p>'+paDelta(e.priceChange,true)+' price · '+paDelta(e.crChange)+' conversion</p></div><button type="button" class="btn" data-pa-close>Close</button></div><p class="pa-caption">Before: '+e.beforeFrom+' to '+e.beforeTo+' · After: '+e.afterFrom+' to '+e.afterTo+' · '+e.days+' days each</p><div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Product</th><th>Price</th><th>Before CR</th><th>After CR</th><th>Conversion change</th></tr></thead><tbody>'+members.map(m=>'<tr><th>'+esc(m.name)+'</th><td>'+paMoney(m.oldPrice)+' → '+paMoney(m.newPrice)+'</td><td>'+paPercent(m.before.cr)+'</td><td>'+paPercent(m.after.cr)+'</td><td>'+(Number.isFinite(m.crChange)?paDelta(m.crChange):'Starting CR is zero or unavailable')+'</td></tr>').join('')+'</tbody></table></div>';
 if(members.length===1){const p=priceView.data.products.find(p=>p.id===e.productId);if(p){priceView.current=e;dialog.innerHTML+='<div class="pa-chart-label">Product conversion rate</div>'+paTimeline(p,e.beforeFrom,e.afterTo,'cr',true);priceView.current=null;}}
 document.body.append(dialog);dialog.querySelector('[data-pa-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
$('nav-price-analysis').onclick=()=>setPage(priceAnalysisTitle);

