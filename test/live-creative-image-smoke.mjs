const base="https://ultramedix-dashboard-ogy5.onrender.com";
const report=await fetch(base+"/api/creative-analysis?businessId=ultramedix&start=2026-11-07&end=2026-11-11");
if(report.status!==200)throw Error("Creative Analysis not ready: "+report.status);
const data=await report.json(), rows=(data.records||[]).filter(x=>typeof x.thumbnail==="string"&&x.thumbnail.startsWith("https://"));
const samples=[...new Set(rows.map(x=>x.thumbnail))].slice(0,6);
console.log("Creative records",data.records.length,"with thumbnails",rows.length,"sample",samples.length);
let successes=0;
for(let i=0;i<samples.length;i++){
 const url=base+"/api/creative-thumbnail?url="+encodeURIComponent(samples[i]);
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(19000)});
  const mime=response.headers.get("content-type");
  console.log("Image",i+1,"HTTP",response.status,"type",mime);
  if(response.ok&&mime?.startsWith("image/"))successes++;
  await response.body?.cancel();
 }catch(e){console.log("Image",i+1,"error",e.message);}
}
console.log("Meta CDN thumbnail proxy working",successes,"of",samples.length);
if(!successes)process.exitCode=1;
