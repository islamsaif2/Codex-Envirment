import fs from 'node:fs';
import vm from 'node:vm';
let worker=fs.readFileSync('worker.mjs','utf8');
const core=fs.readFileSync('price-analysis-core.js','utf8'),data=fs.readFileSync('price-analysis-data.js','utf8');
new vm.Script(core+'\n'+data);
worker=worker.replace('async function buildDashboard(',()=>core+'\n'+data+'\nasync function buildDashboard(');
const route="      if(path==='/api/inventory-monthly'";
if(!worker.includes(route))throw Error('Price Analysis: route anchor missing');
worker=worker.replace(route,()=>`      if(path==='/api/price-analysis'&&request.method==='GET'){
        const business=await getBusiness(env,url.searchParams.get('businessId')||'ultramedix');
        if(!business)throw Error('Business not found');
        return json(await readPriceAnalysis(env,business),200,cors);
      }
`+route);
const match=worker.match(/const APP_HTML_B64 = "([^"]+)"/);let html=Buffer.from(match[1],'base64').toString();
const replace=(before,after)=>{if(!html.includes(before))throw Error('Price Analysis HTML anchor missing: '+before.slice(0,80));html=html.replace(before,after);};
replace('<button id="nav-products">','<button id="nav-price-analysis">Price Change Analysis</button><button id="nav-products">');
replace(" page=p; const needsTabData=", " const priceNav=$('nav-price-analysis');if(priceNav)priceNav.classList.toggle('active',p==='Price Change Analysis');\n page=p; const needsTabData=");
replace(" if(p==='Creative Analysis')return;", " if(p==='Price Change Analysis'){ $('page-sub').textContent='Understand price changes through product conversion, orders and revenue.';renderPriceAnalysis();return;}\n if(p==='Creative Analysis')return;");
replace("return page!=='Businesses'&&page!=='Creative Analysis'", "return page!=='Price Change Analysis'&&page!=='Businesses'&&page!=='Creative Analysis'");
const ui=fs.readFileSync('price-analysis-ui.js','utf8');new vm.Script(core+'\n'+ui);
html=html.replace('</head>',()=>'<style id="price-analysis-styles">'+fs.readFileSync('price-analysis.css','utf8')+'</style></head>');
html=html.replace('</body>',()=>'<script>'+core+'\n'+ui+'</script></body>');
for(const [i,s]of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(s[1],{filename:'price-analysis-inline-'+i});
worker=worker.replace(match[0],()=> 'const APP_HTML_B64 = "'+Buffer.from(html).toString('base64')+'"');
fs.writeFileSync('worker.mjs',worker);console.log('Price Change Analysis installed: conversion-first, live prices, product orders and GA4 sessions.');
