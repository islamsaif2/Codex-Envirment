import fs from "node:fs";
import vm from "node:vm";
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("Inventory design: HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
for(const token of ["function renderInventory(){","inv-grid","function renderShippingAnalysis()"]){
 if(!html.includes(token))throw Error("Inventory design: missing dashboard anchor "+token);
}
const js=fs.readFileSync("inventory-ui-compact.js","utf8");
const css=fs.readFileSync("inventory-ui-compact.css","utf8");
new vm.Script(js,{filename:"inventory-ui-compact.js"});
html=html.replace("</head>",'<style id="ultra-inventory-ui-fix">'+css+"</style></head>");
html=html.replace("</body>",'<script id="ultra-inventory-ui-fix-js">\n'+js+'\n</script></body>');
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("Inventory header condensed; cards fill section width; metric source icons moved to left.");
