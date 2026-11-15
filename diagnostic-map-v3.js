
/* Ultramedix Diagnostic Map V3.
   Uses the approved V2 poster composition, never the legacy absolute-position tree.
   All figures are read from the existing dashboard and previousDashboard objects. */
(function(){
 if(typeof diagnosticTab==='undefined'||typeof dateControls!=='function')return;
 const s=diagnosticState;
 const open=s.v3open||=new Set(['stock','variants','paid','before','after','organic','prices','offers','cvr','funnel','engagement']);
 const E=x=>esc(String(x??''));
 const N=n=>Number.isFinite(n)?fmt(n):'—';
 const P=n=>Number.isFinite(n)?pct(n):'—';
 const M=n=>Number.isFinite(n)?money(n):'—';
 const get=(d,path)=>path?.split('.').reduce((o,k)=>o?.[k],d);
 const metric=(name,d=dashboard)=>{const v=get(d,cardMetricPaths[name]);return Number.isFinite(v)?v:null;};
 const v=id=>metric(({profit:diagnosticNet,revenue:'Diagnostic Delivered Revenue',ads:'Total Ad Spend',ship:'Diagnostic Shipping Costs',delivered:'Delivered Orders',daov:'Delivered AOV',orders:'Total Orders',dr:'Delivery Rate',cancel:'Cancelled before pickup rate'})[id]);
 const val=(name)=>metric(name);
 const delta=(name)=>{
   const current=metric(name),previous=metric(name,previousDashboard);
   if(!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return '<span class="ud3-muted">—</span>';
   const change=(current-previous)/Math.abs(previous)*100;
   return '<span class="ud3-delta '+(change<0?'negative':'positive')+'">'+(change>0?'+':'')+change.toFixed(1)+'%</span>';
 };
 const stamp=(name)=>{const x=val(name);return x===null?'—':kpiValueFormat(name,x)};
 function series(name,d=dashboard){
   if(!d)return [];
   try{return (sparkDaily(d,name)||[]).filter(r=>Number.isFinite(r.value)&&(!dateFrom||r.date>=dateFrom)&&(!dateTo||r.date<=dateTo)).map(r=>({date:r.date,value:r.value})).slice(-44);}catch{return [];}
 }
 // Render the SAME dual-period chart and comparison bars already used by dashboard KPI cards.
 // These use the existing daily rolling average, date alignment and selected comparison window.
 function svgTrend(name){
   if(!name)return '<span class="ud3-nodata">No trend source</span>';
   if(typeof cardPeriodInfo==='function' && (sparkSpecs[name]||funnelRateMetrics.has(name))){
     return '<div class="ud4-period-visual" data-period-title="'+encodeURIComponent(name)+'">'+cardPeriodInfo(name)+'</div>';
   }
   const rows=series(name);
   if(rows.length<2)return '<span class="ud3-nodata">No daily trend available</span>';
   const values=rows.map(r=>r.value),lo=Math.min(...values),hi=Math.max(...values);
   const path=values.map((v,i)=>(i?'L':'M')+(i*160/(values.length-1)).toFixed(1)+','+(23-19*(v-lo)/(hi-lo||1)).toFixed(1)).join(' ');
   return '<svg class="ud3-spark" viewBox="0 0 160 27" preserveAspectRatio="none" aria-label="Current period daily trend; comparison unavailable"><path d="'+path+'" fill="none" stroke="#19a77c" stroke-width="2"/></svg>';
 }
 function kpi(id,name,main=false,extra=''){
   const label=({profit:'Profit proxy',revenue:'Delivered Revenue',ads:'Advertising Costs',ship:'Shipping Costs',delivered:'Delivered Orders',daov:'Delivered AOV',orders:'Total Orders',dr:'Delivery Rate',cancel:'Cancelled Rate'})[id];
   return '<article class="ud3-kpi '+(main?'ud3-root':'')+'" data-ud4-id="'+E(id)+'" data-search="'+E(label.toLowerCase())+'"><div class="ud3-kpi-inner"><div class="ud3-topline"><span>'+E(label)+'</span><small>'+(main?'ROOT':'KPI')+'</small></div><div class="ud3-numline"><b>'+E(stamp(name))+'</b>'+delta(name)+'</div>'+svgTrend(name)+extra+'</div></article>';
 }
 const keys={profit:diagnosticNet,revenue:'Diagnostic Delivered Revenue',ads:'Total Ad Spend',ship:'Diagnostic Shipping Costs',delivered:'Delivered Orders',daov:'Delivered AOV',orders:'Total Orders',dr:'Delivery Rate',cancel:'Cancelled before pickup rate'};
 function contribution(id){
   if(!previousDashboard)return '';
   let list=[],note='';
   if(id==='profit'){
     const a=metric(keys.revenue),b=metric(keys.revenue,previousDashboard),c=metric(keys.ship),d=metric(keys.ship,previousDashboard);
     if([a,b,c,d].every(Number.isFinite)){list=[['Delivered Revenue',a-b],['Shipping Costs',d-c]];note='This is the existing revenue − shipping proxy. Ad spend is shown separately, not deducted by this KPI.';}
   }else if(id==='revenue'){
     const n=metric(keys.delivered),n0=metric(keys.delivered,previousDashboard),a=metric(keys.daov),a0=metric(keys.daov,previousDashboard);
     if([n,n0,a,a0].every(Number.isFinite)){list=[['Delivered Orders',(n-n0)*(a+a0)/2],['Delivered AOV',(a-a0)*(n+n0)/2]];note='Symmetric decomposition of Orders × AOV, using the same delivered-order population.';}
   }else if(id==='orders'){
     const tot=metric(keys.orders),old=metric(keys.orders,previousDashboard);
     if([tot,old].every(Number.isFinite)){
       const sum=(d,t)=>(d?.orderVisitChannelAnalysis||[]).reduce((z,r)=>z+(String(r.medium||'').toLowerCase()===t?(Number(r.firstOrders)||0):0),0);
       const pd=sum(dashboard,'paid')-sum(previousDashboard,'paid'),og=sum(dashboard,'organic')-sum(previousDashboard,'organic');
       list=[['Paid',pd],['Organic',og],['Other / unclassified',(tot-old)-pd-og]];
       note='First-click Shopify attribution; the residual keeps the channel split additive. Descriptive, not causal.';
     }
   }
   if(!list.length)return '';
   const max=Math.max(1,...list.map(x=>Math.abs(x[1])));
   return '<div class="ud3-contribution"><div class="ud3-contribution-title">Contribution to Change</div>'+list.map(([name,change])=>'<div class="ud3-contribrow"><span>'+E(name)+'</span><b class="'+(change<0?'negative':'positive')+'">'+(change>0?'+':'')+E(id==='orders'?N(change):M(change))+'</b></div><div class="ud3-track"><i style="width:'+(Math.abs(change)/max*100).toFixed(1)+'%;background:'+(change<0?'#d27c70':'#419b76')+'"></i></div>').join('')+'<p class="ud3-muted">'+E(note)+'</p></div>';
 }
 function small(name,title=name){
   return '<div class="ud3-mini" data-search="'+E(title.toLowerCase())+'"><span class="ud3-mini-title" title="'+E(title)+'">'+E(title)+'</span><div class="ud3-mini-num"><b>'+E(stamp(name))+'</b>'+delta(name)+'</div>'+svgTrend(name)+'</div>';
 }
 function custom(title,value,info=''){
   return '<div class="ud3-mini" data-search="'+E(title.toLowerCase())+'"><span class="ud3-mini-title">'+E(title)+'</span><div class="ud3-mini-num"><b>'+E(value)+'</b></div>'+(info?'<span class="ud3-muted">'+E(info)+'</span>':'')+'</div>';
 }
 const minis=(...a)=>'<div class="ud3-minis">'+a.join('')+'</div>';
 function terminal(qs,tab,button='Open existing analysis'){
   return '<div class="ud3-ask"><div class="ud3-ask-title">Questions to investigate <span>TERMINAL</span></div><ul>'+qs.map(q=>'<li>'+E(q)+'</li>').join('')+'</ul>'+(tab?'<button type="button" data-ud3-tab="'+E(tab)+'">↗ '+E(button)+'</button>':'')+'</div>';
 }
 function section(id,title,content,tag=''){
   return '<div class="ud3-section" data-ud3-section="'+E(id)+'" data-search="'+E(title.toLowerCase())+'"><button class="ud3-section-head" type="button" data-ud3-toggle="'+E(id)+'" aria-expanded="'+open.has(id)+'"><strong>⌁ '+E(title)+'</strong><span>'+E(tag)+' <b>'+(open.has(id)?'⌄':'›')+'</b></span></button><div class="ud3-section-body"'+(open.has(id)?'':' hidden')+'>'+content+'</div></div>';
 }
 function column(id,title,subtitle,body){
   return '<div class="ud3-column ud3-'+E(id)+'"><div class="ud3-colhead" data-ud4-id="'+E(id)+'"><div><h3>'+E(title)+'</h3><p>'+E(subtitle)+'</p></div><button type="button" data-ud3-column="'+id+'" aria-label="Collapse '+E(title)+'">−</button></div><div class="ud3-colbody">'+body+'</div></div>';
 }
 function stock(){
   const products=inventoryProductGroups(dashboard.inventory||{variants:[]},{period:s.stockPeriod??28}).products||[];
   const currentUnits=products.reduce((z,p)=>z+(p.known&&Number.isFinite(p.stock)?p.stock:0),0);
   const stockKnown=products.some(p=>p.known);
   const variantCount=products.reduce((z,p)=>z+p.variants.length,0);
   const rows=products.flatMap(p=>p.variants.map(x=>({product:p.name,variant:x.row.variant||'Default',stock:x.row.stock,units:x.units})));
   const table='<div class="ud3-tablewrap"><table><thead><tr><th>Product / Variant</th><th>Stock</th><th>Units sold</th></tr></thead><tbody>'+rows.slice(0,7).map(r=>'<tr><td title="'+E(r.product+' · '+r.variant)+'">'+E(r.product+' · '+r.variant)+'</td><td>'+E(N(r.stock))+'</td><td>'+E(N(r.units))+'</td></tr>').join('')+'</tbody></table></div>';
   return column('product','01 · Product','Stock & variants',
    section('stock','Product Stock',minis(custom('Available Units',stockKnown?N(currentUnits):'—','Current snapshot'),custom('Tracked Products',N(products.length)))+
     '<p class="ud3-note">Current stock is not proof of historical stock availability.</p>'+terminal(['Were the affected products available during the decline?','Was there a restock or supply delay?'],'Inventory','Open Inventory Tracking'),'CURRENT')+
    section('variants','Variants Stock',minis(custom('Variants',N(variantCount)),custom('Products',N(products.length)))+table+terminal(['Did a best-selling variant run out?','Are historical orders correctly linked to the same SKU?'],'Inventory','Open Variant Stock'),'VARIANTS'));
 }
 function traffic(kind){
   const rows=(dashboard.orderVisitChannelAnalysis||[]).filter(r=>String(r.medium||'').toLowerCase()===kind).slice().sort((a,b)=>(b.firstOrders||0)-(a.firstOrders||0));
   const orders=rows.reduce((z,r)=>z+(Number(r.firstOrders)||0),0);
   return '<div class="ud3-traffic-total">'+E(kind.toUpperCase())+' — '+E(N(orders))+' first-click orders</div>'+
    '<div class="ud3-tablewrap"><table><thead><tr><th>Source</th><th>Orders</th></tr></thead><tbody>'+rows.slice(0,6).map(r=>'<tr><td>'+E(r.source||r.name||'Unknown')+'</td><td>'+E(N(r.firstOrders))+'</td></tr>').join('')+'</tbody></table></div>';
 }
 function funnel(kind='ga4'){
   const spec=funnelStageSpecs[kind],source=kind==='ga4'?dashboard.websiteFunnel:dashboard.adFunnel;
   if(!spec||!source)return '<p class="ud3-note">Funnel data is unavailable for the selected dates.</p>';
   const counts=spec.counts.map(([label,key])=>({label,value:source[key]}));
   const biggest=Math.max(1,...counts.map(x=>Number.isFinite(x.value)?x.value:0));
   return '<div class="ud3-funnel">'+counts.map((r,i)=>'<div class="ud3-frow"><span>'+E(r.label)+'</span><div class="ud3-fbar"><i style="width:'+(Number.isFinite(r.value)?(r.value/biggest*100).toFixed(1):0)+'%"></i></div><b>'+E(N(r.value))+'</b></div>').join('')+'</div>'+
    '<div class="ud3-step-rates">'+spec.rates.map((title,i)=>{const value=funnelRate(...funnelRateValues(dashboard,kind,i+1));return custom(title,value===null?'—':P(value));}).join('')+'</div>';
 }

 function creativeSummary(){
   if(typeof loadDiagnosticCreative==='function')loadDiagnosticCreative();
   const data=diagnosticCreative?.data;
   if(!data)return '<p class="ud3-note">Creative metrics '+(diagnosticCreative?.error?'unavailable.':'loading from the existing Creative Analysis report…')+'</p>';
   const rows=(data.records||[]).filter(r=>r.date>=data.start&&r.date<=data.end);
   const sum=(records,key)=>records.reduce((v,r)=>v+(Number.isFinite(r[key])?r[key]:0),0);
   const plays=sum(rows,'videoPlays');
   const weight=sum(rows,'timeWeight');
   const avgTime=weight?rows.reduce((v,r)=>v+(Number.isFinite(r.avgTime)&&Number.isFinite(r.timeWeight)?r.avgTime*r.timeWeight:0),0)/weight:null;
   const fields=[['3-second View Rate','plays3'],['25% Watched','video25'],['50% Watched','video50'],['75% Watched','video75'],['100% Watched','video100']];
   return minis(custom('Average Play Time',Number.isFinite(avgTime)?avgTime.toFixed(2)+' s':'—'),
     ...fields.map(([title,key])=>custom(title,plays?P(sum(rows,key)/plays):'—')))+
     '<p class="ud3-note">Milestones are ratios of video plays, using the existing Creative Analysis definitions.</p>';
 }
 function promotion(){
   const meta=section('paid','Paid → Meta Ads',
     minis(small('Total Ad Spend','Amount Spent'),small('Meta purchase events','Purchases (Meta)'),small('Meta Ads CPA','CPA'))+
     '<div class="ud3-branch-label">CPA → before outbound / after outbound</div>'+
     section('before','Before Outbound Click',
       minis(small('CPM (Meta Sales)','CPM'),small('CTR (Meta Sales)','CTR (Meta Sales)'),small('Meta impressions','Impressions'),small('Cost per outbound click','Cost / Outbound Click'))+
       section('creative','Creative Viewing Funnel',open.has('creative')?creativeSummary():'<p class="ud3-note">Open to inspect creative viewing milestones.</p>','CREATIVE')+
       '<p class="ud3-note">Meta CTR is not automatically Outbound CTR. Missing metrics stay unavailable.</p>'+
       terminal(['Is the change concentrated in particular creatives or audiences?','Did CPM, placement mix or frequency change?'],'Creative Analysis','Open Ads & Creative Analysis'),'META')+
     section('after','After Outbound Click',
       funnel('ads')+minis(small('GA4 sessions','GA4 Sessions'),small('GA4 engagement rate','Engagement Rate'),small('GA4 bounce rate','Bounce Rate'))+
       '<p class="ud3-note">Meta-reported purchases and Shopify orders have different attribution definitions.</p>'+
       terminal(['At which stage did conversion weaken?','Did the landing page, offer or checkout change?'],'Ads','Open Ads Funnel Analysis'),'FUNNEL')
   ,'ADS');
   const organic=section('organic','Organic Channels',traffic('organic')+
     terminal(['Did organic channel composition or content change?'],'Channels','Open Channels Analysis'),'FIRST CLICK');
   return column('promotion','02 · Promotion','Paid & organic channels',meta+organic);
 }
 function prices(){
   const original=diagnosticPrices();
   return '<div class="ud3-chart-box">'+original+'</div>'+terminal(['Did prices change before the drop?','Did the customer-visible offer or discount end?'],'Products & Page Analysis','Open Product Analysis');
 }
 function offers(){
   const rows=dashboard.diagnostic?.offers||[];
   if(!rows.length)return '<p class="ud3-note">No order-discount history available.</p>';
   return '<div class="ud3-chart-box">'+diagnosticLine([['Total Orders',rows.map(r=>({date:r.date,value:r.orders}))],['Orders with Offers',rows.map(r=>({date:r.date,value:r.offers}))]],fmt)+'</div>'+
    terminal(['Was the offer discontinued or its terms changed?','Were offer-linked products available?'],'Daily Performance (most important)','Open Daily Orders Analysis');
 }
 function price(){
   return column('price','03 · Price & Offers','Pricing, discounts & promotions',
    section('prices','Product Price Changes',prices(),'HISTORY')+
    section('offers','Offers Performance',offers(),'ORDERS'));
 }
 function place(){
   return column('place','04 · Place','Website & conversion',
    section('cvr','Website Conversion Rate',minis(small('Conversion Rate','Website CVR'),small('GA4 sessions','Sessions'))+'<p class="ud3-note">Website conversion rate is not the terminal metric — inspect the funnel below.</p>','CVR')+
    section('funnel','Website Conversion Funnel',funnel('ga4')+
      terminal(['Which measurable stage lost the most conversion?','Did checkout, shipping conditions or device experience change?'],'GA4 Data','Open GA4 Funnel'),'GA4')+
    section('engagement','Engagement',minis(small('GA4 engagement rate','Engagement Rate'),small('GA4 bounce rate','Bounce Rate'),small('Average engagement time','Average Engagement Time'),small('GA4 engaged sessions','Engaged Sessions'),small('Average session duration','Avg Session Duration'),small('Average pages per session','Pages / Session'))+
     terminal(['Did incoming audience or landing-page content change?'],'GA4 Data','Open Engagement Analysis'),'TRAFFIC')+
    section('experience','Website Experience / CRO','<p class="ud3-note">Page-level sessions and available site metrics belong in the existing page analysis; CRO is not a standalone calculated KPI.</p>'+
      (dashboard.pagesAnalysis?.length?'<div class="ud3-tablewrap"><table><thead><tr><th>Page</th><th>Sessions</th></tr></thead><tbody>'+dashboard.pagesAnalysis.slice(0,5).map(r=>'<tr><td>'+E(r.title||r.page||r.path||'Page')+'</td><td>'+N(r.sessions)+'</td></tr>').join('')+'</tbody></table></div>':'')+
      terminal(['Was a landing page, device experience or checkout changed?'],'Products & Page Analysis','Open Page Analysis'),'CRO'));
 }
 function spine(){
   // Contributions attach to their own parent metrics, never pooled into a shared row.
   const owner=(id,name,root=false)=>'<div class="ud4-owner ud4-'+id+'-owner">'+kpi(id,name,root)+contribution(id)+'</div>';
   return '<div class="ud3-spine">'+owner('profit',keys.profit,true)+
     '<div class="ud4-spine-caption">Profit → Delivered Revenue / Advertising Costs / Shipping Costs</div>'+
     '<div class="ud3-spine-row ud3-row1">'+owner('revenue',keys.revenue)+kpi('ads',keys.ads)+kpi('ship',keys.ship)+'</div>'+
     '<div class="ud4-spine-caption">Delivered Revenue → Delivered Orders / Delivered AOV</div>'+
     '<div class="ud3-spine-row ud3-row2">'+kpi('delivered',keys.delivered)+kpi('daov',keys.daov)+'</div>'+
     '<div class="ud4-spine-caption">Delivered Orders → Total Orders / Delivery Rate / Cancelled Rate</div>'+
     '<div class="ud3-spine-row ud3-row3">'+owner('orders',keys.orders)+
      '<div class="ud4-owner">'+kpi('dr',keys.dr)+
       '<div class="ud3-miniquestion"><h4>Delivery Rate <span>TERMINAL</span></h4><p>Did couriers, regions or delivery confirmation change? Compare completed cohorts.</p><button data-ud3-tab="Shipping and operation Analysis">↗ Open Shipping Analysis</button></div></div>'+
      '<div class="ud4-owner">'+kpi('cancel',keys.cancel)+
       '<div class="ud3-miniquestion"><h4>Cancelled Rate <span>TERMINAL</span></h4><p>Did cancellation, customer confirmation or stock availability change?</p><button data-ud3-tab="Shipping and operation Analysis">↗ Open Shipping Analysis</button></div></div></div>'+
     '<p class="ud3-branch-intro">TOTAL ORDERS → FOUR DIAGNOSTIC BRANCHES ↓</p></div>';
 }
 function drawFlowArrows(root){
   const board=root.querySelector('.ud3-canvas'),svg=board?.querySelector('.ud4-connectors');
   if(!board||!svg)return;
   const boardRect=board.getBoundingClientRect();
   const width=board.clientWidth,height=board.scrollHeight;
   svg.setAttribute('viewBox','0 0 '+width+' '+height);
   const getRect=(id,asSource=false)=>{
     const card=board.querySelector('[data-ud4-id="'+id+'"]');
     if(!card)return null;
     // Start after the parent's own Contribution / terminal explanation, not through it.
     const el=asSource?(card.closest('.ud4-owner')||card):card;
     const r=el.getBoundingClientRect();
     return {x:r.left+r.width/2-boardRect.left,y:r.top-boardRect.top,bottom:r.bottom-boardRect.top};
   };
   const connectors=[
     ['profit',['revenue','ads','ship']],
     ['revenue',['delivered','daov']],
     ['delivered',['orders','dr','cancel']],
     ['orders',['product','promotion','price','place']]
   ];
   const paths=[];
   for(const [source,targets] of connectors){
     const s=getRect(source,true);
     if(!s)continue;
     const children=targets.map(getRect).filter(Boolean);
     if(!children.length)continue;
     // Connectors are routed through a horizontal rail with separate downward arrowheads.
     // Parent annotations remain attached beneath their own metric cards.
     const rail=(s.bottom+Math.min(...children.map(c=>c.y)))/2;
     if(rail<=s.bottom+7)continue;
     const range=[s.x,...children.map(c=>c.x)];
     paths.push('<path d="M'+s.x.toFixed(1)+' '+s.bottom.toFixed(1)+' V'+rail.toFixed(1)+' H'+Math.min(...range).toFixed(1)+' M'+Math.min(...range).toFixed(1)+' '+rail.toFixed(1)+' H'+Math.max(...range).toFixed(1)+'" stroke="#76ab94" stroke-width="1.8" fill="none" stroke-linecap="round"/>');
     for(const c of children){
       paths.push('<path d="M'+c.x.toFixed(1)+' '+rail.toFixed(1)+' V'+Math.max(rail+2,c.y-5).toFixed(1)+'" stroke="#76ab94" stroke-width="1.8" fill="none" stroke-linecap="round"/>');
       paths.push('<path d="M'+(c.x-4).toFixed(1)+' '+(c.y-8).toFixed(1)+' L'+c.x.toFixed(1)+' '+(c.y-2).toFixed(1)+' L'+(c.x+4).toFixed(1)+' '+(c.y-8).toFixed(1)+'" stroke="#398569" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none"/>');
     }
   }
   svg.innerHTML=paths.join('');
 }
 function scheduleFlow(root){
   cancelAnimationFrame(s.v4flowFrame||0);
   s.v4flowFrame=requestAnimationFrame(()=>drawFlowArrows(root));
 }
 function render(){
   if(page!==diagnosticTab||!dashboard)return;
   s.layoutObserver?.disconnect(); // Disable old absolute-position engine.
   const root=$('content');
   root.innerHTML='<div class="section-head ud3-page-head"><h2>Diagnostic Map</h2>'+dateControls()+'</div>'+
    '<div class="ud3-toolbar"><label>Search <input id="ud3-search" type="search" placeholder="Search metrics..." value="'+E(s.v3search||'')+'"></label><button data-ud3-action="compact">Compact</button><button data-ud3-action="expand">Expand all</button><button data-ud3-action="collapse">Collapse all</button></div>'+
    '<div class="ud3-canvas '+(s.v3dense===false?'':'ud3-compact')+'"><svg class="ud4-connectors" aria-hidden="true"></svg><div class="ud3-eyebrow"><span>PERFORMANCE → DRIVERS → TERMINAL QUESTIONS</span><span>Actual store data · Selected period</span></div>'+spine()+
    '<div class="ud3-columns">'+stock()+promotion()+price()+place()+'</div></div>';
   root.onclick=e=>{
     const toggle=e.target.closest('[data-ud3-toggle]');
     if(toggle){const id=toggle.dataset.ud3Toggle;open.has(id)?open.delete(id):open.add(id);render();return;}
     const columnButton=e.target.closest('[data-ud3-column]');
     if(columnButton){const body=columnButton.closest('.ud3-column')?.querySelector('.ud3-colbody');if(body){body.hidden=!body.hidden;columnButton.textContent=body.hidden?'+':'−';scheduleFlow(root);}return;}
     const tab=e.target.closest('[data-ud3-tab]');
     if(tab){const dest=tab.dataset.ud3Tab;if(dest==='Creative Analysis')$('nav-creative')?.click();else setPage(dest);return;}
     const action=e.target.closest('[data-ud3-action]');
     if(action){const a=action.dataset.ud3Action;if(a==='expand')for(const x of ['stock','variants','paid','before','after','organic','prices','offers','cvr','funnel','engagement','experience'])open.add(x);else if(a==='collapse')open.clear();else s.v3dense=!(s.v3dense!==false);render();}
   };
   root.onchange=e=>{
     if(e.target.id==='dt-product'||e.target.id==='dt-variant'){
       s[e.target.id==='dt-product'?'product':'variant']=e.target.value;
       render();
     }
   };
   const search=root.querySelector('#ud3-search');
   search.oninput=e=>{
     s.v3search=e.target.value;
     const q=s.v3search.toLowerCase().trim();
     root.querySelectorAll('.ud3-match').forEach(el=>el.classList.remove('ud3-match'));
     if(!q)return;
     const target=[...root.querySelectorAll('[data-search]')].find(el=>(el.dataset.search||'').includes(q));
     if(target){const sections=[];for(let p=target.closest('[data-ud3-section]');p;p=p.parentElement?.closest('[data-ud3-section]'))sections.push(p.dataset.ud3Section);const closed=sections.filter(id=>!open.has(id));if(closed.length){closed.forEach(id=>open.add(id));render();return;}target.classList.add('ud3-match');target.scrollIntoView({block:'nearest',behavior:'smooth'});}
   };
   bindDateRange();
   // Keep arrows in sync with page width, date filter, and section expansion.
   scheduleFlow(root);
   s.v4observer?.disconnect();
   if(typeof ResizeObserver!=='undefined'){
     s.v4observer=new ResizeObserver(()=>scheduleFlow(root));
     const board=root.querySelector('.ud3-canvas');
     if(board)s.v4observer.observe(board);
     root.querySelectorAll('.ud3-kpi,.ud3-column').forEach(node=>s.v4observer.observe(node));
   }
 }
 renderDiagnosticTree=render;
 renderDiagnosticDetails=function(){};
 // The old refresh handler only updated the map if #dt-viewport existed.
 // This poster intentionally has no viewport; update comparison visuals on the new map.
 const priorRefresh=refreshComparisonCards;
 refreshComparisonCards=function(){
   priorRefresh();
   if(page===diagnosticTab&&dashboard)renderDiagnosticTree();
 };
 if(page===diagnosticTab&&dashboard)render();
})();
