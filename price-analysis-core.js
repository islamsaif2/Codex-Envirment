/* Shared price analysis maths. No business-specific prices or stock adjustments. */
const PriceChangeCore = (() => {
  const dayMs=86400000;
  const key=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s*[–—-]\s*(?:ultramedix|ultra\s*medix)\s*$/i,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const date=v=>{
    if(typeof v==='number'&&v>20000&&v<100000)return new Date((Math.floor(v)-25569)*dayMs).toISOString().slice(0,10);
    const s=String(v??'').trim(),m=s.match(/^Date\((\d+),(\d+),(\d+)/);
    if(m)return [m[1],String(+m[2]+1).padStart(2,'0'),String(+m[3]).padStart(2,'0')].join('-');
    return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;
  };
  const number=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,'').replace(/[^\d.()-]/g,'').replace(/[()]/g,''));return Number.isFinite(n)?n:null;};
  const shift=(d,n)=>new Date(Date.parse(d)+n*dayMs).toISOString().slice(0,10);
  const days=(from,to)=>{const a=[];for(let d=from;d&&d<=to;d=shift(d,1))a.push(d);return a;};
  const change=(after,before)=>Number.isFinite(after)&&Number.isFinite(before)&&before!==0?(after-before)/Math.abs(before):null;
  function aggregate(rows){
    const traffic=rows.filter(r=>Number.isFinite(r.sessions));
    const sessions=traffic.reduce((s,r)=>s+r.sessions,0);
    const counts=rows.reduce((s,r)=>s+r.orders,0);
    const unitsKnown=rows.every(r=>r.unitsExact!==false),revenueKnown=rows.every(r=>r.revenueExact!==false);
    return {days:rows.length,orders:counts,ordersPerDay:rows.length?counts/rows.length:null,
      sessions:traffic.length?sessions:null,sessionsPerDay:traffic.length?sessions/traffic.length:null,
      cr:sessions>0?traffic.reduce((s,r)=>s+r.orders,0)/sessions:null,trafficDays:traffic.length,
      revenue:revenueKnown?rows.reduce((s,r)=>s+(r.revenue||0),0):null,
      revenuePerDay:revenueKnown&&rows.length?rows.reduce((s,r)=>s+(r.revenue||0),0)/rows.length:null,
      deliveredOrders:rows.reduce((s,r)=>s+r.deliveredOrders,0),
      deliveredRevenue:revenueKnown?rows.reduce((s,r)=>s+(r.deliveredRevenue||0),0):null,
      deliveryRate:rows.reduce((s,r)=>s+r.deliveredOrders+r.returnedOrders,0)>0?rows.reduce((s,r)=>s+r.deliveredOrders,0)/rows.reduce((s,r)=>s+r.deliveredOrders+r.returnedOrders,0):null,
      units:unitsKnown?rows.reduce((s,r)=>s+(r.units||0),0):null,
      unitsPerDay:unitsKnown&&rows.length?rows.reduce((s,r)=>s+(r.units||0),0)/rows.length:null};
  }
  function episodes(product){
    const out=[];
    for(const r of product.daily){
      if(!(r.price>0))continue;
      const last=out.at(-1);
      if(last&&last.price===r.price&&shift(last.to,1)===r.date)last.to=r.date;
      else out.push({from:r.date,to:r.date,price:r.price});
    }
    return out;
  }
  function events(product,window=14,through='9999-12-31'){
    const ep=episodes(product),index=new Map(product.daily.map(d=>[d.date,d]));
    return ep.slice(1).flatMap((current,i)=>{
      const previous=ep[i];
      if(shift(previous.to,1)!==current.from||current.price===previous.price||current.from>through)return [];
      const before=days(shift(previous.from,1),previous.to),after=days(shift(current.from,1),current.to<through?current.to:through);
      let count=Math.min(window,before.length,after.length);
      // Full weeks contain the same weekday mix. Short regimes remain visible.
      if(count>=7)count=Math.floor(count/7)*7;
      const pre=before.slice(-count||before.length),post=after.slice(0,count);
      const b=aggregate(count?pre.map(d=>index.get(d)).filter(Boolean):[]),a=aggregate(post.map(d=>index.get(d)).filter(Boolean));
      return [{id:product.id+'|'+current.from,productId:product.id,name:product.name,image:product.image||'',date:current.from,
        oldPrice:previous.price,newPrice:current.price,priceChange:change(current.price,previous.price),
        before:b,after:a,beforeFrom:pre[0]||null,beforeTo:count?pre.at(-1):null,afterFrom:post[0]||null,afterTo:post.at(-1)||null,
        days:count,short:count<7,crChange:change(a.cr,b.cr),crPoints:Number.isFinite(a.cr)&&Number.isFinite(b.cr)?(a.cr-b.cr)*100:null,
        ordersChange:change(a.ordersPerDay,b.ordersPerDay),revenueChange:change(a.revenuePerDay,b.revenuePerDay),
        sensitivity:Number.isFinite(change(a.cr,b.cr))?change(a.cr,b.cr)/change(current.price,previous.price):null,
        requiredVolumeChange:previous.price/current.price-1,
        status:!count?'Awaiting comparable days':a.cr===null||b.cr===null?'Sessions unavailable':count<7?'Short price period':a.trafficDays<count||b.trafficDays<count?'Partial sessions':'Comparable periods'}];
    });
  }
  function priceLevels(product,from,to){
    const map=new Map();
    for(const r of product.daily)if(r.date>=from&&r.date<=to&&r.price>0){if(!map.has(r.price))map.set(r.price,[]);map.get(r.price).push(r);}
    return [...map].sort((a,b)=>a[0]-b[0]).map(([price,rows])=>({price,...aggregate(rows)}));
  }
  return {key,date,number,shift,days,change,aggregate,episodes,events,priceLevels};
})();
