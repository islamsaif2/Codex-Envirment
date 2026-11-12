import fs from "node:fs";
const worker=fs.readFileSync("worker.mjs","utf8");
const match=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
const html=Buffer.from(match[1],"base64").toString("utf8");
const a=html.indexOf("function renderInventory(){"),b=html.indexOf("\nfunction ",a+10);
const segment=html.slice(a,b);
console.log("INVENTORY FUNCTION CHARACTERS",segment.length);
for(const term of ["Products Inventory","Shopify stock by product","Showing ","inventory-card","inv-product","inv-grid","inv-summary","inv-header","inv-product-list","inv-root","inventory-panel"]){
 const i=segment.indexOf(term);
 console.log("INV TERM",term,"FOUND",i, i<0?"":segment.slice(Math.max(0,i-800),i+1300).replace(/https?:\/\/\S+/g,"[URL]"));
}
const css=html.match(/<style>([\s\S]*?)<\/style>/);
const styles=css?.[1]||"";
console.log("INV STYLE RULES",styles.split(/\n/).filter(x=>/\binv-|inventory-grid|inventory-card|inventory-summary|inventory-list/.test(x)).slice(0,95).join("\n").slice(0,9000));
