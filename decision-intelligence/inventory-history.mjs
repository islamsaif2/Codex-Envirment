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

// Stock matrix parser: values are per date, blank is NOT zero.
export function parseInventoryMatrix(grid,{store}={}){
 const h=grid[0]||[],sources=grid[1]||[];
 const dom=String(sources[1]||"").trim();
 if(!store||dom.toLowerCase()!==String(store).toLowerCase())return {verifiedStore:false,rows:[]};
 const out=[];
 for(const r of grid.slice(2)){
  const id=String(r[0]||"").trim();if(!id)continue;
  for(let i=5;i<h.length;i++){
   const hd=String(h[i]||"");const mt=hd.match(/^Date\((\d+),(\d+),(\d+)/);
   const d=mt?[mt[1],String(Number(mt[2])+1).padStart(2,"0"),String(mt[3]).padStart(2,"0")].join("-"):hd.slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||r[i]===null||r[i]===undefined||r[i]==="")continue;
   const n=Number(r[i]),src=String(sources[i]||"");if(!Number.isFinite(n))continue;
   const live=src.includes("LIVE SNAPSHOT"),hist=src.includes("ShopifyQL");
   if(!live&&!hist)continue;
   out.push({periodStart:d,periodEnd:d,granularity:"daily",store:dom,variantId:id,
     product:String(r[1]||""),variant:String(r[2]||""),startingStock:null,endingStock:n,
     unitsSold:null,daysOutOfStock:null,adjustmentNet:null,adjustmentReason:"",
     inventoryState:"",source:live?"Shopify Admin live snapshot":"ShopifyQL inventory",
     recordedAt:live?String(r[4]||""):"",
     quality:live?"Stock at sync, not full-day availability":"Day ending stock, not intraday availability"});
  }
 }
 return {verifiedStore:true,rows:out};
}
const matrixCache=new Map();
export async function readInventoryMatrix(spreadsheetId,{store}={}){
 const key=spreadsheetId+"|"+store,hit=matrixCache.get(key);
 if(hit&&hit.expires>Date.now())return hit.rows;
 const url=new URL("https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/gviz/tq");
 url.searchParams.set("tqx","out:json");url.searchParams.set("headers","0");
 url.searchParams.set("sheet","Inventory Stock Matrix");url.searchParams.set("range","A1:AZ");
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error("Inventory matrix unavailable HTTP "+response.status);
 const body=await response.text(),a=body.indexOf("{"),b=body.lastIndexOf("}");
 if(a<0||b<a)throw Error("Invalid matrix response");
 const payload=JSON.parse(body.slice(a,b+1));
 if(payload.status!=="ok"||!Array.isArray(payload.table?.rows))throw Error("Inventory matrix unavailable");
 const grid=payload.table.rows.map(r=>(r.c||[]).map(c=>c?.v??c?.f??""));
 const parsed=parseInventoryMatrix(grid,{store});
 if(!parsed.verifiedStore)throw Error("Inventory matrix source store missing or mismatched");
 matrixCache.set(key,{rows:parsed.rows,expires:Date.now()+120000});return parsed.rows;
}
