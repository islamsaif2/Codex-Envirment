import fs from 'node:fs';
import vm from 'node:vm';
const path='worker.mjs';
let worker=fs.readFileSync(path,'utf8');
const match=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!match)throw Error('Daily Performance V7: embedded HTML missing');
let html=Buffer.from(match[1],'base64').toString('utf8');
const register='const dayBusinessCardDefaults=';
if(!html.includes(register))throw Error('Daily Performance V7: monthly picker anchor missing');
html=html.replace(register,
  "Object.assign(dayBusinessCards, {metaFunnel:['Meta conversion funnel','meta'],ga4Funnel:['GA4 conversion funnel','ga4'],offersPerformance:['Offers performance','shopify'],paidOrganicMix:['Paid vs organic','shopify']});\n"+register);
// The same backend response already contains inventory; retain the Shopify snapshot
// for monthly Top 5 availability labels without misrepresenting historical availability.
const source='state.rows=data.dailyBusiness;state.highlights=data.dailyBusinessHighlights||{};';
if(!html.includes(source))throw Error('Daily Performance V7: data response anchor missing');
html=html.replace(source,
  'state.rows=data.dailyBusiness;state.highlights=data.dailyBusinessHighlights||{};state.inventorySnapshot=data.inventory?.variants||[];');
const css=fs.readFileSync('daily-performance-upgrade.css','utf8');
const js=fs.readFileSync('daily-performance-upgrade.js','utf8');
new vm.Script(js,{filename:'daily-performance-upgrade.js'});
html=html.replace('</head>','<style id="ultramedix-daily-performance-v7">'+css+'</style></head>');
html=html.replace('</body>','<script>\n'+js+'\n</script>\n</body>');
for(const [i,tag] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())
 if(tag[1].trim())new vm.Script(tag[1],{filename:'daily-v7-inline-'+i});
worker=worker.replace(match[1],Buffer.from(html,'utf8').toString('base64'));
fs.writeFileSync(path,worker);
console.log('Daily Performance V7: monthly funnel conversion, offer and channel cards, current stock availability installed');
