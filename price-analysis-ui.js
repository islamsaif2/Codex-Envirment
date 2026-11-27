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
 return '<section class="panel pa-controls"><label>Product<select id="pa-product"><option value="">All products</option>'+s.data.products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<option value="'+esc(p.id)+'" '+(s.product===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><div class="pa-date-control"><span>Dates of price changes</span>'+calendarControl(s.from,s.to,true)+'</div><label>Price changes<select id="pa-direction"><option value="down" '+(s.direction==='down'?'selected':'')+'>Decreases</option><option value="up" '+(s.direction==='up'?'selected':'')+'>Increases</option><option value="all" '+(s.direction==='all'?'selected':'')+'>All changes</option></select></label><button type="button" class="btn" id="pa-refresh">Refresh</button></section>';
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
 if(!s.data){$('content').innerHTML='<section class="panel"><h3>'+esc(s.error||'Loading pricing intelligence…')+'</h3><button class="btn" id="pa-refresh">Retry</button></section>';$('pa-refresh').onclick=()=>loadPriceAnalysis(true);return;}
 const products=s.data.products, dates=C.days(s.from,s.to), maps=products.map(p=>new Map(p.daily.map(r=>[r.date,r])));
 const basket=products.map((p,i)=>({p,i,base:maps[i].get(s.from)?.price,weight:p.daily.filter(r=>r.date<s.from&&r.date>=C.shift(s.from,-28)).reduce((a,r)=>a+r.orders,0)})).filter(x=>x.base>0&&x.weight>0);
 const weight=basket.reduce((a,x)=>a+x.weight,0);
 const index=dates.map(date=>({date,price:weight&&basket.every(x=>maps[x.i].get(date)?.price>0)?100*basket.reduce((a,x)=>a+x.weight*maps[x.i].get(date).price/x.base,0)/weight:null}));
 // Immediate equal-duration windows; older observations only estimate weekday effects.
 const raw=products.flatMap((p,i)=>{
   const idx=maps[i],ep=C.episodes(p),weekday=d=>new Date(d+'T00:00:00Z').getUTCDay();
   const eligible=r=>r&&r.price>0&&r.priceComparable!==false&&r.sessions>0;
   return ep.slice(1).flatMap((cur,j)=>{
     const prev=ep[j];if(cur.from<s.from||cur.from>s.to||C.shift(prev.to,1)!==cur.from||Math.abs(C.change(cur.price,prev.price))<.01)return [];
     const dates=C.days(cur.from,cur.to<s.to?cur.to:s.to),n=dates.length;
     const beforeDates=C.days(C.shift(cur.from,-n),C.shift(cur.from,-1));
     const pre=beforeDates.map(d=>idx.get(d)),post=dates.map(d=>idx.get(d));
     const complete=pre.every(eligible)&&post.every(eligible);
     const before=C.aggregate(pre.filter(eligible)),after=C.aggregate(post.filter(eligible));
     // Session-weighted geometric baseline price preserves actual mixed-price days.
     const oldPrice=before.sessions>0?Math.exp(pre.filter(eligible).reduce((s,r)=>s+r.sessions*Math.log(r.price),0)/before.sessions):prev.price;
     const priceChange=C.change(cur.price,oldPrice),response=complete?C.change(after.cr,before.cr):null;
     const history=p.daily.filter(r=>r.date<C.shift(cur.from,-n)&&r.date>=C.shift(cur.from,-56)&&r.price===prev.price&&eligible(r));
     const factors=Array.from({length:7},(_,w)=>C.aggregate(history.filter(r=>weekday(r.date)===w)));
     const weekdayRate=rows=>rows.every(r=>r&&factors[weekday(r.date)].sessions>=100&&factors[weekday(r.date)].orders>0)?rows.reduce((s,r)=>s+r.sessions*factors[weekday(r.date)].cr,0)/rows.reduce((s,r)=>s+r.sessions,0):null;
     const wb=complete?weekdayRate(pre):null,wa=complete?weekdayRate(post):null;
     const expected=wb>0&&wa>0?before.cr*wa/wb:null;
     const weekdayAdjusted=expected>0?C.change(after.cr,expected):null;
     const demand=p.daily.filter(r=>r.date>=C.shift(cur.from,-28)&&r.date<cur.from).reduce((n,r)=>n+r.orders,0);
     const status=!complete?'Missing traffic or inconsistent prices in immediate window':!Number.isFinite(response)?'Zero or unavailable reference conversion':!demand?'No reference orders for product weight':Math.abs(priceChange)<.01?'Net price change below 1%':'Included';
     return [{id:p.id+'|'+cur.from,productId:p.id,name:p.name,date:cur.from,oldPrice,newPrice:cur.price,priceChange,before,after,refRate:before.cr,crChange:response,normalizedResponse:Number.isFinite(response)&&priceChange!==0?response/Math.abs(priceChange)*.1:null,beforeDates,afterDates:dates,beforeFrom:beforeDates[0],beforeTo:beforeDates.at(-1),afterFrom:dates[0],afterTo:dates.at(-1),days:complete?n:0,duration:n,demand,status,weekdayAdjusted,weekdayExpected:expected,mixedBefore:pre.some(r=>r&&r.price!==prev.price)}];
   });
 });
 // Keep every detected change in the date group; only comparable stocked observations train the model.
 const valid=[];
 for(const e of raw){
   const p=products.find(p=>p.id===e.productId),idx=maps[products.indexOf(p)];
   const availability=dates=>{const rows=dates.map(d=>idx.get(d));if(!rows.every(r=>Number.isFinite(r?.availability)))return null;const w=rows.reduce((n,r)=>n+(r.sessions||0),0);return w>0?rows.reduce((n,r)=>n+(r.sessions||0)*r.availability,0)/w:null;};
   e.stockBefore=availability(e.beforeDates);e.stockAfter=availability(e.afterDates);
   const outOfStock=e.stockBefore===0||e.stockAfter===0;
   if(outOfStock){e.status='Excluded from pricing model: no available recorded sizes';continue;}
   if(!(Number.isFinite(e.crChange)&&e.demand>0&&e.days>0&&Math.abs(e.priceChange)>=.01))continue;
   if(e.stockBefore===null||e.stockAfter===null){e.status='Excluded from pricing model: incomplete inventory history';continue;}
   // Conservative comparison: severe changes in stock are not identified as price effects.
   if(Math.min(e.stockBefore,e.stockAfter)<.25||Math.abs(e.stockAfter-e.stockBefore)>.20){e.status='Excluded from pricing model: low or substantially changed size availability';continue;}
   e.status='Included: comparable recorded size availability';valid.push(e);
 }

 for(const e of valid){
   const controls=[];
   for(let i=0;i<products.length;i++){
     if(products[i].id===e.productId)continue;
     const pre=e.beforeDates.map(d=>maps[i].get(d)),post=e.afterDates.map(d=>maps[i].get(d)),all=pre.concat(post),price=all[0]?.price;
     if(!(price>0)||!all.every(r=>r&&r.price===price&&r.priceComparable!==false&&r.sessions>0&&Number.isFinite(r.availability)&&r.availability>=.25))continue;
     const beforeAvail=pre.reduce((n,r)=>n+r.availability,0)/pre.length,afterAvail=post.reduce((n,r)=>n+r.availability,0)/post.length;if(Math.abs(afterAvail-beforeAvail)>.20)continue;
     const b=C.aggregate(pre),a=C.aggregate(post);
     if(b.orders<20||a.orders<10||b.sessions<100||a.sessions<100||!(b.cr>0)||!(a.cr>0))continue;
     if(b.cr/e.refRate<.5||b.cr/e.refRate>2)continue;
     controls.push({name:products[i].name,weight:b.orders,response:a.cr/b.cr});
   }
   const w=controls.reduce((a,x)=>a+x.weight,0);
   e.controls=controls;e.expectedCR=w?e.refRate*controls.reduce((a,x)=>a+x.weight*x.response,0)/w:null;
   e.adjusted=e.before.orders>=20&&e.after.orders>=10&&controls.length>=2&&e.expectedCR>0?e.after.cr/e.expectedCR-1:null;
 }
 // Primary event unit is the calendar date, with separate increase/decrease portfolios.
 const groups=new Map();
 for(const e of raw){const direction=Math.sign(e.priceChange);if(!direction)continue;const k=e.date+'|'+direction;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 const events=[...groups].map(([key,members])=>{
   const eligible=members.filter(e=>valid.includes(e)),w=eligible.reduce((n,e)=>n+e.demand,0),avg=k=>w?eligible.reduce((n,e)=>n+e.demand*e[k],0)/w:null;
   const adjustedMembers=eligible.filter(e=>Number.isFinite(e.adjusted)),aw=adjustedMembers.reduce((n,e)=>n+e.demand,0);
   const allWeight=members.reduce((n,e)=>n+e.demand,0);
   return {key,date:members[0].date,sign:Math.sign(members[0].priceChange),members,eligible,weight:w,priceChange:avg('priceChange'),allPriceChange:allWeight?members.reduce((n,e)=>n+e.demand*e.priceChange,0)/allWeight:null,crChange:avg('crChange'),adjusted:aw?adjustedMembers.reduce((n,e)=>n+e.demand*e.adjusted,0)/aw:null,adjustedCount:adjustedMembers.length,sessions:eligible.reduce((n,e)=>n+e.after.sessions,0),orders:eligible.reduce((n,e)=>n+e.after.orders,0),end:members.map(e=>e.afterTo).sort().at(-1)};
 }).sort((a,b)=>b.date.localeCompare(a.date)||a.sign-b.sign);
 const signed=v=>Number.isFinite(v)?(v>0?'+':'')+(100*v).toFixed(1)+'%':'Unavailable';
 const changeText=v=>Number.isFinite(v)?'<strong style="color:'+(v>0?'#19865d':v<0?'#c84d5e':'inherit')+'">'+signed(v)+'</strong>':'<span>Not enough data</span>';
 const historical=events.map((b,i)=>'<tr><td><button type="button" class="btn" data-pa-band="'+i+'" aria-expanded="false">'+b.date+' ▾</button><small style="display:block">Through '+b.end+' (product periods can differ)</small></td><td>'+(b.sign<0?'Decrease':'Increase')+'</td><td>'+b.members.length+'</td><td>'+b.eligible.length+'</td><td>'+signed(b.allPriceChange)+'</td><td>'+signed(b.priceChange)+'</td><td>'+changeText(b.crChange)+'</td><td>'+paNumber(b.sessions,0)+'</td><td>'+b.orders+'</td></tr><tr id="pa-band-'+i+'" hidden><td colspan="9"><div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Product</th><th>Before period</th><th>During period</th><th>Old price</th><th>New price</th><th>Stock availability before</th><th>Stock availability during</th><th>Conversion before</th><th>Conversion during</th><th>Orders before / during</th><th>Sessions before / during</th><th>Model status</th></tr></thead><tbody>'+b.members.map(e=>'<tr><td>'+esc(e.name)+'</td><td>'+e.beforeFrom+' – '+e.beforeTo+'</td><td>'+e.afterFrom+' – '+e.afterTo+'</td><td>'+paMoney(e.oldPrice)+'</td><td>'+paMoney(e.newPrice)+'</td><td>'+paPercent(e.stockBefore)+'</td><td>'+paPercent(e.stockAfter)+'</td><td>'+paPercent(e.before.cr)+'</td><td>'+paPercent(e.after.cr)+'</td><td>'+e.before.orders+' / '+e.after.orders+'</td><td>'+paNumber(e.before.sessions,0)+' / '+paNumber(e.after.sessions,0)+'</td><td>'+esc(e.status)+'</td></tr>').join('')+'</tbody></table></div></td></tr>').join('');
 const adjusted=events.map(b=>'<tr><td>'+b.date+'</td><td>'+(b.sign<0?'Decrease':'Increase')+'</td><td>'+changeText(b.crChange)+'</td><td>'+changeText(b.adjusted)+'</td><td>'+b.adjustedCount+' / '+b.eligible.length+'</td></tr>').join('');
 const model=valid.filter(e=>Number.isFinite(e.adjusted));
 // Hierarchical normal model on log rate ratios. Integrate population mean and
 // between-product variation over a deterministic quadrature grid; sample the
 // conditional joint posterior to preserve shared population uncertainty.
 const directionFit=sign=>{
   const by=new Map(),all=[];
   for(const e of valid.filter(e=>Math.sign(e.priceChange)===sign)){
     const x=Math.log1p(e.priceChange);
     const y=Math.log((e.after.orders+.5)/e.after.sessions)-Math.log((e.before.orders+.5)/e.before.sessions);
     // Extra event-level noise prevents treating a large campaign as a randomized trial.
     const variance=1/(e.before.orders+.5)+1/(e.after.orders+.5)+.15**2;
     if(!Number.isFinite(x*y*variance)||!(variance>0))continue;
     const row={e,x,y,w:1/variance};all.push(row);
     if(!by.has(e.productId))by.set(e.productId,[]);by.get(e.productId).push(row);
   }
   const dateCounts=new Map();for(const r of valid)dateCounts.set(r.date,(dateCounts.get(r.date)||0)+1);
   for(const r of all)r.w/=Math.max(1,dateCounts.get(r.e.date)||1);
   const items=[...by].map(([id,rows])=>{
     const d=rows.reduce((s,r)=>s+r.w*r.x*r.x,0),num=rows.reduce((s,r)=>s+r.w*r.x*r.y,0);
     const weight=products.find(p=>p.id===id).daily.filter(r=>r.date<=s.to&&r.date>C.shift(s.to,-28)).reduce((n,r)=>n+r.orders,0);
     return {d,estimate:num/d,weight};
   }).filter(r=>r.d>0&&Number.isFinite(r.estimate));
   const weight=items.reduce((n,r)=>n+r.weight,0),n=new Set(all.map(r=>r.e.date)).size;
   if(!weight)return {response:()=>null,interval:()=>null,n,products:0,rows:all.length};
   // mu ~ N(0, 3^2), tau ~ half-normal(2); neither prior fixes the direction.
   // Integrate tau on a log grid (include Jacobian). Conditional mu is exact normal.
   const grid=[];
   for(let j=0;j<161;j++){
     const lt=Math.log(.005)+j/160*Math.log(16/.005),tau=Math.exp(lt);
     let prec=1/9,num=0,ss=0,logdet=0;
     for(const p of items){const v=1/p.d+tau*tau;prec+=1/v;num+=p.estimate/v;ss+=p.estimate*p.estimate/v;logdet+=Math.log(v);}
     grid.push({tau,mu:num/prec,sd:Math.sqrt(1/prec),logw:lt-tau*tau/8-.5*(logdet+Math.log(9*prec)+ss-num*num/prec)});
   }
   const peak=Math.max(...grid.map(g=>g.logw));let total=0;
   for(const g of grid){total+=Math.exp(g.logw-peak);g.cdf=total;}
   let seed=123456789;const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
   const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
   const draws=[];
   for(let k=0;k<1800;k++){
     const u=uniform()*total,g=grid.find(z=>z.cdf>=u)||grid.at(-1),mu=g.mu+g.sd*normal(),priorPrec=1/(g.tau*g.tau);
     draws.push(items.map(p=>{const precision=p.d+priorPrec;return {beta:(p.d*p.estimate+priorPrec*mu)/precision+normal()/Math.sqrt(precision),weight:p.weight/weight};}));
   }
   const cache=new Map();const distribution=v=>{if(!cache.has(v))cache.set(v,draws.map(draw=>draw.reduce((sum,p)=>sum+p.weight*Math.expm1(p.beta*Math.log1p(v)),0)).sort((a,b)=>a-b));return cache.get(v);};
   const interval=v=>{const d=distribution(v);return [d[Math.floor(.025*(d.length-1))],d[Math.floor(.975*(d.length-1))]];};
   const response=v=>{const d=distribution(v);return d.reduce((a,b)=>a+b,0)/d.length;};
   return {response,interval,n,products:items.filter(p=>p.weight>0).length,rows:all.length,min:Math.min(...all.map(r=>Math.abs(r.e.priceChange))),max:Math.max(...all.map(r=>Math.abs(r.e.priceChange)))};
 };
 const fitDown=directionFit(-1),fitUp=directionFit(1);
 const scenario=v=>{
   if(v===0)return {lift:0,range:[0,0],support:'Baseline'};
   const f=v<0?fitDown:fitUp,lift=f.response(v),range=f.interval(v);
   if(!Number.isFinite(lift)||!range||!range.every(Number.isFinite))return {lift:null,range:null,support:'No usable evidence'};
   const outside=Math.abs(v)>f.max+1e-8||Math.abs(v)<f.min-1e-8;
   return {lift,range,support:outside?'Extrapolation':f.n<3?'Few pricing dates': 'Within observed range'};
 };
 const predict=v=>scenario(v).lift;
 const onePercent=v=>Number.isFinite(v)?(v>0?'+':'')+(v*100).toFixed(3)+'%':'Not enough data';
 const sensitivityCard=(title,fit,v)=>{const range=fit.interval(v);return '<div class="pa-v2-support-card"><small>'+title+'</small><strong>'+onePercent(fit.response(v))+'</strong><span>Estimated relative conversion change · '+fit.products+' products · '+fit.n+' price change dates</span>'+(range?'<small>95% model range: '+onePercent(range[0])+' to '+onePercent(range[1])+'</small>':'')+'</div>';};
 const section=(title,html)=>'<section class="panel"><h3>'+title+'</h3>'+html+'</section>';
 const empty=t=>'<p class="hint">'+t+'</p>';
 let body='<section class="panel pa-controls"><div class="pa-date-control"><span>Analysis period</span>'+calendarControl(s.from,s.to,true)+'</div><span>Comparison: immediately preceding days of equal duration</span><button class="btn" id="pa-refresh">Refresh</button></section>';
 body+=section('Customer Price Sensitivity','<div class="pa-v2-summary">'+sensitivityCard('When price decreases by 1%',fitDown,-.01)+sensitivityCard('When price increases by 1%',fitUp,.01)+'</div>'+empty('Combined demand-weighted, compounded product conversion estimates. These are conditional scenarios, not validated store-wide forecasts.'));
 const scenarioRows=Array.from({length:11},(_,i)=>{const v=(i*5-30)/100;return {v,...scenario(v)};});
 const scenarioChart=(()=>{
   const points=Array.from({length:51},(_,i)=>{const v=(i-30)/100;return {v,...scenario(v)};});
   const finite=points.filter(p=>Number.isFinite(p.lift));if(finite.length<=1)return empty('No inventory-screened pricing evidence to draw a scenario curve.');
   const w=880,h=330,l=84,r=850,t=24,b=250,x=v=>l+(v+.3)/.5*(r-l);
   const low=Math.min(0,...finite.map(p=>p.lift*100)),high=Math.max(0,...finite.map(p=>p.lift*100));
   const step=Math.max(1,Math.ceil((high-low)/5)),min=Math.floor(low/step)*step,max=Math.max(min+step,Math.ceil(high/step)*step);
   const y=v=>t+(max-v)/(max-min)*(b-t),ticks=[];for(let v=min;v<=max;v+=step)ticks.push(v);
   const path=points.map((p,i)=>Number.isFinite(p.lift)?((i>0&&Number.isFinite(points[i-1].lift)?'L':'M')+x(p.v)+' '+y(p.lift*100)):'').join(' ');
   return '<div style="overflow-x:auto"><svg viewBox="0 0 '+w+' '+h+'" style="width:100%;min-width:620px;font:12px system-ui" role="img" aria-label="Expected relative conversion change by proposed price change">'+ticks.map(v=>'<line x1="'+l+'" x2="'+r+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#94a3b8" opacity="'+(v===0?.7:.2)+'"/><text x="'+(l-10)+'" y="'+(y(v)+4)+'" text-anchor="end" fill="currentColor">'+v+'%</text>').join('')+'<path d="'+path+'" fill="none" stroke="#5384c5" stroke-width="3"/>'+scenarioRows.map(p=>'<text x="'+x(p.v)+'" y="274" text-anchor="middle" fill="currentColor">'+Math.round(p.v*100)+'%</text>'+(Number.isFinite(p.lift)?'<circle cx="'+x(p.v)+'" cy="'+y(p.lift*100)+'" r="5" fill="'+(p.lift>=0?'#19865d':'#c84d5e')+'"><title>Price '+signed(p.v)+' · Expected conversion '+signed(p.lift)+' · '+p.support+'</title></circle>':'')).join('')+'<text x="467" y="310" text-anchor="middle" fill="currentColor">Proposed price change (%)</text><text transform="translate(19 137) rotate(-90)" text-anchor="middle" fill="currentColor">Expected conversion change (%)</text></svg></div>';
 })();
 body+=section('Price Scenario Modeling',empty('How conversion may respond if prices change across the analyzed product portfolio. All eligible historical events are combined; hover over a point for its value.')+scenarioChart+'<div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Proposed price change</th><th>Expected conversion change</th><th>Predicted CVR (your baseline)</th><th>95% model range</th><th>Historical support</th></tr></thead><tbody>'+scenarioRows.map((p,i)=>'<tr><td>'+signed(p.v)+'</td><td>'+changeText(p.lift)+'</td><td id="pa-scenario-cvr-'+i+'">—</td><td>'+(p.range?signed(p.range[0])+' to '+signed(p.range[1]):'—')+'</td><td>'+p.support+'</td></tr>').join('')+'</tbody></table></div>'+empty('Support labels describe observed price coverage, not validated prediction accuracy. Extrapolation can be unreliable.'));
 body+=section('Interactive Pricing Simulator',empty('Enter your baseline conversion, traffic and order economics to explore a conditional pricing scenario.')+'<div class="pa-controls"><label>Price change (%) <input id="pa-sim" type="range" min="-30" max="20" step="1" value="-10"></label><strong id="pa-sim-value"></strong><label>Baseline CVR (%) <input id="pa-base-cvr" type="number" min="0" max="100" step=".01"></label><label>Expected sessions <input id="pa-traffic" type="number" min="0"></label><label>Revenue per order (EGP) <input id="pa-aov" type="number" min="0"></label><label>Variable cost per order (EGP) <input id="pa-cost" type="number" min="0"></label></div><div id="pa-sim-result" class="pa-v2-summary"></div><p class="hint">Inputs are manual. Assumes the modeled relative product response transfers to your entered baseline, with fixed traffic, basket and cost per order. Not a validated store-wide forecast.</p>');
 body+='<details class="panel pa-method"><summary>Pricing experiments and historical model diagnostics</summary>';
 body+=section('Pricing Experiments',empty('Plan a randomized visitor test. This calculator does not change Shopify prices or assign visitors.')+'<div class="pa-controls"><label>Baseline conversion (%) <input id="pa-exp-base" type="number" min=".01" max="99" step=".1" value="2.5"></label><label>Minimum relative lift (%) <input id="pa-exp-lift" type="number" min="1" value="15"></label><label>Eligible visitors per day <input id="pa-exp-traffic" type="number" min="1" value="1000"></label></div><p id="pa-exp-result"></p>'+empty('Approximate 80% power, two-sided 5% significance, equal assignment. Experiment persistence, assignment, outcome tracking and profit-based sample sizing are not connected.'));
 body+=section('Historical pricing events','<div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Date</th><th>Direction</th><th>Products changed</th><th>Products analyzed</th><th>Weighted price change (all)</th><th>Weighted price change (analyzed)</th><th>Weighted conversion change</th><th>Sessions</th><th>Orders</th></tr></thead><tbody>'+historical+'</tbody></table></div>');
 body+=section('Historical Data Coverage','<p>Detected product price changes: '+raw.length+' · Included: '+valid.length+' · One-day changes detected: '+raw.filter(e=>e.duration===1).length+' · One-day changes included: '+valid.filter(e=>e.duration===1).length+'</p><details><summary>See every detected price change and inclusion reason</summary><div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Product</th><th>Start date</th><th>Price change</th><th>Days at new price</th><th>Days analyzed</th><th>Reference days</th><th>Before period</th><th>During period</th><th>Promotion sessions</th><th>Promotion orders</th><th>Status</th></tr></thead><tbody>'+raw.map(e=>'<tr><td>'+esc(e.name)+'</td><td>'+e.date+'</td><td>'+signed(e.priceChange)+'</td><td>'+e.duration+'</td><td>'+e.days+'</td><td>'+e.beforeDates.length+'</td><td>'+e.beforeFrom+' – '+e.beforeTo+'</td><td>'+e.afterFrom+' – '+e.afterTo+'</td><td>'+paNumber(e.after.sessions,0)+'</td><td>'+e.after.orders+'</td><td>'+esc(e.status)+'</td></tr>').join('')+'</tbody></table></div></details><p class="hint">Missing traffic and mixed or inconsistent recorded prices remain excluded. A single daily snapshot cannot establish hourly discount exposure. Reference demand weights are from the prior 28 days before each change. Reused reference days and simultaneous promotions are not independent tests.</p>');
 body+=section('06 · Pricing Breakdown','<details><summary>Product-level observations</summary><div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Product</th><th>Date</th><th>Price change</th><th>Observed CVR change</th><th>Baseline orders</th></tr></thead><tbody>'+valid.map(e=>'<tr><td>'+esc(e.name)+'</td><td>'+e.date+'</td><td>'+paDelta(e.priceChange,true)+'</td><td>'+paDelta(e.crChange)+'</td><td>'+paNumber(e.before.orders,0)+'</td></tr>').join('')+'</tbody></table></div></details>'+empty('Category, channel and customer breakdowns require additional mapped data.'));
 body+='<details class="panel pa-method"><summary>Intelligence behind this analysis</summary><p>Imagine Brown and Black both go from 1,250 to 950 EGP during White Friday. Brown conversion rises 4% and Black rises 3.8%. If Brown normally generates 200 orders and Black 800, the weighted improvement is 3.84%, not 3.9%. We use orders before the price change so the discount itself does not change the weights.</p><p>Imagine 1,250 EGP today converts better than 950 EGP last year. That might be because Ultramedix grew, not because higher prices work better. We compare the immediately preceding period of equal duration; older dates only help estimate normal weekday differences, but a true growth adjustment still needs reliable controls.</p><p>Imagine White Friday brings more shoppers even without a discount, or Black is out of stock in popular sizes. Those changes can affect conversion independently of price. Inventory History now screens stock availability before a product can influence the pricing model; other business factors still need validation.</p><p>We compare products individually, group every change by its start date and direction and weight them by baseline orders. Product-page sessions can overlap, and Shopify product orders divided by those sessions is not store-wide conversion. Missing data is not treated as evidence. Historical observations are not forecasts.</p><p>For the 1% metrics, imagine Black has thousands of sessions while Brown has only a few. Brown borrows more information from the shared price-response pattern. The Bayesian model learns the variation between products, then combines compounded responses using recent demand weights. Its neutral prior does not force discounts to improve conversion. The range depends on model assumptions, including a 0.15 log-rate event noise floor and conservative date-based evidence weighting; repeated overlapping windows may still make it too narrow. We exclude full stockouts, missing stock records, availability below 25% and shifts above 20 percentage points; these are conservative screening assumptions, not a fitted stock effect. If we cut prices 20%, we need 25% more units just to maintain product revenue. A controlled test and product costs are needed to determine whether profit improves.</p></details>';
 body+='</details>';
 $('content').innerHTML='<div class="pa-page pa-v2">'+body+'</div>';
 document.querySelectorAll('[data-pa-band]').forEach(btn=>btn.onclick=()=>{const row=$('pa-band-'+btn.dataset.paBand);row.hidden=!row.hidden;btn.setAttribute('aria-expanded',String(!row.hidden));});
 $('pa-refresh').onclick=()=>loadPriceAnalysis(true);
 bindClickCalendar(document.querySelector('.pa-date-control .click-calendar'),()=>[s.from,s.to],(from,to)=>{s.from=from||s.data.start;s.to=to||from||s.data.end;renderPriceAnalysis();});
 const simulate=()=>{const v=Number($('pa-sim').value)/100;$('pa-sim-value').textContent=signed(v);const lift=predict(v),read=id=>$(id).value.trim()===''?null:Number($(id).value),base=read('pa-base-cvr'),traffic=read('pa-traffic'),aov=read('pa-aov'),cost=read('pa-cost');const cv=Number.isFinite(lift)&&base>0&&base<=100?base/100*(1+lift):null,orders=cv!==null&&cv<=1&&traffic>0?cv*traffic:null,rev=orders!==null&&aov>0?orders*aov*(1+v):null,profit=rev!==null&&cost!==null&&cost>=0?rev-orders*cost:null;scenarioRows.forEach((p,i)=>{const predicted=Number.isFinite(p.lift)&&base>0&&base<=100?base/100*(1+p.lift):null;$('pa-scenario-cvr-'+i).textContent=predicted!==null&&predicted<=1?paPercent(predicted):'—';});const card=(name,value)=>'<div class="pa-v2-support-card"><small>'+name+'</small><strong>'+value+'</strong></div>';$('pa-sim-result').innerHTML=card('Estimated conversion change',signed(lift))+card('Historical support',scenario(v).support)+card('Estimated conversion rate',cv!==null&&cv<=1?paPercent(cv):'—')+card('Estimated orders',paNumber(orders,0))+card('Estimated revenue',paMoney(rev))+card('Estimated contribution profit',paMoney(profit))+card('Revenue break-even volume change',signed(1/(1+v)-1));};
 for(const id of ['pa-sim','pa-base-cvr','pa-traffic','pa-aov','pa-cost'])$(id).oninput=simulate;simulate();
 const sample=()=>{const a=Number($('pa-exp-base').value)/100,b=a*(1+Number($('pa-exp-lift').value)/100),t=Number($('pa-exp-traffic').value),m=(a+b)/2;if(!(a>0&&b>a&&b<1&&t>0)){$('pa-exp-result').textContent='Enter valid experiment assumptions.';return;}const n=Math.ceil((1.96*Math.sqrt(2*m*(1-m))+.8416*Math.sqrt(a*(1-a)+b*(1-b)))**2/(b-a)**2);$('pa-exp-result').textContent=paNumber(n,0)+' visitors per group · '+paNumber(2*n,0)+' total · approximately '+Math.ceil(2*n/t)+' days before allowing for full weeks and delayed conversions.';};for(const id of ['pa-exp-base','pa-exp-lift','pa-exp-traffic'])$(id).oninput=sample;sample();

}
function paOpenComparison(e){
 if(!e)return;
 const members=e.members||[e],dialog=document.createElement('dialog');dialog.className='pa-dialog';
 dialog.innerHTML='<div class="pa-section-heading"><div><h3>'+esc(e.members&&e.members.length>1?e.members.length+' products · '+e.date:e.name+' · '+e.date)+'</h3><p>'+paDelta(e.priceChange,true)+' price · '+paDelta(e.crChange)+' conversion</p></div><button type="button" class="btn" data-pa-close>Close</button></div><p class="pa-caption">Before: '+e.beforeFrom+' to '+e.beforeTo+' · After: '+e.afterFrom+' to '+e.afterTo+' · '+e.days+' days each</p><div class="pa-table-scroll"><table class="pa-table"><thead><tr><th>Product</th><th>Price</th><th>Before CR</th><th>After CR</th><th>Conversion change</th></tr></thead><tbody>'+members.map(m=>'<tr><th>'+esc(m.name)+'</th><td>'+paMoney(m.oldPrice)+' → '+paMoney(m.newPrice)+'</td><td>'+paPercent(m.before.cr)+'</td><td>'+paPercent(m.after.cr)+'</td><td>'+(Number.isFinite(m.crChange)?paDelta(m.crChange):'Starting CR is zero or unavailable')+'</td></tr>').join('')+'</tbody></table></div>';
 if(members.length===1){const p=priceView.data.products.find(p=>p.id===e.productId);if(p){priceView.current=e;dialog.innerHTML+='<div class="pa-chart-label">Product conversion rate</div>'+paTimeline(p,e.beforeFrom,e.afterTo,'cr',true);priceView.current=null;}}
 document.body.append(dialog);dialog.querySelector('[data-pa-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
$('nav-price-analysis').onclick=()=>setPage(priceAnalysisTitle);

