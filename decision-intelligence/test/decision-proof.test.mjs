import test from 'node:test';
import assert from 'node:assert/strict';
import {explainPriorityOrder} from '../src/decision-proof.mjs';
const candidate=(id,upper)=>({id,title:id,impact:{kind:upper===null?'not_identified':'conditional_upper_bound',additionalDeliveredOrders:upper===null?null:{lower:0,upper}},constraints:['Confirm source'],evidence:{quantity:upper},whyPreferred:'Old canned answer',alternative:'Old canned alternative'});
test('explanation changes with actual scenario values and preserves uncertainty',()=>{
 const explain=upper=>explainPriorityOrder([candidate('A',upper),candidate('B',8),candidate('C',null)],'Delivered sales');
 const first=explain(10),second=explain(20);
 assert.equal(first[0].explanation.proof.comparisons[0].upperBoundDifference,2);
 assert.equal(second[0].explanation.proof.comparisons[0].upperBoundDifference,12);
 assert.equal(first[0].explanation.proof.provenBest,false);
 assert.equal(first[0].explanation.proof.overlappingAlternativeCount,1);
 assert.equal(first[2].explanation.proof.missingEffect,true);
 assert.equal(first[2].explanation.proof.candidate.upper,null);
 assert.equal('whyPreferred' in first[0],false);
 assert.equal('alternative' in first[0],false);
});
