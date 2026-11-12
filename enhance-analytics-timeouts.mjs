import fs from "node:fs";
import vm from "node:vm";
// Never abort dashboard/API requests at an arbitrary browser-side deadline.
// The backend enforces upstream health checks and returns cached last-good data.
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw new Error("Analytics request timeout: dashboard HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const old="signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json'";
const next="signal:opts.signal,headers:{'Content-Type':'application/json'";
if(!html.includes(old))throw new Error("Analytics request timeout: expected fetch anchor missing");
html=html.replace(old,next);
for(const [index,m] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()){
  if(m[1].trim())new vm.Script(m[1],{filename:"analytics-timeout-inline-"+index+".js"});
}
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("API requests no longer impose a browser timeout; backend cache handles slow upstream Sheets.");
