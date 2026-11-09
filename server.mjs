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
const entries = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      const record = entries.get(key);
      if (!record) return undefined;
      if (record.expires < Date.now()) { entries.delete(key); return undefined; }
      return record.response.clone();
    },
    async put(request, response) {
      const key = typeof request === "string" ? request : request.url;
      const cacheControl = response.headers.get("Cache-Control") || "";
      const seconds = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 120);
      entries.set(key, { response: response.clone(), expires: Date.now() + seconds * 1000 });
      while (entries.size > 35) entries.delete(entries.keys().next().value);
    }
  }
};
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
