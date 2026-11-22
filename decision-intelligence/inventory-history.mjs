// Historical inventory read model: do not silently substitute today's stock for past dates.
const cache={rows:null,expires:0,pending:null};
function day(v){
 const s=String(v??"");let m=s.match(/^Date\((\d+),(\d+),(\d+)/);
 if(m)return [m[1],String(+m[2]+1).padStart(2,"0"),String(m[3]).padStart(2,"0")].join("-");
 return s.match(/^\d{4}-\d{2}-\d{2}/)?.[0]||"";
}
function number(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;}
export function interpretInventoryRows(rows,{store,from,to,variantId,limit=1000}={}){
 const filtered=rows.filter(r=>r.store===store&&r.periodStart<=to&&r.periodEnd>=from&&
   (!variantId||r.variantId===variantId));
 const known=filtered.filter(r=>r.source==="ShopifyQL inventory"||r.source==="Shopify Admin live snapshot");
 const adjustments=filtered.filter(r=>r.source==="ShopifyQL inventory adjustments");
 const latest=known.filter(r=>r.granularity==="daily").length;
 return {store,from,to,variantId:variantId||null,
   sources:{historicalPeriod:known.length-latest,dailyObserved:latest,adjustmentOnly:adjustments.length},
   rows:filtered.slice(0,limit),truncated:filtered.length>limit,
   disclaimer:"Monthly periods are not daily stock measurements. Daily snapshots are time-of-sync observations, not necessarily closing inventory. Adjustments alone do not prove stock balances. Historical coverage may be incomplete."};
}
export async function readInventoryHistory(spreadsheetId){
 if(cache.rows&&cache.expires>Date.now())return cache.rows;
 if(cache.pending)return cache.pending;
 cache.pending=(async()=>{
  const url=new URL("https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/gviz/tq");
  url.searchParams.set("tqx","out:json");url.searchParams.set("headers","0");
  url.searchParams.set("sheet","Inventory History");url.searchParams.set("range","A1:Q");
  const res=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error("Inventory History unavailable (HTTP "+res.status+")");
  const body=await res.text(),a=body.indexOf("{"),b=body.lastIndexOf("}");
  if(a<0||b<a)throw Error("Invalid inventory worksheet response");
  const parsed=JSON.parse(body.slice(a,b+1));
  if(parsed.status!=="ok"||!Array.isArray(parsed.table?.rows))throw Error("Inventory History not accessible");
  const data=parsed.table.rows.slice(1).map(r=>(r.c||[]).map(c=>c?.v??c?.f??""))
   .filter(c=>day(c[0])&&day(c[1])&&c[3]&&c[4])
   .map(c=>({periodStart:day(c[0]),periodEnd:day(c[1]),granularity:String(c[2]),
     store:String(c[3]).trim(),variantId:String(c[4]).trim(),product:String(c[5]),
     variant:String(c[6]),startingStock:number(c[7]),endingStock:number(c[8]),
     unitsSold:number(c[9]),daysOutOfStock:number(c[10]),adjustmentNet:number(c[11]),
     adjustmentReason:String(c[12]),inventoryState:String(c[13]),source:String(c[14]),
     recordedAt:String(c[15]),quality:String(c[16])}));
  cache.rows=data;cache.expires=Date.now()+120000;return data;
 })();
 try{return await cache.pending}finally{cache.pending=null}
}
