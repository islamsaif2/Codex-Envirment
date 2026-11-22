import test from "node:test";
import assert from "node:assert/strict";
import {parseSetup,parseIncidents,evaluateDataQuality,excludeIncidentDates} from "../decision-intelligence/context.mjs";
test("setup answer column is parsed and user-chosen policy supported",()=>{
 const c=parseSetup([["Key","Question","Answer"],["primary_goal","Goal","Profit"],["data_repair_policy","Policy","Flag only"],["historical_inventory","Inventory","Partial"]]);
 assert.equal(c.primaryGoal,"Profit");assert.equal(c.dataRepairPolicy,"Flag only");assert.equal(c.historicalInventory,"Partial");
});
test("GA4 gap cannot block an unrelated Shopify attribution report",()=>{
 const incidents=parseIncidents([["Source","Start","End","Type","Status","Notes","Handling"],
   ["GA4","2026-11-01","2026-11-10","Tracking disconnected","Confirmed","","Exclude from baseline"]]);
 assert.equal(evaluateDataQuality(incidents,{source:"Shopify Attribution",asOf:"2026-11-04"}).mayAnalyze,true);
 assert.equal(evaluateDataQuality(incidents,{source:"GA4",asOf:"2026-11-04"}).mayAnalyze,false);
});
test("undated GA4 outage stays uncertain, not assumed cleared or excluded",()=>{
 const i=parseIncidents([["Source","Start","End"],["GA4","","","Tracking disconnected","Needs dates"]]);
 const q=evaluateDataQuality(i,{source:"GA4",asOf:"2026-11-22"});
 assert.equal(q.status,"incomplete-incident-info");assert.equal(q.mayAnalyze,true);
});

test("confirmed GA4 historical gap is excluded from GA4 only, not Shopify",()=>{
 const incidents=parseIncidents([["Source","Start","End","Type","Status","Notes","Handling"],
   ["GA4","2026-11-01","2026-11-03","Tracking disconnected","Confirmed","","Exclude from baseline"]]);
 const rows=[{day:"2026-11-01"},{day:"2026-11-04"}];
 assert.deepEqual(excludeIncidentDates(rows,incidents,{source:"GA4"}).rows,[rows[1]]);
 assert.deepEqual(excludeIncidentDates(rows,incidents,{source:"Shopify Attribution"}).rows,rows);
});
