import fs from 'node:fs';import vm from 'node:vm';
let worker=fs.readFileSync(new URL('./worker.mjs',import.meta.url),'utf8');const match=worker.match(/const APP_HTML_B64 = "([^"]+)"/);if(!match)throw Error('Dashboard HTML missing');let html=Buffer.from(match[1],'base64').toString();
if(!html.includes('nav-decision-intelligence')){
 const replace=(before,after)=>{if(!html.includes(before))throw Error('Decision Intelligence anchor missing: '+before);html=html.replace(before,after);};
 const navAnchor='<button id="nav-products">';
 replace(navAnchor,'<button id="nav-decision-intelligence">Decision Intelligence</button>'+navAnchor);
 replace(' page=p; const needsTabData='," $('nav-decision-intelligence')?.classList.toggle('active',p==='Decision Intelligence');\n page=p; const needsTabData=");
 replace(" if(p==='Creative Analysis')return;",` if(p==='Decision Intelligence'){
  $('page-sub').textContent='Real source evidence, forecasts and decision reviews across the available business data.';
  $('content').innerHTML='<iframe title="Ultramedix Decision Intelligence" src="/decision-intelligence/" style="display:block;width:100%;height:calc(100vh - 165px);min-height:700px;border:0;border-radius:12px;background:#f4f6f8"></iframe>';
  return;
 }
 if(p==='Creative Analysis')return;
`);
 replace("return page!=='Businesses'&&page!=='Creative Analysis'", "return page!=='Decision Intelligence'&&page!=='Businesses'&&page!=='Creative Analysis'");
 replace("if(page===dayBusinessTitle)setPage(page);else await loadDashboard()", "if(page==='Decision Intelligence'||page===dayBusinessTitle)setPage(page);else await loadDashboard()");
 html=html.replace('</body>',`<script>
 $('nav-decision-intelligence').onclick=()=>{location.hash='decision-intelligence';setPage('Decision Intelligence');};
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.data?.type!=='ultramedix-open-analysis')return;const allowed=['Inventory','Shipping and operation Analysis','GA4 Data','Ads'];if(allowed.includes(event.data.page))setPage(event.data.page);});
 if(location.hash==='#decision-intelligence')setPage('Decision Intelligence');
 </script></body>`);
 for(const [i,s]of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(s[1],{filename:'dashboard-inline-'+i});
 worker=worker.replace(match[0],()=> 'const APP_HTML_B64 = "'+Buffer.from(html).toString('base64')+'"');
 fs.writeFileSync(new URL('./worker.mjs',import.meta.url),worker);
}
console.log('Decision Intelligence tab installed without altering existing calculations.');
