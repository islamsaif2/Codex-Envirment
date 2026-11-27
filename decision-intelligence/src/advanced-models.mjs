import {createHash} from 'node:crypto';
import {addDays} from './core.mjs';
import {productKey} from './product-history.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x),mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
const weekday=d=>new Date(d+'T00:00:00Z').getUTCDay();
function random(seed){let n=parseInt(createHash('sha256').update(seed).digest('hex').slice(0,8),16);return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;};}
const quantile=(a,p)=>a[Math.floor((a.length-1)*p)];
export function summarizeRisk(draws){
 if(draws.length<100||draws.some(x=>!finite(x)))return null;const a=[...draws].sort((x,y)=>x-y),tail=a.slice(0,Math.max(1,Math.ceil(a.length*.1)));
 return {low:quantile(a,.1),median:quantile(a,.5),high:quantile(a,.9),probabilityBelowZero:a.filter(x=>x<0).length/a.length,worstDecileMean:mean(tail),draws:a.length,interpretation:'Conditional bootstrap distribution, not a calibrated probability of commercial success. Interval excludes unmeasured confounding and source errors.'};
}
function blockDraw(rows,rng){const blocks=[];for(let i=0;i<rows.length;i+=7)blocks.push(rows.slice(i,i+7));let sampled=[];while(sampled.length<rows.length)sampled.push(...blocks[Math.floor(rng()*blocks.length)]);return sampled.slice(0,rows.length);}
function fit(rows){const bins=Array.from({length:7},()=>[]);for(const r of rows)bins[weekday(r.date)].push(r);if(rows.length<42||rows.reduce((n,r)=>n+r.orders,0)<20||bins.some(b=>b.length<3))return null;return bins.map(b=>b.reduce((n,r)=>n+r.orders,0)/b.reduce((n,r)=>n+r.sessions,0));}
const predict=(rates,r)=>rates[weekday(r.date)]*r.sessions;
function stockoutEstimate(product,rows,through){
 const positive=rows.filter(r=>r.state==='positive'),out=rows.filter(r=>r.state==='zero'&&r.date>=addDays(through,-29));
 const base={product,status:'insufficient_history',knownDays:rows.length,positiveDays:positive.length,zeroDaysInLast30:out.length,unit:'orders containing this product; not SKU units',causalClaim:false};
 if(!out.length)return {...base,status:'no_observed_stockout_window',reason:'No fully observed all-size zero closing-stock day in the latest 30 matched days.'};
 // Chronological holdout; train strictly before the held-out positive days.
 const holdout=positive.slice(-14),training=positive.slice(0,-14),rates=fit(training);
 if(holdout.length<14||!rates)return {...base,reason:'Need at least 42 training and 14 later positive-stock days, all weekdays covered, and 20 training product orders.'};
 const mae=mean(holdout.map(r=>Math.abs(predict(rates,r)-r.orders))),constant=mean(training.map(r=>r.orders)),baselineMAE=mean(holdout.map(r=>Math.abs(constant-r.orders)));
 const validation={trainingDays:training.length,holdoutDays:14,trainingThrough:training.at(-1).date,holdoutFrom:holdout[0].date,holdoutThrough:holdout.at(-1).date,mae,baselineMAE,passed:mae<baselineMAE,definition:'One chronological positive-stock holdout; predicts product order occurrences, not latent stockout demand.'};
 if(!validation.passed)return {...base,status:'validation_failed',validation,reason:'Weekday/traffic model did not beat the constant positive-stock order baseline on the holdout.'};
 const draws=[],rng=random(product+'|'+through+'|stockout-v1');
 // Each target day is estimated only from positive days earlier than it.
 const targets=out.map(r=>({r,prior:positive.filter(p=>p.date<r.date)})).filter(({prior})=>fit(prior));
 if(targets.length<3)return {...base,validation,reason:'Fewer than 3 stockout days have sufficient earlier positive-stock training data.'};
 for(let i=0;i<400;i++){let gap=0;for(const {r,prior} of targets){const sampled=fit(blockDraw(prior,rng));const model=sampled??fit(prior);gap+=predict(model,r)-r.orders;}draws.push(gap);}
 const expected=targets.reduce((n,{r,prior})=>n+predict(fit(prior),r),0),observed=targets.reduce((n,{r})=>n+r.orders,0);
 return {...base,status:'conditional_estimate',validation,estimatedDays:targets.length,expectedOccurrences:expected,observedOccurrences:observed,signedGap:expected-observed,suppressedDemandScenario:Math.max(0,expected-observed),risk:summarizeRisk(draws),reason:'Traffic- and weekday-adjusted counterfactual under stable demand. Closing stock does not identify when stock ran out. Not proven lost sales; do not sum across products.'};
}
// Only exact shared family names after stripping known trailing color names.
function family(name){const key=productKey(name),stem=key.replace(/\s+(black|wine|navy|olive|grey|gray|burgundy|purple|pink|white|beige|blue|green|brown)$/,'');return stem!==key?stem:null;}
function episodes(rows){let n=0,previous=null;for(const r of rows){if(r.state==='zero'&&(previous?.state!=='zero'||addDays(previous.date,1)!==r.date))n++;previous=r;}return n;}
function substitution(a,b){
 const bDates=new Map(b.rows.filter(r=>r.state==='positive').map(r=>[r.date,r])),zero=a.rows.filter(r=>r.state==='zero'&&bDates.has(r.date)),positive=a.rows.filter(r=>r.state==='positive'&&bDates.has(r.date));
 const result={fromProduct:a.product,toProduct:b.product,family:family(a.product),status:'not_identifiable',causalClaim:false,stockoutEpisodes:episodes(a.rows),observedZeroDays:zero.length,comparisonDays:positive.length};
 if(result.stockoutEpisodes<3||zero.length<14||positive.length<28)return {...result,reason:'Need 3 separate stockout episodes, 14 zero-stock days and 28 positive-stock comparison days while the alternative is positive.'};
 const pairs=zero.map(z=>{const controls=positive.filter(p=>weekday(p.date)===weekday(z.date)&&Math.abs(Date.parse(p.date)-Date.parse(z.date))<=28*86400000);if(controls.length<2)return null;const bz=bDates.get(z.date),rate=controls.reduce((n,p)=>n+bDates.get(p.date).orders,0)/controls.reduce((n,p)=>n+bDates.get(p.date).sessions,0);return {date:z.date,difference:bz.orders-rate*bz.sessions};}).filter(Boolean);
 if(pairs.length<14)return {...result,matchedDays:pairs.length,reason:'Insufficient same-weekday controls within 28 days; a distant-period comparison would confound seasonality.'};
 const rng=random(a.product+'|'+b.product+'|substitution-v1'),draws=Array.from({length:400},()=>mean(blockDraw(pairs,rng).map(p=>p.difference)));
 return {...result,status:'association_only',matchedDays:pairs.length,alternativeOrderDifferencePerMatchedDay:mean(pairs.map(p=>p.difference)),risk:summarizeRisk(draws),reason:'Alternative product order difference when the focal product closes at zero stock; matched by weekday and nearby dates, adjusted for site sessions. Shared demand shocks, prices and availability can still explain it. Does not identify causal cannibalization or net incremental sales.'};
}
export function advancedModels(snapshot,{today}){
 const sources=snapshot.sources??{},get=k=>sources[k]?.data??{},daily=get('orders').daily??[],web=get('website').rows??[],history=get('inventoryHistory').rows??[],inventory=get('inventory').rows??[],products=get('orders').products??[];
 const last=rows=>rows.map(r=>r.date).filter(d=>d<today).sort().at(-1),ends=[last(daily),last(web),last(history.flatMap(h=>h.observations??[]))],through=ends.every(Boolean)?ends.sort()[0]:null,from=through?addDays(through,-179):null;
 const meta={version:'1.0',historyDays:180,from,through,execution:'disabled',policy:'Calculations and bootstrap seeds are reproducible. Recommend review only; uncertainty is not a guaranteed outcome.',limitations:['Product quantities are unavailable; estimates count orders containing a product, not units.','Closing stock is not certified intraday availability.','Historical price, promotion and traffic quality confounding remains unresolved.','Conditional distributions are not causal success probabilities.']};
 const retention={status:'not_identifiable',incrementalResponse:null,targetSegments:[],reason:'The connected customer/cohort data contain no randomized treatment/control assignment linked to mature retention outcomes. Repeat propensity cannot identify who will respond incrementally.',requiredEvidence:['Stable customer identity','Randomized eligible treatment/control assignment and assignment date','Actual outreach exposure and cost','Predeclared mature repeat-purchase outcome window for both groups'],action:'Do not target customers on claimed incremental response until a valid holdout experiment is available.'};
 if(!through||['orders','website','inventory','inventoryHistory'].some(k=>sources[k]?.status!=='ok'))return {...meta,status:'source_data_unavailable',suppressedDemand:[],substitution:[],retention};
 const orderDates=new Set(daily.filter(r=>r.date>=from&&r.date<=through&&finite(r.orders)).map(r=>r.date)),sessions=new Map(),badSessions=new Set();for(const r of web){if(!finite(r.sessions)||r.sessions<0){badSessions.add(r.date);continue;}sessions.set(r.date,(sessions.get(r.date)??0)+r.sessions);}
 const productOrders=new Map();for(const r of products){if(!productOrders.has(productKey(r.product)))productOrders.set(productKey(r.product),new Map());const m=productOrders.get(productKey(r.product));m.set(r.date,(m.get(r.date)??0)+r.ordersContainingProduct);}
 const groups=new Map();for(const r of inventory){const k=productKey(r.product);if(!groups.has(k))groups.set(k,{product:r.product,variants:new Set()});groups.get(k).variants.add(productKey(r.variant));}
 const histories=new Map();for(const r of history){const k=productKey(r.product)+'|'+productKey(r.variant);if(histories.has(k))throw Error('Ambiguous duplicate normalized inventory history');histories.set(k,r);}
 const series=[...groups.entries()].map(([key,g])=>{const sizeHistory=[...g.variants].map(v=>histories.get(key+'|'+v)),maps=sizeHistory.map(h=>new Map((h?.observations??[]).map(o=>[o.date,o.quantity]))),rows=[];for(let date=from;date<=through;date=addDays(date,1)){const q=maps.map(m=>m.get(date));if(!orderDates.has(date)||badSessions.has(date)||!(sessions.get(date)>0)||q.some(x=>!finite(x)||x<0))continue;const state=q.every(x=>x>0)?'positive':q.every(x=>x===0)?'zero':'partial';rows.push({date,state,sessions:sessions.get(date),orders:productOrders.get(key)?.get(date)??0});}return {product:g.product,rows};});
 const suppressedDemand=series.map(s=>stockoutEstimate(s.product,s.rows,through)),pairs=[];for(const a of series)for(const b of series)if(a!==b&&family(a.product)&&family(a.product)===family(b.product))pairs.push(substitution(a,b));
 return {...meta,status:'evaluated',suppressedDemand,substitution:pairs,retention,validation:{testedProducts:suppressedDemand.length,conditionalEstimates:suppressedDemand.filter(r=>r.status==='conditional_estimate').length,testedPairs:pairs.length,associations:pairs.filter(r=>r.status==='association_only').length,multipleComparisons:'Exploratory pair screening; no pair is certified significant or causal. Estimates do not feed budget optimization.'}};
}
