import http from "node:http";
import worker from "./worker.mjs";
import {gzipSync, gunzipSync} from "node:zlib";
import {installGoogleSheetResponseCache} from "./sheet-response-cache.mjs";
installGoogleSheetResponseCache();

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
// Expensive Google Sheets data is shared across tabs. Cache the assembled
// dashboard JSON as a small gzip-compressed snapshot; keep last-good results
// while refreshing. This prevents each navigation/date comparison from causing
// another full-sheet read. The first uncached request still awaits real data.
const dashboardInFlight = new Map();
const dashboardFailures = new Map();
const dashboardResults = new Map();
let dashboardQueue = Promise.resolve();
let dashboardResultBytes = 0;
const MAX_DASHBOARD_RESULTS = 24 * 1024 * 1024;  // compressed
const MAX_DASHBOARD_ITEM = 10 * 1024 * 1024;
const DASHBOARD_TTL_MS = 5 * 60_000;
const DASHBOARD_MAX_STALE_MS = 12 * 60 * 60_000;

function cachedDashboard(record, flag) {
  const headers = new Headers(record.headers);
  headers.set("X-Ultramedix-Cache", flag);
  headers.set("X-Ultramedix-Cache-Age", String(Math.floor((Date.now() - record.generatedAt) / 1000)));
  headers.set("Cache-Control", "no-store");
  return new Response(gunzipSync(record.gz), {status:record.status, headers});
}
function keepDashboard(key, status, headers, raw) {
  let gz;
  try { gz = gzipSync(raw, {level:1}); } catch { return; }
  if (gz.byteLength > MAX_DASHBOARD_ITEM) return;
  const old = dashboardResults.get(key);
  if (old) { dashboardResultBytes -= old.gz.length; dashboardResults.delete(key); }
  dashboardResults.set(key, {
    gz, status, generatedAt:Date.now(),
    headers:[...headers.entries()].filter(([name]) => !/^(content-length|content-encoding|transfer-encoding)$/i.test(name))
  });
  dashboardResultBytes += gz.length;
  while (dashboardResultBytes > MAX_DASHBOARD_RESULTS && dashboardResults.size) {
    const oldestKey=dashboardResults.keys().next().value;
    dashboardResultBytes -= dashboardResults.get(oldestKey).gz.length;
    dashboardResults.delete(oldestKey);
  }
}
function refreshDashboard(request, ctx) {
  const key=request.url;
  if (dashboardInFlight.has(key)) return dashboardInFlight.get(key);
  const run=async()=>{
    const started=Date.now();
    const result=await worker.fetch(request, env, ctx);
    const raw=Buffer.from(await result.arrayBuffer());
    if (result.ok) {
      keepDashboard(key, result.status, result.headers, raw);
      dashboardFailures.delete(key);
    } else {
      let message="The upstream analytics calculation did not complete";
      try {
        const parsed=JSON.parse(raw.toString("utf8"));
        if(parsed?.error)message=String(parsed.error);
      } catch {}
      dashboardFailures.set(key,{message,expires:Date.now()+60_000});
    }
    console.log(JSON.stringify({event:"dashboard-computation",status:result.status,durationMs:Date.now()-started,responseBytes:raw.length,cacheStored:result.ok}));
    const headers=new Headers(result.headers);
    headers.set("X-Ultramedix-Cache", "MISS");
    return new Response(raw, {status:result.status,headers});
  };
  // Protect the free Render instance from simultaneous 100k-row calculations.
  // Repeated requests for the exact same report share a single promise.
  const pending=dashboardQueue.then(run,run);
  const tracked=pending.catch(error=>{
    console.error("[report-worker]",new URL(key).pathname,error?.message||String(error));
    dashboardFailures.set(key,{
      message:"Unable to load live report: "+(error?.message||String(error)),
      expires:Date.now()+60_000
    });
    throw error;
  });
  dashboardQueue=tracked.then(()=>{},()=>{});
  dashboardInFlight.set(key,tracked);
  tracked.finally(()=>{if(dashboardInFlight.get(key)===tracked)dashboardInFlight.delete(key);}).catch(()=>{});
  return tracked;
}
async function dashboardResponse(request, ctx) {
  const key=request.url,entry=dashboardResults.get(key);
  const age=entry?Date.now()-entry.generatedAt:Infinity;
  if (entry && age < DASHBOARD_TTL_MS) {
    dashboardResults.delete(key);dashboardResults.set(key,entry);
    return cachedDashboard(entry,"HIT");
  }
  if (entry && age < DASHBOARD_MAX_STALE_MS) {
    // Always respond promptly with last-good data. Recalculation is deferred.
    if (!dashboardInFlight.has(key)) refreshDashboard(request,ctx)
      .catch(e=>console.error("[report-refresh]",e.message));
    return cachedDashboard(entry,"STALE-REFRESHING");
  }
  const failed=dashboardFailures.get(key);
  if(failed && failed.expires>Date.now()) {
    return Response.json({error:failed.message}, {
      status:503,headers:{"Cache-Control":"no-store","Retry-After":"15"}
    });
  }
  if(failed)dashboardFailures.delete(key);
  // The Render proxy has a shorter request deadline than a cold Sheets read.
  // Queue the calculation and return 202 immediately; the browser polls this
  // same URL until a compressed snapshot is ready. No open HTTP connection waits
  // for Google Sheets. This covers dashboard AND Creative Analysis.
  if (!dashboardInFlight.has(key)) refreshDashboard(request,ctx)
    .catch(e=>console.error("[report-job]",e.message));
  return Response.json({status:"processing",retryAfterMs:2000}, {
    status:202,
    headers:{"Cache-Control":"no-store","Retry-After":"2"}
  });
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
    const response = req.method === "GET" && (url.pathname === "/api/dashboard" || url.pathname === "/api/creative-analysis") ? await dashboardResponse(request, ctx) : await worker.fetch(request, env, ctx);
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
