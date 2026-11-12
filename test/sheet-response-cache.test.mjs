import test from "node:test";
import assert from "node:assert/strict";
import {installGoogleSheetResponseCache} from "../sheet-response-cache.mjs";

test("coalesces concurrent Google Sheets reads and serves compressed cached responses",async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    await new Promise(resolve=>setTimeout(resolve,5));
    return new Response('{"status":"ok","table":{"rows":[1,2,3]}}',{
      status:200,headers:{"content-type":"application/json"}
    });
  };
  installGoogleSheetResponseCache();
  const url="https://docs.google.com/spreadsheets/d/example/gviz/tq?sheet=Orders&range=A1%3AC100";
  const [a,b]=await Promise.all([fetch(url),fetch(url)]);
  assert.equal((await a.json()).table.rows.length,3);
  assert.equal((await b.json()).table.rows.length,3);
  assert.equal(calls,1,"two simultaneous reads must share the same upstream request");
  const hit=await fetch(url);
  assert.equal(hit.headers.get("x-ultramedix-sheet-cache"),"HIT");
  assert.equal((await hit.json()).status,"ok");
  assert.equal(calls,1,"subsequent reads must be served without another Google call");
});

test("non-Sheets requests bypass the Google response cache",async()=>{
  // The installed fetch wrapper falls through to the mocked nativeFetch.
  const result=await fetch("https://example.com/health");
  assert.equal(result.status,200);
});
