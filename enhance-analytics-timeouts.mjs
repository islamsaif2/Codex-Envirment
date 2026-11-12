import fs from "node:fs";
import vm from "node:vm";
// The dashboard's Google Sheets upstream reader retries a 30-second timeout,
// so a 45-second browser timeout can abort before the server has finished.
// Allow a bounded 90-second wait for heavy dashboard/creative requests only.
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw new Error("Analytics request timeout: dashboard HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const old="signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json'";
const next="signal:AbortSignal.timeout((path.startsWith('/api/dashboard')||path.startsWith('/api/creative-analysis'))?90000:45000),headers:{'Content-Type':'application/json'";
if(!html.includes(old))throw new Error("Analytics request timeout: expected fetch anchor missing");
html=html.replace(old,next);
for(const [index,m] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()){
  if(m[1].trim())new vm.Script(m[1],{filename:"analytics-timeout-inline-"+index+".js"});
}
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("Heavy analytics requests now have a 90-second client budget (other requests unchanged).");
