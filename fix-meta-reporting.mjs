import fs from "node:fs";
import vm from "node:vm";
const path="worker.mjs";
let src=fs.readFileSync(path,"utf8");
const previous=[
'  const [metaDetailExtra,shopifySessionRaw]=await Promise.all([',
'    detailMode==="ads"?readPublicSheet(business.spreadsheetId,"Raw Ga4 & Meta Ads Data","R3:W").catch(()=>[]):Promise.resolve([]),',
'    detailMode==="channels"?readPublicSheet(business.spreadsheetId,"Shopify Sessions Data","A2:M").catch(()=>[]):Promise.resolve([])',
'  ]);',
'  const metaDetailRaw=detailMode==="ads"?marketingRaw.slice(1).map((row,i)=>[...row.slice(0,17),...(metaDetailExtra[i]||Array(6).fill(""))]).filter(row=>String(row[0]||"").trim()):[];'
].join("\n");
const updated=[
'  // Meta platform and placement breakdowns overlap: select exactly one.',
'  // Placement rows match Meta Ads Manager spend; historical days with no placements fall back to platform rows.',
'  const [metaDetailExtra,shopifySessionRaw]=await Promise.all([',
'    readPublicSheet(business.spreadsheetId,"Raw Ga4 & Meta Ads Data","R3:W"),',
'    detailMode==="channels"?readPublicSheet(business.spreadsheetId,"Shopify Sessions Data","A2:M").catch(()=>[]):Promise.resolve([])',
'  ]);',
'  // R:W keeps row alignment because creative fields are populated even when W is blank.',
'  const placementByDataRow=metaDetailExtra.map(r=>String(r[5]||"").trim());',
'  const placementDays=new Set();',
'  marketingRaw.slice(1).forEach((row,i)=>{const day=dateCandidates(row[0])[0];if(day&&placementByDataRow[i])placementDays.add(day);});',
'  const isCanonicalMetaRow=(row,i)=>{const day=dateCandidates(row[0])[0];return !day||!placementDays.has(day)||Boolean(placementByDataRow[i]);};',
'  const metaDetailRaw=detailMode==="ads"?marketingRaw.slice(1).map((row,i)=>[...row.slice(0,17),...(metaDetailExtra[i]||Array(6).fill(""))]).filter((row,i)=>String(row[0]||"").trim()&&isCanonicalMetaRow(marketingRaw[i+1],i)):[];',
'  // Zero out only duplicate Meta cells. GA4 columns AE:AP must remain untouched.',
'  marketingRaw.slice(1).forEach((row,i)=>{if(!isCanonicalMetaRow(row,i))for(let col=0;col<17;col++)row[col]="";});'
].join("\n");
if(!src.includes(previous))throw Error("Could not locate original Meta aggregation");
src=src.replace(previous,updated);
const b64=src.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!b64)throw Error("Missing embedded HTML");
let html=Buffer.from(b64[1],"base64").toString("utf8");
const banner='<div class="banner"><span><i class="dot"></i>Meta Ads Funnel';
const oldLocation='\x24{dailyTable}\x24{renderMetaExplorer()}<section';
if(!html.includes(banner)||!html.includes(oldLocation))throw Error("Ads tab markup changed");
html=html.replace(oldLocation,'\x24{dailyTable}<section');
html=html.replace(banner,'\x24{renderMetaExplorer()}'+banner);
const oldCSS='#meta-explorer .mx-scroll {width:100%;overflow-x:auto;overflow-y:auto;max-height:680px;';
if(!html.includes(oldCSS))throw Error("Explorer scroll CSS not found");
html=html.replace(oldCSS,'#meta-explorer .mx-scroll {width:100%;overflow-x:auto;overflow-y:auto;max-height:465px;');
html=html.replace('#meta-explorer .mx-table tbody td {padding:11px 11px;', '#meta-explorer .mx-table tbody tr {height:54px}\n#meta-explorer .mx-table tbody td {padding:9px 11px;');
html=html.replace('#meta-explorer .mx-scroll{max-height:590px}', '#meta-explorer .mx-scroll{max-height:465px}');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,code] of scripts.entries())if(code.trim())new vm.Script(code,{filename:"ultramedix-inline-"+i+".js"});
src=src.replace(b64[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync(path,src);
console.log("Meta spend deduplicated by breakdown; Explorer first; seven visible rows.");
