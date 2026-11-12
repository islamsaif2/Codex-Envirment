import assert from "node:assert/strict";
const kind=process.argv[2];
assert.ok(["dashboard","creative"].includes(kind),"Choose dashboard or creative");
const base="https://ultramedix-dashboard-ogy5.onrender.com";
const path=kind==="dashboard"
  ?"/api/dashboard?businessId=ultramedix&startDate=2026-11-05&endDate=2026-11-11"
  :"/api/creative-analysis?businessId=ultramedix&start=2026-11-05&end=2026-11-11";
const started=Date.now();
let attempts=0;
while(Date.now()-started<8*60_000){
  attempts++;
  const r=await fetch(base+path,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(65_000)});
  if(r.status===202){
    await r.arrayBuffer();
    if(attempts%10===1)console.log(kind+" report is processing (poll "+attempts+")...");
    await new Promise(resolve=>setTimeout(resolve,2_000));
    continue;
  }
  const body=await r.text();
  if(r.status!==200)throw Error(kind+" returned HTTP "+r.status+": "+body.slice(0,500));
  const data=JSON.parse(body);
  if(kind==="dashboard"){
    for(const key of ["metrics","regionsAnalysis","regionPerformance","shippingStatusCounts"]){
      assert.ok(Object.hasOwn(data,key),"Missing dashboard field "+key);
    }
  } else {
    for(const key of ["records","start","end","prevStart","prevEnd"]){
      assert.ok(Object.hasOwn(data,key),"Missing creative field "+key);
    }
  }
  console.log(kind+" PASS in "+((Date.now()-started)/1000).toFixed(1)+"s; polls "+attempts+
    "; cache "+r.headers.get("X-Ultramedix-Cache")+
    "; responseBytes "+Buffer.byteLength(body)+
    (kind==="creative" ? "; records "+data.records.length : ""));
  process.exit(0);
}
throw Error(kind+" did not complete within the 8-minute integration-test budget");
