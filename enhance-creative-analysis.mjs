import fs from 'node:fs';
import vm from 'node:vm';
let worker=fs.readFileSync('worker.mjs','utf8');
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
let html=Buffer.from(embedded[1],'base64').toString('utf8');
const js=fs.readFileSync('creative-analysis.js','utf8');new vm.Script(js);
const css=fs.readFileSync('creative-analysis.css','utf8');
html=html.replace('</head>','<style>'+css+'</style></head>').replace('</body>','<script>'+js+'</script></body>');
html=html.replace('<h2>Performance snapshot</h2>','<h2>Business overview</h2>');
worker=worker.replace(embedded[1],Buffer.from(html).toString('base64'));
const anchor='      if (path === "/api/dashboard" && request.method === "GET") {';
if(!worker.includes(anchor))throw Error('Missing dashboard route');
worker=worker.replace(anchor,`      if(path==='/api/creative-analysis'&&request.method==='GET'){
        const business=await getBusiness(env,url.searchParams.get('businessId')||'ultramedix');
        if(!business)throw Error('Business not found');
        return json(await buildCreativeReport(business,url.searchParams.get('start')||'',url.searchParams.get('end')||''),200,cors);
      }
`+anchor);
worker+='\n'+fs.readFileSync('creative-report.js','utf8');
fs.writeFileSync('worker.mjs',worker);
console.log('Creative Analysis tab and mapped report installed.');

