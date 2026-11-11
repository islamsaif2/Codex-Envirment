import fs from "node:fs";
import vm from "node:vm";

let worker = fs.readFileSync("worker.mjs","utf8");
const match = worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if (!match) throw new Error("V9: embedded dashboard missing");
let html = Buffer.from(match[1],"base64").toString("utf8");
const js = fs.readFileSync("overview-preservation-v9.js","utf8");
const css = fs.readFileSync("overview-preservation-v9.css","utf8");
new vm.Script(js,{filename:"overview-preservation-v9.js"});
if(!html.includes("</style>") || !html.includes("</body>")) throw new Error("V9: HTML injection anchor missing");
html=html.replace("</style>",css+"\n</style>");
html=html.replace("</body>","<script>\n"+js+"\n</script>\n</body>");
for(const [index,script] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  if(script[1].trim()) new vm.Script(script[1],{filename:"dashboard-inline-"+index+".js"});
}
worker=worker.replace(match[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("V9: original metric charts, compare badges, drilldowns and max-four-card layout preserved");
