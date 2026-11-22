// Exploratory decomposition. Points to segments responsible for a change,
// not an explanation of WHY those segments changed.
// All inputs are per-day Shopify attributed sessions and orders, single store/model.
const MS=86400000;
const stamp=d=>Date.parse(d+"T12:00:00Z");
const dow=d=>new Date(stamp(d)).getUTCDay();
const sum=rows=>rows.reduce((a,r)=>({sessions:a.sessions+r.sessions,orders:a.orders+r.orders}),{sessions:0,orders:0});
export function diagnoseChannels(rows,{store,model="linear",asOf,lookback=56}={}){
 if(!store||!/^\d{4}-\d{2}-\d{2}$/.test(asOf||"")||!Number.isFinite(stamp(asOf)))throw Error("Valid store and asOf required");
 const cutoff=stamp(asOf)-Math.min(84,Math.max(28,Number(lookback)||56))*MS;
 const clean=rows.filter(r=>r.store===store&&r.model===model&&["paid","organic","unknown"].includes(r.traffic)
   &&Number.isFinite(stamp(r.day))&&stamp(r.day)>=cutoff&&stamp(r.day)<=stamp(asOf)
   &&Number.isFinite(r.sessions)&&Number.isFinite(r.orders)
   &&r.sessions>=0&&r.orders>=0&&r.orders<=r.sessions);
 const segments=new Map();
 for(const r of clean){
   const key=r.channel.toLowerCase()+"|"+r.traffic;
   if(!segments.has(key))segments.set(key,{channel:r.channel,traffic:r.traffic,current:[],history:[]});
   const dest=r.day===asOf?"current":r.day<asOf&&dow(r.day)===dow(asOf)?"history":null;
   if(dest)segments.get(key)[dest].push(r);
 }
 const result=[];
 for(const s of segments.values()){
   const days=new Set(s.history.map(r=>r.day)).size;
   if(days<3)continue;
   const current=sum(s.current),baseline=sum(s.history);
   if(current.sessions<40||baseline.sessions<200)continue;
   const rate=baseline.orders/baseline.sessions;
   result.push({channel:s.channel,traffic:s.traffic,currentSessions:current.sessions,
     currentOrders:current.orders,baselineSessions:baseline.sessions,baselineOrders:baseline.orders,
     baselineRate:rate,currentRate:current.orders/current.sessions,
     expectedOrdersAtCurrentTraffic:rate*current.sessions,
     withinSegmentOrderGap:current.orders-rate*current.sessions,
     baselineDays:days});
 }
 const totals={currentSessions:result.reduce((n,x)=>n+x.currentSessions,0),
   currentOrders:result.reduce((n,x)=>n+x.currentOrders,0),
   expectedOrdersAtCurrentTraffic:result.reduce((n,x)=>n+x.expectedOrdersAtCurrentTraffic,0)};
 totals.withinSegmentOrderGap=totals.currentOrders-totals.expectedOrdersAtCurrentTraffic;
 const historicalSessions=result.reduce((n,x)=>n+x.baselineSessions,0);
 const historicalOrders=result.reduce((n,x)=>n+x.baselineOrders,0);
 totals.historicalBlendedRate=historicalSessions?historicalOrders/historicalSessions:null;
 totals.expectedOrdersAtHistoricalMix=totals.historicalBlendedRate===null?null:totals.historicalBlendedRate*totals.currentSessions;
 totals.trafficMixContribution=totals.expectedOrdersAtHistoricalMix===null?null:
   totals.expectedOrdersAtCurrentTraffic-totals.expectedOrdersAtHistoricalMix;
 totals.overallOrderGap=totals.expectedOrdersAtHistoricalMix===null?null:
   totals.currentOrders-totals.expectedOrdersAtHistoricalMix;
 result.sort((a,b)=>Math.abs(b.withinSegmentOrderGap)-Math.abs(a.withinSegmentOrderGap));
 return {asOf,store,model,comparison:"previous same weekdays",totals,segments:result,
   excludedUnqualifiedSegments:true,
   explanation:"Descriptive shift-share decomposition only. Within-segment and traffic-mix contributions are not causal effects.",
   cautions:["Segments with too little history or traffic are excluded; totals cover eligible segments only.",
     "Attribution tracking or channel classification changes may invalidate comparisons.",
     "Segment mix and within-segment rates may both change; this decomposition is not proof of cause."]};
}
