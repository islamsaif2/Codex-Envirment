import fs from 'node:fs';
import vm from 'node:vm';
const path='worker.mjs';
let worker=fs.readFileSync(path,'utf8');
const found=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!found)throw Error('Diagnostic V3: embedded HTML unavailable');
let html=Buffer.from(found[1],'base64').toString('utf8');
if(!html.includes('function renderDiagnosticTree()')||!html.includes('function diagnosticPrices()'))throw Error('Diagnostic V3: expected source functions are missing');
const css=fs.readFileSync('diagnostic-map-v3.css','utf8');
const js=fs.readFileSync('diagnostic-map-v3.js','utf8');
new vm.Script(js,{filename:'diagnostic-map-v3.js'});
html=html.replace('</head>','<style id="ultra-diagnostic-v3">'+css+'</style></head>');
html=html.replace('</body>','<script>\n'+js+'\n</script>\n</body>');
for(const [i,tag] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()){
  if(tag[1].trim())new vm.Script(tag[1],{filename:'diagnostic-v3-inline-'+i});
}
worker=worker.replace(found[1],Buffer.from(html,'utf8').toString('base64'));
fs.writeFileSync(path,worker);
console.log('Diagnostic V3: original poster layout installed without fixed-position map renderer');
