import fs from "node:fs";
import vm from "node:vm";

// Rename the inventory variant-row demand header only; preserve demand metrics.
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw new Error("Inventory labels: dashboard HTML not found");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const current="Matched product lines";
if(!html.includes(current))throw new Error("Inventory labels: expected 'Matched product lines' header missing");
html=html.replaceAll(current,"Previous Orders");
const updated=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
if(updated===worker)throw new Error("Inventory labels: no changes were made");
fs.writeFileSync("worker.mjs",updated);
console.log("Inventory variant demand header renamed to Previous Orders");
