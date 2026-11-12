import fs from "node:fs";
import vm from "node:vm";
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("Report layout: embedded dashboard HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const css=fs.readFileSync("report-layout.css","utf8");
const js=fs.readFileSync("report-layout.js","utf8");
new vm.Script(js,{filename:"report-layout.js"});
if(!html.includes("</head>")||!html.includes("</body>")||
   !html.includes("Shipping outcomes by region")||
   !html.includes("Regions Analysis")||
   !html.includes("Daily Meta Ads performance"))throw Error("Report layout: expected anchors missing");
html=html.replace("</head>",'<style id="ultra-report-layout">'+css+"</style></head>");
html=html.replace("</body>","<script>\n"+js+"\n</script>\n</body>");
for(const [i,tag] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()){
 if(tag[1].trim())new vm.Script(tag[1],{filename:"report-layout-inline-"+i});
}
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("Report layout: Shipping, Customers, Ads and metric chart aliases installed");
