// Compressed, bounded, shared Google Sheets response cache.
// This is installed in Node before the Worker handles any requests.
// Reuses one upstream request for concurrent consumers and provides stale
// results immediately while refreshing in the background. No metric logic changes.
import {gzipSync, gunzipSync} from "node:zlib";

const CACHE_TTL_MS = 5 * 60_000;             // Fresh for five minutes
const CACHE_MAX_STALE_MS = 12 * 60 * 60_000; // Last known good for outages
const CACHE_MAX_BYTES = 32 * 1024 * 1024;   // Compressed RAM budget
const ITEM_MAX_BYTES = 12 * 1024 * 1024;
const RAW_MAX_BYTES = 64 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_ACTIVE_SHEET_FETCHES = 3;

export function installGoogleSheetResponseCache() {
  if (globalThis.__ultraSheetResponseCacheInstalled) return;
  globalThis.__ultraSheetResponseCacheInstalled = true;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const store = new Map();
  const inflight = new Map();
  const waiters = [];
  let active = 0, totalBytes = 0;

  function target(input) {
    try {
      const u = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      return u.hostname === "docs.google.com" && /^\/spreadsheets\/d\/[^/]+\/gviz\/tq$/.test(u.pathname) ? u.href : null;
    } catch { return null; }
  }

  function saved(key) {
    const record = store.get(key);
    if (!record) return null;
    if (Date.now() - record.storedAt > CACHE_MAX_STALE_MS) {
      totalBytes -= record.gz.length;
      store.delete(key);
      return null;
    }
    store.delete(key);
    store.set(key, record);
    return record;
  }

  function response(record, status) {
    const headers = new Headers(record.headers);
    headers.set("x-ultramedix-sheet-cache", status);
    return new Response(gunzipSync(record.gz), {status: 200, headers});
  }

  function keep(key, raw, headers) {
    if (raw.byteLength > RAW_MAX_BYTES) return;
    let gz;
    try { gz = gzipSync(raw, {level: 1}); } catch { return; }
    if (gz.byteLength > ITEM_MAX_BYTES) return;
    const previous = store.get(key);
    if (previous) { totalBytes -= previous.gz.byteLength; store.delete(key); }
    store.set(key, {gz, headers: [...headers.entries()], storedAt: Date.now()});
    totalBytes += gz.byteLength;
    while (totalBytes > CACHE_MAX_BYTES && store.size) {
      const oldestKey = store.keys().next().value;
      const old = store.get(oldestKey);
      totalBytes -= old.gz.byteLength;
      store.delete(oldestKey);
    }
  }

  async function acquire() {
    if (active < MAX_ACTIVE_SHEET_FETCHES) { active++; return; }
    await new Promise(resolve => waiters.push(resolve));
    // The releasing request transfers its slot directly to this waiter.
  }
  function release() {
    const waiter = waiters.shift();
    if (waiter) waiter();
    else active--;
  }

  function refresh(key, input, init) {
    if (inflight.has(key)) return inflight.get(key);
    const job = (async () => {
      await acquire();
      try {
        const config = {...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)};
        const result = await nativeFetch(input, config);
        // Copy each response exactly once so multiple consumers can read it.
        const raw = Buffer.from(await result.arrayBuffer());
        const metadata = {status:result.status, headers:[...result.headers.entries()], raw};
        if (result.ok) keep(key, raw, result.headers);
        return metadata;
      } finally {
        release();
      }
    })();
    inflight.set(key, job);
    job.finally(() => {
      if (inflight.get(key) === job) inflight.delete(key);
    }).catch(() => {});
    return job;
  }

  globalThis.fetch = async function ultraCachedFetch(input, init) {
    const key = target(input);
    if (!key || (init?.method && init.method.toUpperCase() !== "GET")) return nativeFetch(input, init);
    const entry = saved(key);
    const age = entry ? Date.now() - entry.storedAt : Infinity;
    if (entry && age < CACHE_TTL_MS) return response(entry, "HIT");
    if (entry) {
      // Never make a page wait for the next Google Sheets refresh.
      refresh(key, input, init).catch(e => console.warn("[sheet-cache] Refresh failed", new URL(key).searchParams.get("sheet"), e.message));
      return response(entry, "STALE-REFRESHING");
    }
    try {
      const data = await refresh(key, input, init);
      return new Response(data.raw, {status:data.status, headers:data.headers});
    } catch (error) {
      const fallback = saved(key);
      if (fallback) return response(fallback, "STALE-ERROR");
      throw error;
    }
  };
  console.log("[sheet-cache] Compressed Google Sheets response cache enabled");
}
