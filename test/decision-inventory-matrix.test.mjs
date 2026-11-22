import test from "node:test";
import assert from "node:assert/strict";
import {parseInventoryMatrix} from "../decision-intelligence/inventory-history.mjs";
test("matrix reads only dated stock with verified source store and preserves zero",()=>{
 const grid=[["Variant ID","Product","Variant","Current stock","Last updated","2026-11-19","2026-11-20"],
 ["Source store","example.myshopify.com","","","","ShopifyQL · day ending stock (historical)","LIVE SNAPSHOT · latest observation"],
 ["v1","Scrub","M",2,"2026-11-20 10:00",0,2],
 ["v2","Scrub","L",null,"",null,""]];
 const result=parseInventoryMatrix(grid,{store:"example.myshopify.com"});
 assert.equal(result.rows.length,2);
 assert.equal(result.rows[0].endingStock,0);
 assert.equal(result.rows[1].endingStock,2);
 assert.equal(result.rows[0].source,"ShopifyQL inventory");
 assert.equal(parseInventoryMatrix(grid,{store:"other.myshopify.com"}).rows.length,0);
});
test("matrix ignores missing data rather than inventing zero",()=>{
 const p=parseInventoryMatrix([["Variant ID","","","","","2026-10-01"],["Source store","s.myshopify.com","","","","ShopifyQL"],["v1","","","","",""]],{store:"s.myshopify.com"});
 assert.deepEqual(p.rows,[]);
});
