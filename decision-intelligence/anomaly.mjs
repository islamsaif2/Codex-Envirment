// Decision Intelligence MVP: descriptive anomaly detection, NOT causal attribution.
// Data source: existing Shopify Attribution Data sheet, one store and one attribution model at a time.
const DAY_MS = 86400000;
const dayMs = d => Date.parse(d + "T12:00:00Z");
const weekday = d => new Date(dayMs(d)).getUTCDay();
function bhAdjust(items) {
  const ranked = items.map((x,i)=>({x,i})).sort((a,b)=>a.x.p-b.x.p);
  let q=1;
  for(let i=ranked.length-1;i>=0;i--){
    q=Math.min(q,ranked[i].x.p*ranked.length/(i+1));
    ranked[i].x.adjustedP=Math.min(1,q);
  }
}
function normalTail(z) {
  // Abramowitz-Stegun normal CDF approximation; two-sided p.
  const x=Math.abs(z), t=1/(1+0.2316419*x);
  const d=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
  const p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return Math.min(1,Math.max(0,2*p));
}
function compareRates(current, history) {
  const n1=current.sessions,n0=history.sessions,k1=current.orders,k0=history.orders;
  if(n1<40||n0<200||k1>n1||k0>n0||k1<0||k0<0) return null;
  const p1=k1/n1,p0=k0/n0, pooled=(k1+k0)/(n1+n0);
  const variance=pooled*(1-pooled)*(1/n1+1/n0);
  if(!(variance>0))return null;
  const z=(p1-p0)/Math.sqrt(variance);
  return {currentRate:p1,baselineRate:p0,relativeChange:p0?(p1-p0)/p0:null,
    z,p:normalTail(z), expectedOrders:n1*p0,orderGap:k1-n1*p0};
}
function sum(rows) {return rows.reduce((a,r)=>({sessions:a.sessions+r.sessions,orders:a.orders+r.orders}),{sessions:0,orders:0});}
export function analyzeAttribution(rows, opts={}) {
  const model=opts.model||"linear",store=String(opts.store||"").trim(),asOf=opts.asOf||new Date(Date.now()-DAY_MS).toISOString().slice(0,10);
  const lookback=Math.min(84,Math.max(28,Number(opts.lookback)||56));
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(asOf)&&Number.isFinite(dayMs(asOf));
  if(!validDate)throw new Error("Invalid asOf date");
  if(!store)throw new Error("Store must be specified to avoid mixing old and new stores");
  const byKey=new Map(),asOfMs=dayMs(asOf),cutoff=asOfMs-lookback*DAY_MS;
  for(const r of rows){
    if(r.store!==store||r.model!==model||!["paid","organic","unknown"].includes(r.traffic))continue;
    const ms=dayMs(r.day);
    if(!Number.isFinite(ms)||ms<cutoff||ms>asOfMs)continue;
    if(!Number.isFinite(r.sessions)||!Number.isFinite(r.orders)||r.sessions<0||r.orders<0)continue;
    const key=[r.day,r.channel.toLowerCase(),r.traffic].join("|");
    const old=byKey.get(key);
    if(old){old.sessions+=r.sessions;old.orders+=r.orders;}else byKey.set(key,{day:r.day,channel:r.channel,traffic:r.traffic,sessions:r.sessions,orders:r.orders});
  }
  const series=[...byKey.values()],candidates=[];
  const segments=new Set(series.map(r=>r.channel.toLowerCase()+"|"+r.traffic));
  // Include overall store performance; channels are mutually exclusive in the selected model.
  segments.add("*|*");
  for(const segment of segments) {
    const [channel,traffic]=segment.split("|");
    const rowsFor=segment==="*|*"?series:series.filter(r=>r.channel.toLowerCase()===channel&&r.traffic===traffic);
    const today=rowsFor.filter(r=>r.day===asOf);
    const history=rowsFor.filter(r=>r.day<asOf&&weekday(r.day)===weekday(asOf));
    const historicalDays=new Set(history.map(r=>r.day));
    if(historicalDays.size<3)continue;
    const current=sum(today),baseline=sum(history),cmp=compareRates(current,baseline);
    if(!cmp)continue;
    candidates.push({id:[store,model,asOf,segment].join(":"),asOf,store,model,
      dimension:segment==="*|*"?"store":"channel",segment:segment==="*|*"?"All channels":channel,traffic:segment==="*|*"?"all":traffic,
      current,baseline,baselineDays:historicalDays.size,comparisonDates:[...historicalDays].sort(),...cmp,
      hypothesis:"Observed order-rate deviation. This does not establish a cause.",
      nextStep:"Check tracking coverage, traffic mix, checkout issues and comparable periods."});
  }
  bhAdjust(candidates);
  const findings=candidates.filter(r=>r.adjustedP<=0.05&&Math.abs(r.relativeChange??0)>=0.15)
    .map(r=>({...r,direction:r.relativeChange<0?"decrease":"increase",
      severity:Math.abs(r.orderGap)>=15?"high":"medium"}))
    .sort((a,b)=>Math.abs(b.orderGap)-Math.abs(a.orderGap));
  return {version:"0.1.0",mode:"observational",asOf,store,model,lookback,
    rules:{minCurrentSessions:40,minBaselineSessions:200,minComparableWeekdays:3,
      falseDiscoveryRate:0.05,minRelativeChange:0.15},
    evaluatedSegments:candidates.length,findings,
    explanation:"Each finding compares an observed attributed order/session rate with a same-weekday historical baseline; adjustedP controls multiple testing, not causality.",
    warnings:["Observational evidence only, not proven root causes.",
      "Attribution models can differ from Shopify total orders.",
      "Historical channel counts and tracking changes can affect results.",
      "Low sample sizes are excluded; no alert does not mean no issue."]};
}
