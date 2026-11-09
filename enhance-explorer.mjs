import fs from "node:fs";
import vm from "node:vm";
const filename="worker.mjs";
let source=fs.readFileSync(filename,"utf8");
const marker="  const metaStatusById={campaign:Object.fromEntries(metaLastStatus.campaign),adset:Object.fromEntries(metaLastStatus.adset),ad:Object.fromEntries(metaLastStatus.ad)};";
if(!source.includes(marker))throw Error("Missing catalog insertion point");
const catalogCode=`
  // All-time Meta entity catalog: keep paused, archived and zero-spend entities
  // visible even when they have no performance rows within the selected dates.
  const metaCatalogIndex=new Map();
  for(const r of metaCatalogRaw){
    const day=dateCandidates(r[0])[0];if(!day)continue;
    const campaign=String(r[1]||""),campaignId=String(r[2]||"");
    const adset=String(r[3]||""),adsetId=String(r[4]||"");
    const ad=String(r[5]||""),adId=String(r[6]||"");
    const platform=String(r[15]||""),objective=String(r[16]||"");
    if(!campaign&&!adset&&!ad)continue;
    const key=[campaignId||campaign,adsetId||adset,adId||ad,platform].join("|");
    const old=metaCatalogIndex.get(key);
    if(!old||day>=old.date){
      metaCatalogIndex.set(key,{date:day,campaign,campaignId,adset,adsetId,ad,adId,platform,objective,
        thumbnail:String(r[17]||old?.thumbnail||""),creativeUrl:String(r[18]||old?.creativeUrl||"")});
    }
  }
  const metaExplorerCatalog=[...metaCatalogIndex.values()];
`;
source=source.replace(marker,catalogCode+"\n"+marker);
const responseMarker="    metaExplorerRows,\n    metaStatusById,";
if(!source.includes(responseMarker))throw Error("Missing catalog response field");
source=source.replace(responseMarker,"    metaExplorerRows,\n    metaExplorerCatalog,\n    metaStatusById,");
const b64=source.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!b64)throw Error("Embedded HTML missing");
let html=Buffer.from(b64[1],"base64").toString("utf8");
const start=html.indexOf("function renderMetaExplorer(){");
const end=html.indexOf("function explorerBind(){",start);
if(start<0||end<0)throw Error("Meta explorer boundaries missing");
const replace=fs.readFileSync("explorer-ui.txt","utf8").trimEnd();
html=html.slice(0,start)+replace+"\n"+html.slice(end);
const css=fs.readFileSync("explorer-styles.css","utf8");
if(!html.includes("</style>"))throw Error("CSS injection anchor missing");
html=html.replace("</style>",css+"\n</style>");
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [index,js] of scripts.entries())if(js.trim())new vm.Script(js,{filename:"ultramedix-inline-"+index+".js"});
console.log("Validated inline dashboard scripts:",scripts.length);
source=source.replace(b64[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync(filename,source);
console.log("Improved Meta Explorer UI installed, with historical inactive entities retained");
