import test from "node:test";
import assert from "node:assert/strict";
import {interpretInventoryRows} from "../decision-intelligence/inventory-history.mjs";
const r=(periodStart,periodEnd,source)=>({periodStart,periodEnd,store:"test.myshopify.com",variantId:"v1",source,granularity:source==="ShopifyQL inventory"?"month":"daily"});
test("history reader never substitutes live stock for a historical date",()=>{
 const result=interpretInventoryRows([r("2026-10-01","2026-10-31","ShopifyQL inventory"),r("2026-11-22","2026-11-22","Shopify Admin live snapshot")],{store:"test.myshopify.com",from:"2026-10-09",to:"2026-10-10"});
 assert.equal(result.rows.length,1);assert.equal(result.sources.dailyObserved,0);assert.equal(result.sources.historicalPeriod,1);
});
test("store and variant filtering prevent cross-business mixing",()=>{
 const x=interpretInventoryRows([r("2026-10-01","2026-10-31","ShopifyQL inventory")],{store:"other.myshopify.com",from:"2026-10-01",to:"2026-11-01"});
 assert.equal(x.rows.length,0);
});
