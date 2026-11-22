import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseChannels} from "../decision-intelligence/diagnose.mjs";
const store="test.myshopify.com",model="linear",asOf="2026-11-19";
const make=(week,channel,sessions,orders)=>({day:new Date(Date.parse(asOf+"T12:00:00Z")-week*7*86400000).toISOString().slice(0,10),
 store,model,channel,traffic:"paid",sessions,orders});
test("only same weekdays enter baseline; 2 segments' contributions sum",()=>{
 const rows=[];
 for(let week=1;week<=4;week++){rows.push(make(week,"Meta",100,10));rows.push(make(week,"Google",100,20));}
 rows.push(make(0,"Meta",100,2),make(0,"Google",100,20));
 rows.push({...make(1,"Meta",100,10),day:"2026-11-18",sessions:99999,orders:99999});
 const r=diagnoseChannels(rows,{store,asOf});
 assert.equal(r.segments.length,2);
 assert.equal(r.totals.withinSegmentOrderGap,-8);
 assert.equal(r.totals.trafficMixContribution,0);
 assert.equal(r.segments[0].channel,"Meta");
 assert.equal(r.segments[0].baselineDays,4);
 assert.equal(r.segments[0].baselineRate,0.1);
});
test("can distinguish traffic mix shift from within-segment rate change",()=>{
 const rows=[];
 for(let w=1;w<=4;w++){rows.push(make(w,"A",100,10));rows.push(make(w,"B",100,30));}
 rows.push(make(0,"A",180,18),make(0,"B",20,6));
 const d=diagnoseChannels(rows,{store,asOf});
 // B excluded because current sessions below minimum; totals must disclose eligible-only
 assert.equal(d.segments.length,1);
 assert.equal(d.totals.withinSegmentOrderGap,0);
 assert.equal(d.excludedUnqualifiedSegments,true);
});
