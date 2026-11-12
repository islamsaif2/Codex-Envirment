import assert from "node:assert/strict";
const root="https://ultramedix-dashboard-ogy5.onrender.com";
const url=root+"/api/creative-analysis?businessId=ultramedix&start=2026-11-07&end=2026-11-13";
let result;
for(let i=0;i<80;i++){
  result=await fetch(url,{signal:AbortSignal.timeout(40_000)});
  if(result.status!==202)break;
  await result.arrayBuffer();
  await new Promise(resolve=>setTimeout(resolve,1500));
}
assert.equal(result.status,200,"Creative Analysis API must respond successfully");
const data=await result.json();
assert.ok(data.records.length>0,"No creative records loaded");
const adDates=new Map();
for(const r of data.records){
  assert.ok(Object.hasOwn(r,"thumbnailDate")&&Object.hasOwn(r,"creativeUrlDate"),"Missing latest-link dates for ad "+r.id);
  const old=adDates.get(r.id);
  if(old)assert.deepEqual({image:r.thumbnail,imageDate:r.thumbnailDate,url:r.creativeUrl,urlDate:r.creativeUrlDate},old,"Ad "+r.id+" has inconsistent links across dated rows");
  else adDates.set(r.id,{image:r.thumbnail,imageDate:r.thumbnailDate,url:r.creativeUrl,urlDate:r.creativeUrlDate});
  if(r.thumbnail)assert.ok(r.thumbnailDate,"Thumbnail without source date");
  if(r.creativeUrl)assert.ok(r.creativeUrlDate,"Facebook URL without source date");
}
const home=await fetch(root,{signal:AbortSignal.timeout(40_000)});
const html=await home.text();
assert.ok(!html.includes("facebookPostEmbed("),"Obsolete post embed code still exists");
assert.ok(!html.includes("/api/creative-thumbnail?url="),"Obsolete thumbnail proxy fallback still exists");
console.log("CREATIVE_LATEST_DATED_LINKS_PASS",JSON.stringify({rows:data.records.length,uniqueAds:adDates.size,datedImages:[...adDates.values()].filter(r=>r.imageDate).length}));
