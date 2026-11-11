import fs from "node:fs";
import vm from "node:vm";

const file="worker.mjs";
let worker=fs.readFileSync(file,"utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("Shopify Attribution: embedded HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const css=fs.readFileSync("shopify-attribution-ui.css","utf8");
const js=fs.readFileSync("shopify-attribution-ui.js","utf8");
new vm.Script(js,{filename:"shopify-attribution-ui.js"});
if(!html.includes("</style>")||!html.includes("</body>"))throw Error("Shopify Attribution: HTML insertion point missing");
if(!html.includes("source-attribution")&&!html.includes("Channel Analysis"))
  throw Error("Shopify Attribution: existing Channels analysis not found");
html=html.replace("</style>",css+"\n</style>");
html=html.replace("</body>","<script>\n"+js+"\n</script>\n</body>");
for(const [index,tag] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())
  if(tag[1].trim())new vm.Script(tag[1],{filename:"dashboard-inline-"+index+".js"});
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync(file,worker);
console.log("Shopify Attribution section installed in Channels");
