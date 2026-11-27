import {addDays,requireNumber,optimize} from './core.mjs';
// Compile explicit daily response assumptions into the solver contract.
// No elasticity is inferred from a historical ROAS ratio.
export function compileCampaignScenario(plan){
 const {days,campaigns,variants}=plan;if(!Array.isArray(days)||!days.length)throw Error('Planning days required');
 if(!Array.isArray(campaigns)||!campaigns.length)throw Error('Campaigns required');
 const variantIds=new Set(variants.map(v=>v.id));
 const groups=campaigns.map(c=>{
  requireNumber(c.previousDailyBudgetEGP,'previousDailyBudgetEGP');const unboundedChange=c.budgetChange?.mode==='unbounded';if(!unboundedChange)requireNumber(c.maxDailyChangeFraction,'maxDailyChangeFraction');
  requireNumber(c.minDailyBudgetEGP,'minDailyBudgetEGP');requireNumber(c.maxDailyBudgetEGP,'maxDailyBudgetEGP');if(c.minDailyBudgetEGP>c.maxDailyBudgetEGP)throw Error('Invalid campaign bounds');
  return {id:c.id,options:c.options.map(option=>{
   if(!Array.isArray(option.daily)||option.daily.length!==days.length)throw Error('One response row per day required');
   let previous=c.previousDailyBudgetEGP,revenue=0,contribution=0;const spend=[],cashOut=[],cashIn=days.map(()=>0),fulfillment=[],demand={};
   for(let t=0;t<days.length;t++){
    const r=option.daily[t];for(const k of ['spendEGP','placedOrders','deliveryProbability','netSalesPerDeliveredOrderEGP','variableCostPerDeliveredOrderEGP','failedOrderCostEGP','unitsPerPlacedOrder'])requireNumber(r[k],k);
    if(r.deliveryProbability>1)throw Error('Delivery probability must be <=1');
    if(!Number.isInteger(c.settlementLagDays)||c.settlementLagDays<1)throw Error('Settlement lag must be a positive integer number of days');
    if(r.spendEGP<c.minDailyBudgetEGP||r.spendEGP>c.maxDailyBudgetEGP)throw Error('Campaign budget outside approved bounds');
    // A zero budget cannot be scaled through a percentage ramp; specify a permitted launch budget.
    const launch=c.launchBudgetEGP??0;requireNumber(launch,'launchBudgetEGP');
    const changeBound=previous===0?launch:previous*c.maxDailyChangeFraction;
    if(!unboundedChange&&Math.abs(r.spendEGP-previous)>changeBound+1e-8)throw Error('Campaign budget change exceeds approved ramp');previous=r.spendEGP;
    const shares=Object.entries(c.variantShares);if(!shares.length||Math.abs(shares.reduce((s,[,v])=>s+requireNumber(v,'variantShare'),0)-1)>1e-8)throw Error('Variant shares must sum to 1');
    for(const [id,share] of shares){if(!variantIds.has(id))throw Error('Unmapped campaign variant');demand[id]??=days.map(()=>0);demand[id][t]=r.placedOrders*r.unitsPerPlacedOrder*share;}
    const delivered=r.placedOrders*r.deliveryProbability,netSales=delivered*r.netSalesPerDeliveredOrderEGP,variableCost=delivered*r.variableCostPerDeliveredOrderEGP+(r.placedOrders-delivered)*r.failedOrderCostEGP;
    revenue+=netSales;contribution+=netSales-variableCost;spend.push(r.spendEGP);cashOut.push(r.spendEGP+variableCost);fulfillment.push(r.placedOrders);
    if(t+c.settlementLagDays<days.length)cashIn[t+c.settlementLagDays]+=netSales;
   }
   return {id:option.id,spendEGP:spend,cashOutEGP:cashOut,cashInEGP:cashIn,fulfillmentUnits:fulfillment,productionUnits:days.map(()=>0),demand,inbound:{},deliveredRevenueEGP:revenue,deliveredContributionBeforeAdsEGP:contribution,incrementalProductionCostEGP:0,evidence:option.evidence};
  })};
 });
 const scenario={...plan,groups};delete scenario.campaigns;return scenario;
}
export function compareScenarios(scenarios){
 if(!Array.isArray(scenarios)||scenarios.length<2||scenarios.length>5)throw Error('Compare 2..5 scenarios');
 const first=scenarios[0].scenario;
 if(scenarios.some(x=>JSON.stringify(x.scenario.days)!==JSON.stringify(first.days)||x.scenario.objective!==first.objective))throw Error('Comparison requires the same horizon and objective');
 return {execution:'disabled',label:'User-supplied sensitivity scenarios',results:scenarios.map(({name,scenario})=>({name,result:optimize(scenario)}))};
}
export function productionBatch({variantId,startDate,quantity,minBatch,batchMultiple,leadTimeDays,unitCostEGP,materialPerUnit},days){
 if(!Number.isInteger(quantity)||!Number.isInteger(minBatch)||!Number.isInteger(batchMultiple)||quantity<minBatch||minBatch<1||batchMultiple<1||quantity%batchMultiple!==0)throw Error('Batch must satisfy integer MOQ and multiples');
 if(!Number.isInteger(leadTimeDays)||leadTimeDays<1)throw Error('Production lead time must be a positive integer');requireNumber(unitCostEGP,'unitCostEGP');
 if(!variantId||!days.includes(startDate))throw Error('Batch start must be in planning horizon');
 const arrivalDate=addDays(startDate,leadTimeDays),inbound=days.map(d=>d===arrivalDate?quantity:0),productionUnits=days.map(d=>d===startDate?quantity:0),cashOutEGP=days.map(d=>d===startDate?quantity*unitCostEGP:0);
 const materials=Object.fromEntries(Object.entries(materialPerUnit??{}).map(([k,v])=>[k,days.map(d=>d===startDate?quantity*requireNumber(v,k):0)]));
 return {variantId,startDate,arrivalDate,quantity,inbound,productionUnits,cashOutEGP,materials};
}
