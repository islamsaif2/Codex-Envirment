import fs from 'node:fs';import vm from 'node:vm';
let worker=fs.readFileSync(new URL('./worker.mjs',import.meta.url),'utf8');const match=worker.match(/const APP_HTML_B64 = "([^"]+)"/);if(!match)throw Error('Dashboard HTML missing');let html=Buffer.from(match[1],'base64').toString();
if(!html.includes('nav-data-health')){
 const replace=(before,after)=>{if(!html.includes(before))throw Error('Data Health anchor missing: '+before);html=html.replace(before,after);};
 replace('<button id="nav-businesses">Businesses</button>','<button id="nav-businesses">Businesses</button><button id="nav-data-health">Data Health</button>');
 replace(' page=p; const needsTabData='," $('nav-data-health')?.classList.toggle('active',p==='Data Health');\n page=p; const needsTabData=");
 replace(" if(p==='Decision Intelligence'){",` if(p==='Data Health'){
  $('page-sub').textContent='Dataset freshness, sync evidence and coverage in Africa/Cairo.';
  $('content').innerHTML='<iframe title="Ultramedix Data Health" src="/data-health" style="display:block;width:100%;height:calc(100vh - 165px);min-height:700px;border:0;border-radius:12px;background:#f5f7fa"></iframe>';
  return;
 }
 if(p==='Decision Intelligence'){
`);
 replace("return page!=='Decision Intelligence'", "return page!=='Data Health'&&page!=='Decision Intelligence'");
 replace("if(page==='Decision Intelligence'||page===dayBusinessTitle)","if(page==='Data Health'||page==='Decision Intelligence'||page===dayBusinessTitle)");
 html=html.replace('</body>',`<script>
 $('nav-data-health').onclick=()=>{location.hash='data-health';setPage('Data Health');};
 if(location.hash==='#data-health')setPage('Data Health');
 </script></body>`);
 for(const [i,s]of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(s[1],{filename:'data-health-inline-'+i});
 worker=worker.replace(match[0],()=> 'const APP_HTML_B64 = "'+Buffer.from(html).toString('base64')+'"');fs.writeFileSync(new URL('./worker.mjs',import.meta.url),worker);
}
console.log('Data Health checker installed with shared Sheet formulas and read-only live checks.');
