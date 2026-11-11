import fs from 'node:fs';
const file='worker.mjs';
let worker=fs.readFileSync(file,'utf8');
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error('Missing dashboard HTML');
const html=Buffer.from(embedded[1],'base64').toString('utf8');
if(!html.includes('</head>'))throw Error('Missing dashboard head');
const css=fs.readFileSync('compact-layout.css','utf8');
const updated=html.replace('</head>','<style id="ultra-compact-layout">'+css+'</style></head>');
fs.writeFileSync(file,worker.replace(embedded[1],Buffer.from(updated).toString('base64')));
console.log('Compact dashboard layout installed; metric behavior preserved.');

