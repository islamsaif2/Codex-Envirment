import fs from "node:fs";
import vm from "node:vm";

let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("V6: missing embedded HTML");
let html=Buffer.from(embedded[1],"base64").toString("utf8");

const inventoryStart=html.indexOf("    const state=!row.active?states.inactive");
const inventoryOldEnd=":row.cover<=7?states.soon:states.good;";
const inventoryEnd=html.indexOf(inventoryOldEnd,inventoryStart);
if(inventoryStart<0||inventoryEnd<inventoryStart)throw Error("V6: inventory classification anchor missing");
const newInventoryState=[
"    // Zero 28-day demand with positive tracked stock means no projected stockout.",
"    const zeroDemand=Number.isFinite(row.units28)&&row.units28===0&&(!Number.isFinite(row.units7)||row.units7===0);",
"    const state=!row.active?states.inactive",
"      :!row.tracked||!hasStock?states.review",
"      :row.stock<=0?states.out",
"      :zeroDemand?states.good",
"      :row.status==='Update stock data'||!hasCover?states.review",
"      :row.cover<=3?states.critical",
"      :row.cover<=7?states.soon:states.good;"
].join("\n");
html=html.slice(0,inventoryStart)+newInventoryState+html.slice(inventoryEnd+inventoryOldEnd.length);

const channelsStart=html.indexOf("function renderChannels(){");
const channelsEnd=html.indexOf("\nfunction qualityPanel()",channelsStart);
if(channelsStart<0||channelsEnd<channelsStart)throw Error("V6: Channels renderer missing");
let channels=html.slice(channelsStart,channelsEnd);
const oldDefault="const sourceMode=window.sourceAttribution||'last'";
if(!channels.includes(oldDefault))throw Error("V6: first-click default anchor missing");
channels=channels.replace(oldDefault,"const sourceMode=window.sourceAttribution||'first'");
const sortedStart=channels.indexOf("sourceRows=allRows.length?");
const sortedEnd=channels.indexOf(",max=Math.max(",sortedStart);
if(sortedStart<0||sortedEnd<sortedStart)throw Error("V6: Channels default sorting anchor missing");
channels=channels.slice(0,sortedStart)+
 "sourceRows=allRows.slice().sort((a,b)=>(Number(b.orders)||0)-(Number(a.orders)||0)||(Number(b.sessions)||0)-(Number(a.sessions)||0)||String(a.name).localeCompare(String(b.name)))"+
 channels.slice(sortedEnd);
html=html.slice(0,channelsStart)+channels+html.slice(channelsEnd);

const polishJs=fs.readFileSync("daily-meta-polish.js","utf8");
const css=fs.readFileSync("meta-daily-v6.css","utf8");
new vm.Script(polishJs,{filename:"daily-meta-polish.js"});
if(!html.includes("</style>")||!html.includes("</body>"))throw Error("V6: HTML insertion anchors missing");
html=html.replace("</style>",css+"\n</style>");
html=html.replace("</body>",'<script>\n'+polishJs+'\n</script>\n</body>');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
for(const [i,s] of scripts.entries())if(s[1].trim())new vm.Script(s[1],{filename:"ultramedix-v6-inline-"+i+".js"});
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("V6 inventory, first-click defaults, spend labels, and redesigned daily Meta table",scripts.length);
