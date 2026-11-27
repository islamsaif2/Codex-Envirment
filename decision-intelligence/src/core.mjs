import {createHash} from 'node:crypto';
export const VERSION='0.1.0';
export const isNumber=v=>typeof v==='number'&&Number.isFinite(v);
export function requireNumber(v,name,min=0){if(!isNumber(v)||v<min)throw Error(`${name} must be a finite number >= ${min}`);return v;}
export function isoDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Expected a real ISO calendar date');return value;
}
export const addDays=(date,n)=>new Date(Date.parse(isoDay(date)+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function cairoToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function localToday(timezone,now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function ratio(n,d){return isNumber(n)&&isNumber(d)&&d>0?n/d:null;}
export function periodMetrics(rows){
 const sum=key=>rows.every(r=>isNumber(r[key]))?rows.reduce((s,r)=>s+r[key],0):null;
 const spend=sum('spend'),impressions=sum('impressions'),clicks=sum('clicks'),orders=sum('orders'),sessions=sum('sessions');
 return {spend,orders,sessions,ctr:ratio(clicks,impressions),cpm:impressions>0&&spend!==null?1000*spend/impressions:null,cpa:ratio(spend,orders),conversionRate:ratio(orders,sessions)};
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const quantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.ceil((b.length+1)*q)-1)];};
function predict(training,date,model){
 const anchor=addDays(training.at(-1).date,1);
 const recent=training.filter(r=>r.date>=addDays(anchor,-28)&&r.date<date);
 if(!recent.length)return null;
 if(model==='weekday_mean'){const weekday=new Date(date+'T00:00:00Z').getUTCDay(),same=recent.filter(r=>new Date(r.date+'T00:00:00Z').getUTCDay()===weekday);if(same.length>=3)return mean(same.map(r=>r.value));}
 return mean(recent.map(r=>r.value));
}
export function forecast(series,{today=cairoToday(),horizon=7,kind='observed_orders'}={}){
 isoDay(today);if(!Number.isInteger(horizon)||horizon<1||horizon>28)throw Error('Forecast horizon must be 1..28 days');
 if(!Array.isArray(series)||series.length>20000)throw Error('Expected at most 20,000 daily observations');
 const seen=new Set(),excluded=[],valid=[];
 for(const r of series){isoDay(r.date);if(seen.has(r.date))throw Error(`Duplicate date ${r.date}`);seen.add(r.date);
  if(r.date>=today){excluded.push({date:r.date,reason:'partial_or_future_day'});continue;}
  if(!isNumber(r.value)||r.value<0||r.complete!==true||r.quality!=='verified'||(kind==='demand'&&r.inStock!==true)){excluded.push({date:r.date,reason:'missing_incomplete_unverified_or_stock_censored'});continue;}valid.push(r);
 }
 valid.sort((a,b)=>a.date.localeCompare(b.date));
 const recent=valid.filter(r=>r.date>=addDays(today,-28));
 const missingDates=Array.from({length:28},(_,i)=>addDays(today,i-28)).filter(d=>!recent.some(r=>r.date===d));
 const blockers=[];if(valid.length<56)blockers.push('Need at least 56 verified complete observations for model selection and backtesting');
 if(recent.length<26)blockers.push('Recent 28-day coverage below 26 complete observations');
 if(!recent.some(r=>r.date===addDays(today,-1)))blockers.push('Yesterday is missing or unverified');
 if(blockers.length)return {status:'insufficient_data',blockers,excluded,missingDates,forecast:[],modelVersion:VERSION};
 const models=['moving_mean','weekday_mean'];
 const cutoff=addDays(today,-28),residuals={},scores={};
 for(const model of models){const errors=[];for(const r of valid.filter(x=>x.date>=cutoff)){const train=valid.filter(x=>x.date<r.date),p=predict(train,r.date,model);if(train.length>=28&&p!==null)errors.push({date:r.date,error:r.value-p,actual:r.value});}
  residuals[model]=errors;scores[model]={n:errors.length,mae:mean(errors.map(e=>Math.abs(e.error))),bias:mean(errors.map(e=>e.error)),wape:ratio(errors.reduce((s,e)=>s+Math.abs(e.error),0),errors.reduce((s,e)=>s+e.actual,0))};
 }
 const model=models.sort((a,b)=>scores[a].mae-scores[b].mae)[0];
 // Fixed-origin multi-horizon hindcasts; all training dates precede origin.
 const horizonErrors=Array.from({length:horizon},()=>[]);
 for(let offset=28;offset>=horizon;offset--){const origin=addDays(today,-offset),train=valid.filter(r=>r.date<origin);if(train.length<28)continue;
  for(let h=0;h<horizon;h++){const d=addDays(origin,h),actual=valid.find(r=>r.date===d),p=predict(train,d,model);if(actual&&p!==null)horizonErrors[h].push(Math.abs(actual.value-p));}
 }
 return {status:'forecast',model,modelVersion:VERSION,kind,asOf:today,scores,excluded,missingDates,evidence:'observational_baseline',causal:false,
  validation:'Rolling one-day model selection; overlapping fixed-origin hindcasts for horizon-specific descriptive error bands. No independent final holdout.',
  forecast:Array.from({length:horizon},(_,h)=>{const date=addDays(today,h),value=predict(valid,date,model),errors=horizonErrors[h],radius=errors.length>=10?quantile(errors,.9):null;return {date,value,lower:radius===null?null:Math.max(0,value-radius),upper:radius===null?null:value+radius,band:'empirical 90% absolute-error band, not guaranteed coverage',calibrationN:errors.length};})};
}
export function readiness(config){
 if(config.scope==='marketing'){const required={decisionObjective:'اختيار هدف المقارنة',attributionModel:'تحديد نموذج الإسناد للمقارنة',sourceFreshnessVerified:'التحقق من اكتمال وحداثة بيانات التسويق',orderIdentityVerified:'التحقق من هوية الطلب وتاريخه الأصلي',forecastHistoryVerified:'التحقق من التاريخ المناسب للتوقع',responseCurvesApproved:'التحقق من أثر تغيير الصرف قبل توصية توزيع فعلية'};return Object.entries(required).filter(([k])=>!config[k]).map(([key,question])=>({key,question}));}
 const requirements={decisionObjective:'Approve an explicit objective and horizon',revenueBasis:'Define order eligibility and the revenue basis from scratch',attributionModel:'Choose the attribution model from scratch',trackingGapDatesVerified:'Resolve tracking gap dates',orderIdentityVerified:'Verify original store-aware order identity',variantMappingVerified:'Verify campaign-to-variant and old/new variant mapping',costsVerified:'Verify product, fulfillment, return and refund costs',responseCurvesApproved:'Approve response curves or explicit scenario assumptions',acceptanceThresholdsApproved:'Set and pass forecast validation thresholds',sourceFreshnessVerified:'Verify current complete source snapshots'};
 return Object.entries(requirements).filter(([k])=>!config[k]).map(([key,question])=>({key,question}));
}
export function capabilities(config){return {historicalMarketing:'available_with_source_limitations',liveMarketingForecast:config.sourceFreshnessVerified&&config.forecastHistoryVerified?'eligible_for_validation':'needs_verified_complete_history',sitewideStockPlanning:config.demandVerified&&config.sourceFreshnessVerified?'eligible_for_validation':'needs_verified_SKU_demand_and_current_stock',campaignSpecificStockOptimization:config.campaignSkuEvidenceVerified?'eligible_for_validation':'unavailable_no_verified_campaign_SKU_relationship',profit:config.costsVerified&&config.refundsVerified?'eligible_for_validation':'unavailable_missing_cost_or_refund_data',cashPlanning:config.cashVerified?'eligible_for_validation':'unavailable_cash_unknown',commercialExecution:'disabled'};}
// Exact enumeration of a finite, user-specified joint campaign/production scenario.
// Each group is one decision, each option is a complete time path for that decision.
export function optimize(scenario){
 const {days,groups,variants}=scenario;
 if(!Array.isArray(days)||days.length<1||days.length>31)throw Error('Use 1..31 consecutive planning days');days.forEach(isoDay);
 if(days.some((d,i)=>i&&d!==addDays(days[i-1],1)))throw Error('Planning days must be consecutive and ordered');
 if(typeof scenario.currency!=='string'||!/^[A-Z]{3}$/.test(scenario.currency))throw Error('Scenario requires one ISO currency code; mixed currencies must be converted upstream');
 if(typeof scenario.timezone!=='string'||!scenario.timezone)throw Error('Scenario timezone required');localToday(scenario.timezone);
 if(!['contribution','revenue'].includes(scenario.objective))throw Error('Objective must be contribution or revenue');
 const n=days.length;requireNumber(scenario.openingCashEGP,'openingCashEGP');
 if(!Array.isArray(variants)||!variants.length||variants.length>100)throw Error('Require 1..100 variant constraints');
 const ids=new Set();const array=(a,name)=>{if(!Array.isArray(a)||a.length!==n)throw Error(`${name} must have one number per planning day`);a.forEach(v=>requireNumber(v,name));return a;};
 array(scenario.dailyBudgetEGP,'dailyBudgetEGP');array(scenario.fulfillmentCapacity,'fulfillmentCapacity');array(scenario.productionCapacity,'productionCapacity');
 if(scenario.totalBudgetEGP!==undefined)requireNumber(scenario.totalBudgetEGP,'totalBudgetEGP');
 const resources=scenario.resourceCapacity??{};for(const [k,a] of Object.entries(resources))array(a,'resourceCapacity.'+k);
 for(const v of variants){if(!v.id||ids.has(v.id))throw Error('Variant IDs must be unique');ids.add(v.id);requireNumber(v.openingStock,'openingStock');requireNumber(v.safetyStock,'safetyStock');array(v.approvedInbound,'approvedInbound');array(v.baselineDemand,'baselineDemand');}
 if(!Array.isArray(groups)||!groups.length||groups.length>12)throw Error('Require 1..12 decision groups');
 let combinations=1;const groupIds=new Set();
 for(const g of groups){if(!g.id||groupIds.has(g.id))throw Error('Decision group IDs must be unique');groupIds.add(g.id);if(!Array.isArray(g.options)||!g.options.length||g.options.length>20)throw Error('Require 1..20 options per group');combinations*=g.options.length;
  const optionIds=new Set();for(const o of g.options){if(!o.id||optionIds.has(o.id))throw Error('Option IDs must be unique per group');optionIds.add(o.id);
   for(const k of ['spendEGP','cashOutEGP','cashInEGP','fulfillmentUnits','productionUnits'])array(o[k],k);
   for(const k of ['deliveredRevenueEGP','incrementalProductionCostEGP'])requireNumber(o[k],k);
   requireNumber(o.deliveredContributionBeforeAdsEGP,'deliveredContributionBeforeAdsEGP',-Infinity);
   if(o.cashOutEGP.some((x,i)=>x<o.spendEGP[i]))throw Error('cashOutEGP must include advertising spend');
   for(const k of ['demand','inbound']){if(!o[k]||Array.isArray(o[k]))throw Error(`${k} must map variant IDs to daily arrays`);for(const [id,a] of Object.entries(o[k])){if(!ids.has(id))throw Error(`Unmapped variant ${id}`);array(a,k);}}
   for(const [k,a] of Object.entries(o.resources??{})){if(!Object.hasOwn(resources,k))throw Error('Resource capacity missing: '+k);array(a,'resources.'+k);}
   if(!o.evidence||!['experiment','approved_assumption'].includes(o.evidence.type)||!o.evidence.reference)throw Error('Every option requires experiment evidence or an explicitly approved scenario assumption');
  }
 }
 if(combinations>200000)throw Error('Scenario exceeds exact solver limit of 200,000 combinations; reduce options');
 if(combinations*n*(variants.length+Object.keys(resources).length)>10000000)throw Error('Scenario exceeds bounded computation limit; reduce horizon or options');
 let evaluated=0,feasible=0,best=null;const alternatives=[],rejected={budget:0,inventory:0,cash:0,fulfillment:0,production:0};
 const evaluate=chosen=>{
  evaluated++;let cash=scenario.openingCashEGP;const stock=Object.fromEntries(variants.map(v=>[v.id,v.openingStock]));const daily=[];
  if(scenario.totalBudgetEGP!==undefined&&chosen.reduce((s,o)=>s+o.spendEGP.reduce((a,b)=>a+b,0),0)>scenario.totalBudgetEGP+1e-8){rejected.budget++;return;}
  for(let t=0;t<n;t++){const total=k=>chosen.reduce((s,o)=>s+o[k][t],0),spend=total('spendEGP');if(spend>scenario.dailyBudgetEGP[t]+1e-8){rejected.budget++;return;}
   if(total('fulfillmentUnits')>scenario.fulfillmentCapacity[t]+1e-8){rejected.fulfillment++;return;}
   if(total('productionUnits')>scenario.productionCapacity[t]+1e-8){rejected.production++;return;}
   for(const [k,capacity] of Object.entries(resources))if(chosen.reduce((s,o)=>s+(o.resources?.[k]?.[t]??0),0)>capacity[t]+1e-8){rejected.production++;return;}
   // Conservative within-day timing: all cash out before same-day collections.
   cash-=total('cashOutEGP');if(cash<-1e-8){rejected.cash++;return;}cash+=total('cashInEGP');
   for(const v of variants){stock[v.id]+=v.approvedInbound[t]+chosen.reduce((s,o)=>s+(o.inbound[v.id]?.[t]??0),0)-v.baselineDemand[t]-chosen.reduce((s,o)=>s+(o.demand[v.id]?.[t]??0),0);if(stock[v.id]<v.safetyStock-1e-8){rejected.inventory++;return;}}
   daily.push({date:days[t],spendEGP:spend,cashEGP:cash,closingStock:{...stock}});
  }
  feasible++;const revenue=chosen.reduce((s,o)=>s+o.deliveredRevenueEGP,0),netContribution=chosen.reduce((s,o)=>s+o.deliveredContributionBeforeAdsEGP-o.spendEGP.reduce((a,b)=>a+b,0)-o.incrementalProductionCostEGP,0),objectiveValue=scenario.objective==='revenue'?revenue:netContribution;
  const record={choices:chosen.map((o,i)=>({group:groups[i].id,option:o.id,evidence:o.evidence})),objectiveValue,revenueEGP:revenue,contributionEGP:netContribution,daily};
  alternatives.push(record);alternatives.sort((a,b)=>b.objectiveValue-a.objectiveValue);if(alternatives.length>3)alternatives.pop();if(!best||objectiveValue>best.objectiveValue)best=record;
 };
 const walk=(i,a)=>{if(i===groups.length){evaluate(a);return;}for(const o of groups[i].options)walk(i+1,[...a,o]);};walk(0,[]);
 const inputHash=createHash('sha256').update(JSON.stringify(scenario)).digest('hex');
 return {status:best?'scenario_proposal':'infeasible',currency:scenario.currency,timezone:scenario.timezone,execution:'disabled',approvalRequired:true,modelVersion:VERSION,inputHash,evaluated,feasible,rejected,best,alternatives,optimality:'Exact only over supplied discrete options, assumptions and constraints; no claim of real-world optimality',limitations:['Demand effects are supplied, not inferred causally from ROAS','EGP-suffixed contract keys represent the single declared scenario currency; do not mix currencies','Costs and delivery probabilities belong in supplied option economics','Cash collections must reflect actual expected settlement dates','Production inbound must respect approved lead times and bill of materials outside this finite scenario']};
}
