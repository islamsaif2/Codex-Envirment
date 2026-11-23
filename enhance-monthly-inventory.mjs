import fs from 'node:fs';
import vm from 'node:vm';
let source=fs.readFileSync('worker.mjs','utf8');
const productSource="products:top(m.products,'orders').map";
if(!source.includes(productSource))throw Error('Monthly product source anchor missing');
source=source.replace(productSource,"products:[...m.products.values()].sort((a,b)=>b.orders-a.orders||a.name.localeCompare(b.name)).map");
source=source.replace('dashboard-cache:v22:','dashboard-cache:v23:');
const engine=fs.readFileSync('monthly-inventory-engine.js','utf8');
new vm.Script(engine);
source=source.replace('async function buildDashboard(',()=>engine+'\nasync function buildDashboard(');
const anchor='      if(path===\'/api/creative-analysis\'';
const index=source.indexOf(anchor);
if(index<0)throw Error('Inventory metrics route anchor missing');
source=source.slice(0,index)+`      if(path==='/api/inventory-monthly'&&request.method==='GET'){
        const business=await getBusiness(env,url.searchParams.get('businessId')||'ultramedix');
        if(!business)throw Error('Business not found');
        return json(await readMonthlyInventory(env,business),200,cors);
      }
`+source.slice(index);
const m=source.match(/const APP_HTML_B64 = "([^"]+)"/);
let html=Buffer.from(m[1],'base64').toString();
html=html.replace('</head>',()=>'<style>'+fs.readFileSync('monthly-inventory.css','utf8')+'</style></head>');
html=html.replace('</body>',()=>'<script>'+fs.readFileSync('monthly-inventory-ui.js','utf8')+'</script></body>');
for(const [,script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script);
source=source.replace(m[0],()=> 'const APP_HTML_B64 = "'+Buffer.from(html).toString('base64')+'"');
fs.writeFileSync('worker.mjs',source);
console.log('Historical monthly inventory metrics installed');
