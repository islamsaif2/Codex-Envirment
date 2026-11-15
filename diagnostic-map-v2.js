
/* Diagnostic V2 enhancement: keep the existing authenticated data and metric logic. */
(function installDiagnosticV2(){
  if(typeof renderDiagnosticTree!=='function'||typeof diagnosticState==='undefined')return;
  const oldRender=renderDiagnosticTree;
  // Add available low-level Meta cost drivers, without generating unsupported values.
  const beforeBranch=diagnosticNodes.get('before')?.node;
  if(beforeBranch){
    for(const [id,label,metric] of [['meta-impressions','Impressions','Meta impressions'],['outbound-cpc','Cost per Outbound Click','Cost per outbound click']]){
      if(cardMetricPaths[metric] && !diagnosticNodes.has(id)){
        const item=[id,label,'ice',metric];
        beforeBranch[4].push(item);
        diagnosticNodes.set(id,{node:item,parent:'before'});
      }
    }
  }
  const defaultExpanded=['profit','revenue','delivered','orders','promotion','paid','meta','cpa','before','after','price','place','engagement'];
  for(const id of defaultExpanded)diagnosticState.open.add(id);
  const ownerQuestions={
    'delivery':{q:['Did the courier or confirmation process change?','Are particular regions or products delaying delivery?'],tab:'Shipping'},
    'cancel':{q:['Did order confirmation or customer-service handling change?','Were affected products unavailable or delayed?'],tab:'Shipping'},
    'product-stock':{q:['Were the important variants available when orders declined?','Was there a supplier delay or restock?'],tab:'Inventory'},
    'cpm':{q:['Did targeting, placement or budget strategy change?','Did auction costs rise across campaigns?'],tab:'Ads'},
    'ctr':{q:['Did the same creatives lose engagement over time?','Did frequency increase for the affected audience?'],tab:'Creative Analysis'},
    'play-time':{q:['Did the creative opening or product message change?'],tab:'Creative Analysis'},
    'creative-funnel':{q:['At which viewing milestone are audiences dropping off?'],tab:'Creative Analysis'},
    'prices':{q:['Was the price change intentional, and on which variants?','Did the discount or offer end?'],tab:'Products & Page Analysis'},
    'offers':{q:['Did the offer end or change its conditions?','Were the discounted products available?'],tab:'Orders'},
    'funnel':{q:['Which funnel stage shows the largest change?','Was checkout or shipping policy changed?'],tab:'GA4'},
    'ga-after':{q:['Which stage between landing and purchase worsened?'],tab:'GA4'},
    'experience':{q:['Did the affected landing pages or device experience change?'],tab:'Products & Page Analysis'},
    'eng-rate':{q:['Did traffic quality or landing-page content change?'],tab:'GA4'},
    'eng-bounce':{q:['Did mobile or campaign landing traffic change?'],tab:'GA4'},
    'eng-time':{q:['Did page content or incoming visitors change?'],tab:'GA4'},
    'organic-table':{q:['Did organic channel mix change?'],tab:'Channels'},
    'paid-table':{q:['Which paid source changed most?'],tab:'Channels'}
  };
  const num=v=>Number.isFinite(v)?Math.round(v).toLocaleString('en-US'):'—';
  function readMetric(data,name){
    if(!data||!name)return NaN;
    const path=cardMetricPaths[name];
    if(!path)return NaN;
    const parts=path.split('.');
    const value=parts.reduce((o,key)=>o?.[key],data);
    return typeof value==='number'?value:Number(value);
  }
  function row(title,amount,max,unit){
    const frac=max>0?Math.min(100,Math.max(0,Math.abs(amount)/max*100)):0;
    return '<div class="dt-v2-row"><span>'+esc(title)+'</span><b>'+esc(unit==='money'?money(amount):num(amount))+'</b></div><div class="dt-v2-track"><i style="width:'+frac.toFixed(1)+'%"></i></div>';
  }
  function contributions(id){
    if(!previousDashboard||!dashboard)return '';
    let items=[],note='';
    if(id==='profit'){
      const cur=dashboard.diagnostic||{},prev=previousDashboard.diagnostic||{};
      if([cur.revenue,prev.revenue,cur.shipping,prev.shipping].every(Number.isFinite)){
        items=[['Delivered Revenue',cur.revenue-prev.revenue],['Shipping Costs',-(cur.shipping-prev.shipping)]];
        note='Profit follows the existing revenue minus shipping definition. Ad spend is not deducted from this KPI.';
      }
    }
    if(id==='revenue'){
      const cur=dashboard.diagnostic||{},prev=previousDashboard.diagnostic||{};
      const nc=readMetric(dashboard,'Delivered Orders'),np=readMetric(previousDashboard,'Delivered Orders');
      const ac=cur.deliveredAov,ap=prev.deliveredAov;
      if([nc,np,ac,ap].every(Number.isFinite)){
        items=[['Delivered Orders',(nc-np)*(ac+ap)/2],['Delivered AOV',(ac-ap)*(nc+np)/2]];
        note='Symmetric revenue decomposition; rounded amounts may differ slightly.';
      }
    }
    if(id==='orders'){
      const get=(data,key)=>(data?.orderVisitChannelAnalysis||[]).reduce((sum,r)=>sum+(String(r.medium||'').toLowerCase()===key?Number(r.firstOrders)||0:0),0);
      const groups=['paid','organic'];
      const curTotal=readMetric(dashboard,'Total Orders'),prevTotal=readMetric(previousDashboard,'Total Orders');
      if([curTotal,prevTotal].every(Number.isFinite)){
        items=groups.map(k=>[k[0].toUpperCase()+k.slice(1),get(dashboard,k)-get(previousDashboard,k)]);
        const residual=(curTotal-prevTotal)-items.reduce((s,x)=>s+x[1],0);
        items.push(['Other / unclassified',residual]);
        note='Shopify first-click groups plus the residual. This is a descriptive channel split, not a causal attribution.';
      }
    }
    if(!items.length||!items.every(x=>Number.isFinite(x[1])))return '';
    const max=Math.max(1,...items.map(x=>Math.abs(x[1])));
    const moneyMode=id!=='orders';
    return '<section class="dt-v2-insight"><h4>Contribution to change</h4>'+items.map(x=>row(x[0],x[1],max,moneyMode?'money':'count')).join('')+'<p class="dt-v2-muted">'+esc(note)+'</p></section>';
  }
  function trend(id,metric){
    if(!metric||typeof sparkDaily!=='function')return '';
    const points=(sparkDaily(dashboard,metric)||[]).filter(x=>Number.isFinite(x.value)).slice(-25);
    if(points.length<2)return '';
    const values=points.map(x=>x.value),min=Math.min(...values),max=Math.max(...values);
    const pts=values.map((v,i)=>((i/(values.length-1))*200).toFixed(1)+','+(43-(v-min)/(max-min||1)*35).toFixed(1)).join(' ');
    return '<div class="dt-v2-inline-graph"><svg viewBox="0 0 200 49" preserveAspectRatio="none" role="img" aria-label="Daily metric trend"><polyline fill="none" stroke="#198c69" stroke-width="2.5" points="'+pts+'"/></svg></div>';
  }
  function inlineChart(id){
    if(id==='prices')return diagnosticPrices();
    if(id==='offers'){
      const d=dashboard.diagnostic?.offers;
      if(!Array.isArray(d)||!d.length)return '<p class="dt-v2-muted">No recorded offer timeline for these dates.</p>';
      return diagnosticLine([['Total Orders',d.map(r=>({date:r.date,value:r.orders}))],['Orders with Offers',d.map(r=>({date:r.date,value:r.offers}))]],fmt);
    }
    return '';
  }
  function appendAfter(branch,html){if(!html)return;const div=document.createElement('div');div.innerHTML=html;while(div.firstChild)branch.appendChild(div.firstChild);}
  function enhance(root){
    const ids=['profit','revenue','orders'];
    for(const id of ids){
      const button=root.querySelector('[data-dt-node="'+id+'"]');
      const branch=button?.closest('li.dt-branch');
      if(branch)appendAfter(branch,contributions(id));
    }
    for(const [id,item] of Object.entries(ownerQuestions)){
      const button=root.querySelector('[data-dt-node="'+id+'"]');
      const branch=button?.closest('li.dt-branch');
      if(!branch)continue;
      const children=diagnosticNodes.get(id)?.node?.[4];
      if(children?.length)continue; // Only terminal diagnostic cards may link out.
      const questions='<ul class="dt-v2-questions">'+item.q.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>';
      appendAfter(branch,'<section class="dt-v2-insight"><h4>Questions to investigate</h4>'+questions+'<button type="button" class="dt-v2-link" data-dt-tab="'+esc(item.tab)+'">Open '+esc(item.tab)+' analysis ↗</button></section>');
    }
    for(const id of ['prices','offers']){
      const button=root.querySelector('[data-dt-node="'+id+'"]');
      const branch=button?.closest('li.dt-branch');
      if(!branch)continue;
      appendAfter(branch,'<section class="dt-v2-chart-panel">'+inlineChart(id)+'</section>');
    }
    const stock=root.querySelector('[data-dt-node="product-stock"]');
    if(stock){
      const branch=stock.closest('li.dt-branch');
      const panel=branch?.querySelector(':scope > .dt-map-panel');
      if(panel){
        panel.insertAdjacentHTML('beforeend','<p class="dt-v2-note">Current stock and reported sales velocity; not historical availability.</p><button type="button" class="dt-v2-link" data-dt-tab="Inventory">Open Inventory analysis ↗</button>');
      }
    }
    // Existing daily trends become tiny inline graphs only where a node has no chart.
    for(const [id,entry] of diagnosticNodes){
      const metric=entry.node[3];
      if(!metric)continue;
      const el=root.querySelector('[data-dt-node="'+id+'"]');
      if(el && !el.querySelector('.dt-mini svg')){
        const chart=trend(id,metric);
        if(chart)el.insertAdjacentHTML('beforeend',chart);
      }
    }
    const title=root.querySelector('.dt-head h2');
    if(title)title.textContent='Diagnostic Map · Root Cause Explorer';
    const viewport=root.querySelector('#dt-viewport');
    if(viewport){viewport.scrollLeft=0;viewport.scrollTop=0;}
    for(const select of root.querySelectorAll('#dt-product,#dt-variant')){
      select.addEventListener('change',()=>{
        diagnosticState[select.id==='dt-product'?'product':'variant']=select.value;
        renderDiagnosticTree();
      });
    }
  }
  renderDiagnosticDetails=function(){const pane=document.getElementById('dt-detail');if(pane){pane.hidden=true;pane.innerHTML='';}};
  renderDiagnosticTree=function(){
    const keepZoom=diagnosticState.zoom;
    diagnosticState.zoom=1;
    try{oldRender();}finally{diagnosticState.zoom=keepZoom;}
    if(page!==diagnosticTab)return;
    const root=document.getElementById('content');
    if(root)enhance(root);
  };
  document.addEventListener('click',e=>{
    if(page!==diagnosticTab)return;
    const node=e.target.closest('[data-dt-node]');
    if(node){diagnosticState.chartOpen=false;}
  },true);
  if(page===diagnosticTab&&dashboard)renderDiagnosticTree();
})();
