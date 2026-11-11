import http from "node:http";
import worker from "./worker.mjs";

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";
const DEFAULT_SHEET = "1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E";

const kvData = new Map();
const kv = {
  async get(key, format) {
    const rec = kvData.get(String(key));
    if (!rec) return null;
    if (rec.exp && Date.now() >= rec.exp) { kvData.delete(String(key)); return null; }
    if (format === "json") { try { return JSON.parse(rec.value); } catch { return null; } }
    return rec.value;
  },
  async put(key, value, options = {}) {
    kvData.set(String(key), { value: String(value), exp: options.expirationTtl ? Date.now() + Number(options.expirationTtl) * 1000 : 0 });
    if (kvData.size > 100) {
      const first = kvData.keys().next().value;
      kvData.delete(first);
    }
  }
};
// Keep the Worker-style sheet cache inside a small, bounded portion of the
// 512 MiB Render instance. Previously it retained up to 35 large responses
// (including separate fresh/stale copies) without an overall byte limit.
const entries = new Map();
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_CACHE_ITEM_BYTES = 6 * 1024 * 1024;
let cacheBytes = 0;
globalThis.caches = {
  default: {
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      const record = entries.get(key);
      if (!record) return undefined;
      if (record.expires < Date.now()) {
        cacheBytes -= record.size; entries.delete(key); return undefined;
      }
      entries.delete(key); entries.set(key, record);
      return record.response.clone();
    },
    async put(request, response) {
      const key = typeof request === "string" ? request : request.url;
      const clone = response.clone();
      const size = (await clone.arrayBuffer()).byteLength;
      if (size > MAX_CACHE_ITEM_BYTES) return;
      const old = entries.get(key);
      if (old) { cacheBytes -= old.size; entries.delete(key); }
      const cacheControl = response.headers.get("Cache-Control") || "";
      const seconds = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 120);
      entries.set(key, { response, size, expires: Date.now() + seconds * 1000 });
      cacheBytes += size;
      while (cacheBytes > MAX_CACHE_BYTES && entries.size) {
        const first = entries.keys().next().value;
        cacheBytes -= entries.get(first).size;
        entries.delete(first);
      }
    }
  }
};
// Limit concurrent expensive dashboard computations; concurrent full-sheet
// reads were causing 512MiB OOM kills. Duplicate requests share one promise.
const dashboardInFlight = new Map();
const dashboardResults = new Map();
let dashboardQueue = Promise.resolve();
let dashboardResultBytes = 0;
const MAX_DASHBOARD_RESULTS = 9 * 1024 * 1024;
const DASHBOARD_TTL_MS = 90_000;
async function dashboardResponse(request, ctx) {
  const key = request.url;
  const cached = dashboardResults.get(key);
  if (cached && cached.expires > Date.now()) return cached.response.clone();
  if (cached) { dashboardResults.delete(key); dashboardResultBytes -= cached.size; }
  let active = dashboardInFlight.get(key);
  if (!active) {
    const work = async () => {
      const nextCached = dashboardResults.get(key);
      if (nextCached && nextCached.expires > Date.now()) return nextCached.response;
      const response = await worker.fetch(request, env, ctx);
      if (response.ok) {
        const bytes = await response.clone().arrayBuffer();
        if (bytes.byteLength <= 2 * 1024 * 1024) {
          const old = dashboardResults.get(key);
          if (old) dashboardResultBytes -= old.size;
          dashboardResults.delete(key);
          dashboardResults.set(key, { response: response.clone(), size: bytes.byteLength, expires: Date.now() + DASHBOARD_TTL_MS });
          dashboardResultBytes += bytes.byteLength;
          while (dashboardResultBytes > MAX_DASHBOARD_RESULTS) {
            const first = dashboardResults.keys().next().value;
            dashboardResultBytes -= dashboardResults.get(first).size;
            dashboardResults.delete(first);
          }
        }
      }
      return response;
    };
    active = dashboardQueue.then(work, work);
    dashboardQueue = active.then(() => {}, () => {});
    dashboardInFlight.set(key, active);
    active.finally(() => { if (dashboardInFlight.get(key) === active) dashboardInFlight.delete(key); }).catch(() => {});
  }
  return (await active).clone();
}
const env = { SPREADSHEET_ID: process.env.SPREADSHEET_ID || DEFAULT_SHEET, BUSINESS_STORE: kv };

// Read Shopify's exported attribution table directly from the existing workbook.
// Keep model-specific attributed orders separate from session-based conversion metrics.
const attributionCache={rows:null,expires:0,pending:null};
function attrNumber(v){const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.eE+-]/g,""));return Number.isFinite(n)?n:0;}
function attrDay(v){const s=String(v??"");let m=s.match(/^Date\((\d+),(\d+),(\d+)/);if(m)return [m[1],String(+m[2]+1).padStart(2,"0"),String(+m[3]).padStart(2,"0")].join("-");m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:"";}
async function attributionRows(){
  if(attributionCache.rows&&attributionCache.expires>Date.now())return attributionCache.rows;
  if(attributionCache.pending)return attributionCache.pending;
  attributionCache.pending=(async()=>{
    const spreadsheetId=env.SPREADSHEET_ID;
    const url=new URL("https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/gviz/tq");
    url.searchParams.set("tqx","out:json");url.searchParams.set("headers","0");
    url.searchParams.set("sheet","Shopify Attribution Data");url.searchParams.set("range","A1:N");
    const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error("Unable to read Shopify Attribution Data (HTTP "+response.status+")");
    const body=await response.text(),a=body.indexOf("{"),b=body.lastIndexOf("}");
    if(a<0||b<a)throw Error("Invalid Shopify attribution worksheet response");
    const payload=JSON.parse(body.slice(a,b+1));
    if(payload.status!=="ok"||!payload.table?.rows)throw Error("Shopify Attribution Data is not accessible");
    const records=new Map();
    for(const entry of payload.table.rows){
      const cells=entry.c||[];
      const val=i=>{const c=cells[i];return c?.v??c?.f??"";};
      const day=attrDay(val(0)),store=String(val(1)).trim(),channel=String(val(2)).trim(),
        traffic=String(val(3)).trim().toLowerCase(),model=String(val(10)).trim().toLowerCase()||
          String(val(4)).trim().toLowerCase().replace(/[\s-]+/g,"_");
      if(!day||!/\.myshopify\.com$/i.test(store)||!channel||
        !["last_non_direct_click","last_click","first_click","any_click","linear"].includes(model))continue;
      const row={day,store,channel,traffic,model,sessions:attrNumber(val(5)),
        checkouts:attrNumber(val(6)),orders:attrNumber(val(8)),sales:attrNumber(val(9)),
        synced:String(val(13)||"")};
      const key=[day,store,channel.toLowerCase(),traffic,model].join("|");
      const old=records.get(key);
      // Re-imported periods can appear twice after top-insert batches. Prefer
      // the newest snapshot rather than summing both exports.
      if(!old||row.synced>old.synced)records.set(key,row);
    }
    const out=[...records.values()];
    attributionCache.rows=out;attributionCache.expires=Date.now()+120000;
    return out;
  })().finally(()=>{attributionCache.pending=null;});
  return attributionCache.pending;
}
async function attributionResponse(url){
 const model=url.searchParams.get("model")||"linear";
 const traffic=url.searchParams.get("traffic")||"all";
 const store=url.searchParams.get("store")||"all";
 const start=url.searchParams.get("start")||"";
 const end=url.searchParams.get("end")||"";
 if(!["last_non_direct_click","last_click","first_click","any_click","linear"].includes(model)||
    !["all","marketing","paid","organic"].includes(traffic))return Response.json({error:"Invalid attribution filter"},{status:400});
 const all=await attributionRows(),groups=new Map(),stores=new Set();
 let sessions=0,checkouts=0,orders=0,sales=0,matched=0;
 for(const r of all){
  stores.add(r.store);
  if(r.model!==model||(store!=="all"&&r.store!==store)||
     (start&&r.day<start)||(end&&r.day>end))continue;
  if(traffic==="marketing"&&!["paid","organic","unknown"].includes(r.traffic))continue;
  if(traffic==="paid"&&r.traffic!=="paid")continue;
  if(traffic==="organic"&&r.traffic!=="organic")continue;
  matched++;sessions+=r.sessions;checkouts+=r.checkouts;orders+=r.orders;sales+=r.sales;
  const key=r.channel+"|"+r.traffic,existing=groups.get(key)||{channel:r.channel,traffic:r.traffic,sessions:0,checkouts:0,orders:0,sales:0};
  existing.sessions+=r.sessions;existing.checkouts+=r.checkouts;existing.orders+=r.orders;existing.sales+=r.sales;
  groups.set(key,existing);
 }
 const data={model,traffic,store,start,end,stores:[...stores].sort(),matchedRows:matched,
  totals:{sessions,checkouts,orders,sales,conversionRate:sessions?checkouts/sessions:null},
  channels:[...groups.values()].map(r=>({...r,conversionRate:r.sessions?r.checkouts/r.sessions:null}))
   .sort((a,b)=>b.sales-a.sales||b.orders-a.orders)};
 return Response.json(data,{headers:{"Cache-Control":"public, max-age=60"}});
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost:" + PORT}`);
    if(req.method==="GET"&&url.pathname==="/api/shopify-attribution"){
      const response=await attributionResponse(url);
      res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = Buffer.concat(chunks);
    const init = { method: req.method, headers: req.headers };
    if (body.length && req.method !== "GET" && req.method !== "HEAD") init.body = body;
    const request = new Request(url.href, init);
    const ctx = { waitUntil(promise) { Promise.resolve(promise).catch(error => console.warn("[cache]", error?.message || error)); } };
    const response = req.method === "GET" && url.pathname === "/api/dashboard" ? await dashboardResponse(request, ctx) : await worker.fetch(request, env, ctx);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(bytes);
    console.log(JSON.stringify({method: req.method, path: url.pathname, status: response.status, durationMs: Date.now()-started, responseBytes: bytes.length}));
  } catch (error) {
    console.error("[request failed]", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Dashboard request failed: " + (error?.message || String(error)) }));
  }
});
server.listen(PORT, HOST, () => console.log(`Ultramedix dashboard listening on http://${HOST}:${PORT}`));
