import test from "node:test";
import assert from "node:assert/strict";
import {analyzeAttribution} from "../decision-intelligence/anomaly.mjs";
const store="test.myshopify.com";
function rows(rate=0.1,target=0.01){
 const result=[];
 const anchor=Date.parse("2026-11-21T12:00:00Z");
 for(let w=0;w<=7;w++){
  const day=new Date(anchor-w*7*86400000).toISOString().slice(0,10);
  result.push({day,store,model:"linear",channel:"Instagram",traffic:"paid",sessions:1000,orders:w===0?Math.round(target*1000):Math.round(rate*1000)});
 }
 return result;
}
test("detects meaningful sustained-baseline drop without a hardcoded order-rate target",()=>{
 const r=analyzeAttribution(rows(),{store,asOf:"2026-11-21"});
 assert.equal(r.findings.length,2);
 assert(r.findings.every(f=>f.direction==="decrease"&&f.adjustedP<=0.05));
});
test("no alert on stable rates",()=>{
 const r=analyzeAttribution(rows(0.1,0.1),{store,asOf:"2026-11-21"});
 assert.equal(r.findings.length,0);
});
test("rejects silent mixing of old and new stores",()=>{
 assert.throws(()=>analyzeAttribution(rows(),{asOf:"2026-11-21"}),/Store must be specified/);
});
test("excludes sparse and invalid conversion data",()=>{
 const sparse=rows().map(r=>({...r,sessions:10,orders:1}));
 assert.equal(analyzeAttribution(sparse,{store,asOf:"2026-11-21"}).findings.length,0);
});
test("is attributable to one selected store",()=>{
 const r=analyzeAttribution([...rows(),...rows().map(x=>({...x,store:"old.myshopify.com",orders:900}))],{store,asOf:"2026-11-21"});
 assert.equal(r.findings.length,2);
});
