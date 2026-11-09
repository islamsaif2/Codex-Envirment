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
      const seconds = Number(cacheControl.match(/max-age=(\\d+)/)?.[1] || 120);
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
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost:" + PORT}`);
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = Buffer.concat(chunks);
    const init = { method: req.method, headers: req.headers };
    if (body.length && req.method !== "GET" && req.method !== "HEAD") init.body = body;
    const request = new Request(url.href, init);
    const ctx = { waitUntil(promise) { Promise.resolve(promise).catch(error => console.warn("[cache]", error?.message || error)); } };
    const response = await worker.fetch(request, env, ctx);
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
