import fs from "node:fs";
import vm from "node:vm";

let source=fs.readFileSync("worker.mjs","utf8");
const embedded=source.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("V8: embedded dashboard HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const js=fs.readFileSync("channel-layout-v8.js","utf8");
const css=fs.readFileSync("channel-layout-v8.css","utf8");
new vm.Script(js,{filename:"channel-layout-v8.js"});
if(!html.includes("</body>")||!html.includes("</style>"))throw Error("V8: missing HTML insertion points");
html=html.replace("</style>",css+"\n</style>");
html=html.replace("</body>","<script>\n"+js+"\n</script>\n</body>");
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of scripts.entries())if(m[1].trim())new vm.Script(m[1],{filename:"ultramedix-v8-script-"+i+".js"});
source=source.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",source);
console.log("V8 channel source icons and balanced layouts installed",scripts.length);
