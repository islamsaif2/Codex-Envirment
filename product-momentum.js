(function(){
  const palette=["#4066D4","#DC7849","#2F9A83","#9A6BD0","#D9A02E","#4C91BD","#D96691","#648C4D","#98664C","#7C83CA","#26A3B2","#B47B5D","#7F6AAA","#A4A13C","#CF6990","#6B9BA8","#8D9D47","#AA78B4","#447FBC","#D38B63"];
  const state={shown:5,rows:12,hidden:new Set(),sort:"orders",search:""};
  const e=s=>esc(String(s??""));
  const fmtN=n=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
  const totals=p=>p.daily.reduce((n,x)=>n+x,0);
  const recent=p=>p.daily.slice(-7).reduce((n,x)=>n+x,0);
  const previous=p=>p.daily.slice(-14,-7).reduce((n,x)=>n+x,0);
  const getData=()=>dashboard&&dashboard.productMomentum?dashboard.productMomentum:{days:[],products:[]};
  const point=(values,i,left,top,w,h,max)=>[left+(values.length<2?w/2:i*w/(values.length-1)),top+h-h*values[i]/Math.max(1,max)];
  const poly=(values,left,top,w,h,max)=>values.map((v,i)=>{const xy=point(values,i,left,top,w,h,max);return(i?"L":"M")+xy[0].toFixed(1)+" "+xy[1].toFixed(1);}).join(" ");
  // Moving seven-day daily-order average: the final point equals last-7-days orders / 7.
  // Showing this same measure throughout prevents single-day spikes from contradicting
  // the Rising/Falling weekly comparison shown alongside each product.
  const rolling=p=>p.daily.map((_,i)=>{const part=p.daily.slice(Math.max(0,i-6),i+1);return part.reduce((a,b)=>a+b,0)/part.length;});
  // Monotone cubic interpolation, avoiding the false peaks ordinary smoothing can add.
  const smooth=(values,left,top,w,h,max)=>{
    const pts=values.map((_,i)=>point(values,i,left,top,w,h,max));
    if(!pts.length)return "";if(pts.length===1)return "M"+pts[0][0]+" "+pts[0][1];
    const n=pts.length,dx=pts[1][0]-pts[0][0];
    const slopes=Array.from({length:n-1},(_,i)=>(pts[i+1][1]-pts[i][1])/dx);
    const tangent=Array.from({length:n},(_,i)=>{
      if(i===0)return slopes[0];if(i===n-1)return slopes[n-2];
      if(slopes[i-1]*slopes[i]<=0)return 0;
      return 2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]);
    });
    let d="M"+pts[0][0].toFixed(2)+" "+pts[0][1].toFixed(2);
    for(let i=0;i<n-1;i++){
      const a=pts[i],b=pts[i+1],handle=dx/3;
      d+=" C"+(a[0]+handle).toFixed(2)+" "+(a[1]+handle*tangent[i]).toFixed(2)+
      " "+(b[0]-handle).toFixed(2)+" "+(b[1]-handle*tangent[i+1]).toFixed(2)+
      " "+b[0].toFixed(2)+" "+b[1].toFixed(2);
    }return d;
  };
  const nLabel=v=>v===0?"0":Number.isInteger(v)?String(v):v.toFixed(1);
  function trendStatus(p){
    if(p.daily.length<14)return{label:"Not enough data",className:"steady"};
    const now=recent(p),prior=previous(p),delta=now-prior;
    if(delta>=2&&now>=prior*1.2)return{label:prior===0?"New growth":"Rising",className:"up"};
    if(delta<=-2&&now<=prior*.8)return{label:"Falling",className:"down"};
    return{label:"Stable",className:"steady"};
  }
  function bigGraph(series,days){
    const W=820,H=314,L=47,R=18,T=20,B=38,PW=W-L-R,PH=H-T-B;
    const lines=series.map(x=>({...x,values:rolling(x.product)}));
    const max=Math.max(1,...lines.flatMap(x=>x.values));
    const upper=Math.ceil(max*4)/4||1;
    let svg='<svg class="pm-big-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Smoothed seven-day daily orders average per product">';
    for(let i=0;i<=4;i++){
      const y=T+PH*i/4;
      svg+='<path d="M'+L+' '+y+'H'+(W-R)+'" stroke="currentColor" stroke-opacity=".11"/>';
      svg+='<text class="pm-axis" x="'+(L-9)+'" y="'+(y+4)+'" text-anchor="end">'+(upper*(1-i/4)).toFixed(1)+'</text>';
    }
    const positions=[0,Math.floor((days.length-1)/3),Math.floor(2*(days.length-1)/3),days.length-1].filter((n,i,a)=>n>=0&&a.indexOf(n)===i);
    for(const idx of positions){const x=point(days.map(()=>0),idx,L,T,PW,PH,1)[0];svg+='<text class="pm-axis" x="'+x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+e(days[idx].slice(5))+'</text>';}
    if(days.length>=14){const split=point(days.map(()=>0),days.length-8,L,T,PW,PH,1)[0];
      svg+='<path d="M'+split.toFixed(1)+' '+T+'V'+(T+PH)+'" stroke="#9aa8bd" stroke-width="1.2" stroke-dasharray="4 5" opacity=".65"/>';
    }
    for(const x of lines){
      svg+='<path d="'+smooth(x.values,L,T,PW,PH,upper)+'" stroke="'+x.color+'" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round" fill="none" vector-effect="non-scaling-stroke"/>';
      const last=point(x.values,x.values.length-1,L,T,PW,PH,upper);
      svg+='<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="3.3" fill="'+x.color+'" stroke="var(--pm-card-bg,#fff)" stroke-width="1.2"/>';
    }
    svg+='</svg>';
    return '<div class="pm-plot" data-n="'+days.length+'">'+svg+'<div class="pm-tooltip" hidden></div></div>';
  }
  function smallGraph(p,days){
    const values=rolling(p),average=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    // The dotted reference is the average of the displayed moving-average line.
    const low=average*.8,high=average*1.2;
    const W=510,H=127,L=14,R=14,T=14,B=25,PW=W-L-R,PH=H-T-B;
    const max=Math.max(1,...values,high*1.1);
    const yy=v=>T+PH-PH*v/max;
    const last=p.daily.length-1,prevPoint=p.daily.length-8;
    const lastValue=values.at(-1)||0,prevValue=prevPoint>=0?values[prevPoint]:null;
    const status=trendStatus(p);
    const color=status.className==='up'?'#259c70':status.className==='down'?'#d45c68':'#5579c0';
    let svg='<svg viewBox="0 0 '+W+' '+H+'" class="pm-small-svg" role="img" aria-label="'+e(p.name)+' smoothed seven-day average; previous seven days '+previous(p)+' orders and last seven days '+recent(p)+' orders">';
    if(average>0){
      svg+='<rect x="'+L+'" y="'+T+'" width="'+PW+'" height="'+Math.max(0,yy(high)-T)+'" fill="#2ea66e" opacity=".08"/>';
      svg+='<rect x="'+L+'" y="'+yy(low)+'" width="'+PW+'" height="'+Math.max(0,T+PH-yy(low))+'" fill="#df666b" opacity=".07"/>';
      svg+='<path d="M'+L+' '+yy(average).toFixed(1)+'H'+(W-R)+'" stroke="#91a2b7" stroke-width="1.1" stroke-dasharray="4 5"/>';
    }
    if(last>=13){
      const boundary=point(values,prevPoint,L,T,PW,PH,max)[0];
      svg+='<path d="M'+boundary.toFixed(1)+' '+T+'V'+(T+PH)+'" stroke="#a8b6c6" stroke-dasharray="3 4" stroke-width="1" opacity=".8"/>';
      svg+='<text class="pm-period-label" text-anchor="end" x="'+(boundary-6).toFixed(1)+'" y="'+(H-3)+'">Prev 7d</text>';
      svg+='<text class="pm-period-label" text-anchor="start" x="'+(boundary+6).toFixed(1)+'" y="'+(H-3)+'">Last 7d</text>';
    }
    svg+='<path d="'+smooth(values,L,T,PW,PH,max)+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linecap="round"/>';
    if(last>=13&&prevValue!==null){
      const prev=point(values,prevPoint,L,T,PW,PH,max);
      svg+='<circle cx="'+prev[0].toFixed(1)+'" cy="'+prev[1].toFixed(1)+'" r="4" fill="#fff" stroke="'+color+'" stroke-width="2"/>';
    }
    const current=point(values,last,L,T,PW,PH,max);
    svg+='<circle cx="'+current[0].toFixed(1)+'" cy="'+current[1].toFixed(1)+'" r="4.5" fill="'+color+'" stroke="#fff" stroke-width="1.5"/>';
    svg+='<text class="pm-small-axis" x="'+L+'" y="'+(H-3)+'">'+e(days[0]?.slice(5)||"")+'</text>';
    if(average>0)svg+='<text class="pm-avg-label" text-anchor="end" x="'+(W-R)+'" y="'+Math.max(T+11,yy(average)-5)+'">Avg '+average.toFixed(1)+'</text>';
    svg+='</svg>';
    return svg;
  }
  function allProducts(){
    const data=getData();return(data.products||[]).filter(p=>Array.isArray(p.daily)&&p.daily.length===(data.days||[]).length);
  }
  function boardHtml(){
    const data=getData(),days=data.days||[],products=allProducts();
    if(!days.length||!products.length)return '<section class="panel pm-section"><h3>Product Momentum</h3><p class="hint">No product order trends are available for the selected period.</p></section>';
    const top=products.slice(0,state.shown).map((p,i)=>({product:p,index:i,color:palette[i%palette.length]}));
    const visible=top.filter(x=>!state.hidden.has(x.product.name));
    const legend=top.map(x=>'<button type="button" class="pm-legend-item'+(state.hidden.has(x.product.name)?' is-muted':'')+'" data-pm-toggle="'+x.index+'" title="Toggle product line">'+
      '<span class="pm-swatch" style="background:'+x.color+'"></span><span class="pm-legend-name">'+e(x.product.name)+'</span><span class="pm-legend-count">'+fmtN(x.product.total)+'</span></button>').join("");
    const options=[5,10,20].filter(n=>n<=products.length||n===5);
    const controls=options.map(n=>'<button type="button" class="pm-range-button'+(state.shown===n?' is-active':'')+'" data-pm-show="'+n+'">Top '+n+'</button>').join("");
    const rising=products.filter(p=>trendStatus(p).className==="up").length,falling=products.filter(p=>trendStatus(p).className==="down").length;
    const sorted=products.filter(p=>p.name.toLowerCase().includes(state.search.toLowerCase()));
    sorted.sort((a,b)=>{
      if(state.sort==="rise")return(recent(b)-previous(b))-(recent(a)-previous(a))||b.total-a.total;
      if(state.sort==="fall")return(recent(a)-previous(a))-(recent(b)-previous(b))||b.total-a.total;
      if(state.sort==="name")return a.name.localeCompare(b.name);
      return b.total-a.total||a.name.localeCompare(b.name);
    });
    const rows=sorted.slice(0,state.rows).map(p=>{
      const now=recent(p),prev=previous(p),diff=now-prev,status=trendStatus(p);
      const change=prev?((diff/prev)*100).toFixed(0)+"%":now?"New":"0%";
      return '<article class="pm-product-row"><div class="pm-product-name"><strong>'+e(p.name)+'</strong><span class="pm-status '+status.className+'">'+status.label+'</span></div>'+
      '<div class="pm-product-numbers"><span><small>Last 7d</small><b>'+fmtN(now)+'</b></span><span><small>Previous 7d</small><b>'+fmtN(prev)+'</b></span><span class="pm-delta '+status.className+'"><small>Change</small><b>'+(diff>0?'+':'')+diff+' · '+change+'</b></span></div>'+
      '<div class="pm-mini">'+smallGraph(p,days)+'</div></article>';
    }).join("");
    return '<section class="panel pm-section" id="product-momentum"><div class="pm-head"><div><span class="pm-eyebrow">PRODUCT ANALYTICS</span><h3>Product Momentum</h3><p>See which products are accelerating, slowing down, or recovering — all on the same timeline.</p></div><div class="pm-meta">'+days.length+' days · '+fmtN(products.length)+' products</div></div>'+
      '<div class="pm-combined"><div class="pm-combined-head"><div><h4>Top Products Trend</h4><p>Smoothed 7-day average of daily orders · one color per product</p></div><div class="pm-count-controls">'+controls+'</div></div>'+
      '<div class="pm-combined-body"><div class="pm-legend"><div class="pm-legend-title">PRODUCTS <small>Orders in period</small></div>'+legend+'</div>'+bigGraph(visible,days)+'</div>'+
      '<div class="pm-footnote">Click a product on the left to show or hide its line. Hover the chart to compare values by day.</div></div>'+
      '<div class="pm-rows-head"><div><h4>Daily Momentum by Product</h4><p>Smoothed 7-day daily-order average · dashed = period baseline · shaded bands = ±20% · Rising/Falling compares last 7 vs previous 7 days</p></div><div class="pm-summary"><span class="pm-up">'+rising+' rising</span><span class="pm-down">'+falling+' falling</span></div></div>'+
      '<div class="pm-toolbar"><label>Search<input id="pm-search" type="search" placeholder="Find a product…" value="'+e(state.search)+'"></label><label>Sort<select id="pm-sort"><option value="orders"'+(state.sort==="orders"?" selected":"")+'>Most orders</option><option value="rise"'+(state.sort==="rise"?" selected":"")+'>Biggest rise</option><option value="fall"'+(state.sort==="fall"?" selected":"")+'>Biggest drop</option><option value="name"'+(state.sort==="name"?" selected":"")+'>Product name</option></select></label></div>'+
      '<div class="pm-product-rows">'+(rows||'<p class="hint">No products match your search.</p>')+'</div>'+
      (sorted.length>state.rows?'<button type="button" class="pm-more" id="pm-more">Load more products ('+(sorted.length-state.rows)+' remaining)</button>':'')+
      (data.limited?'<p class="pm-footnote">For performance, charts display at most the most recent 120 days of the selected period.</p>':'')+
      '</section>';
  }
  function bindBoard(){
    const board=document.getElementById("product-momentum");if(!board)return;
    board.querySelectorAll("[data-pm-show]").forEach(b=>b.onclick=()=>{state.shown=Number(b.dataset.pmShow);state.hidden.clear();renderBoardOnly();});
    board.querySelectorAll("[data-pm-toggle]").forEach(b=>b.onclick=()=>{const p=allProducts()[Number(b.dataset.pmToggle)];if(!p)return;if(state.hidden.has(p.name))state.hidden.delete(p.name);else state.hidden.add(p.name);renderBoardOnly();});
    const sort=board.querySelector("#pm-sort");if(sort)sort.onchange=()=>{state.sort=sort.value;state.rows=12;renderBoardOnly();};
    const search=board.querySelector("#pm-search");if(search)search.oninput=()=>{state.search=search.value;state.rows=12;renderBoardOnly(true);};
    const more=board.querySelector("#pm-more");if(more)more.onclick=()=>{state.rows+=12;renderBoardOnly();};
    const plot=board.querySelector(".pm-plot"),tooltip=plot?.querySelector(".pm-tooltip"),svg=plot?.querySelector("svg");
    if(svg&&tooltip){
      svg.onpointermove=ev=>{
        const days=getData().days||[],n=days.length;if(!n)return;
        const rect=svg.getBoundingClientRect(),x=(ev.clientX-rect.left)*820/rect.width;
        const i=Math.max(0,Math.min(n-1,Math.round((x-47)/(820-47-18)*(n-1))));
        const selected=allProducts().slice(0,state.shown).map((p,j)=>({p,j})).filter(x=>!state.hidden.has(x.p.name));
        tooltip.innerHTML='<strong>'+e(days[i])+' · 7-day average</strong>'+selected.map(x=>'<div><i style="background:'+palette[x.j%palette.length]+'"></i><span>'+e(x.p.name)+'</span><b>'+rolling(x.p)[i].toFixed(2)+'</b></div>').join("");
        tooltip.hidden=false;tooltip.style.left=Math.min(rect.width-10,Math.max(10,ev.clientX-rect.left))+"px";
      };
      svg.onpointerleave=()=>{tooltip.hidden=true;};
    }
  }
  function renderBoardOnly(focusSearch=false){
    const board=document.getElementById("product-momentum");if(!board)return;
    const cursor=focusSearch?board.querySelector("#pm-search")?.selectionStart:0;
    board.outerHTML=boardHtml();bindBoard();
    if(focusSearch){const s=document.getElementById("pm-search");if(s){s.focus();try{s.setSelectionRange(cursor,cursor);}catch(e){}}}
  }
  function installBoard(){
    const content=document.getElementById("content");if(!content)return;
    content.querySelector("#product-momentum")?.remove();
    const first=content.querySelector("section.panel");
    const holder=document.createElement("div");holder.innerHTML=boardHtml();
    const board=holder.firstElementChild;
    if(!board)return;
    if(first)first.before(board);else content.appendChild(board);
    bindBoard();
  }
  if(typeof renderProductAnalysis!=="function")return;
  const original=renderProductAnalysis;
  renderProductAnalysis=function(...args){const result=original.apply(this,args);installBoard();return result;};
  if(typeof page!=="undefined"&&page==="Products & Page Analysis"&&dashboard)installBoard();
})();