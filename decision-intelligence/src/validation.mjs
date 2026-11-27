import {isoDay,requireNumber} from './core.mjs';
export function reviewOutcomes(records,today){
 isoDay(today);if(!Array.isArray(records))throw Error('Outcome records required');const seen=new Set(),eligible=[],pending=[];
 for(const r of records){if(!r.decisionId||seen.has(r.decisionId))throw Error('Unique decision IDs required');seen.add(r.decisionId);isoDay(r.maturityDate);
  if(!r.actualAction||!r.inputHash||!r.sourceReference)throw Error('Actual action, original input hash and outcome source are required');
  if(r.maturityDate>=today){pending.push(r.decisionId);continue;}
  requireNumber(r.predictedValue,'predictedValue',-Infinity);requireNumber(r.actualValue,'actualValue',-Infinity);
  eligible.push({decisionId:r.decisionId,error:r.actualValue-r.predictedValue,actionChanged:r.actualAction!==r.proposedAction});
 }
 return {eligible,pending,mae:eligible.length?eligible.reduce((s,r)=>s+Math.abs(r.error),0)/eligible.length:null,bias:eligible.length?eligible.reduce((s,r)=>s+r.error,0)/eligible.length:null,automaticRetraining:false,causal:false,reason:'Prediction error and actual-action tracking only. Observed outcomes do not prove a causal effect of the recommendation.'};
}
