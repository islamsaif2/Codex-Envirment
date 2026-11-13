import fs from "node:fs";
import vm from "node:vm";
// Never abort dashboard/API requests at an arbitrary browser-side deadline.
// The backend enforces upstream health checks and returns cached last-good data.
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw new Error("Analytics request timeout: dashboard HTML missing");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const old="signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json'";
const next="signal:opts.signal,headers:{'Content-Type':'application/json'";
if(!html.includes(old))throw new Error("Analytics request timeout: expected fetch anchor missing");
html=html.replace(old,next);
// Real reports can exceed Render's proxy time limit. The server responds 202
// and calculates the report in the background. Poll the SAME URL until ready.
// No client-side timeout or arbitrary maximum number of polls is imposed.
const loopOld="for(let attempt=0;attempt<2;attempt++){";
if(!html.includes(loopOld))throw Error("API request retry-loop anchor missing");
html=html.replace(loopOld,"for(let attempt=0;;attempt++){");
const pollAnchor='    if(attempt===0&&method==="GET"&&[502,503,504].includes(r.status))';
if(!html.includes(pollAnchor))throw Error("API response-loop anchor missing");
html=html.replace(pollAnchor,`    if(r.status===202&&method==="GET"&&/^\\/api\\/(dashboard|creative-analysis)(?:\\?|$)/.test(path)){
      try{await r.text();}catch(_){}
      const seconds=Number(r.headers.get("Retry-After")||2);
      await new Promise(resolve=>setTimeout(resolve,Math.max(1000,Math.min(5000,seconds*1000))));
      continue;
    }
`+pollAnchor);

// A report can finish after the user has moved to another tab. Keep the
// shared data, but only render it into a tab that uses dashboard data.
function patchPage(anchor, replacement) {
  if (!html.includes(anchor)) throw Error("Dashboard navigation anchor missing: " + anchor);
  html = html.replace(anchor, replacement);
}
patchPage(" if(needsTabData){loadDashboard();return;}", ` if(p==='Creative Analysis')return;
 if(!dashboard&&p!=='Businesses'){
   $('content').innerHTML='<div class="loading" role="status">Loading '+esc(p)+'…</div>';
   if(!dashboardLoading&&businesses.length)loadDashboard();
   return;
 }
 if(needsTabData){loadDashboard();return;}`);
patchPage("async function loadDashboard(){", `let dashboardLoadId=0,dashboardLoading=false;
function usesDashboardData(){return page!=='Businesses'&&page!=='Creative Analysis';}
async function loadDashboard(){
 const loadId=++dashboardLoadId;
 dashboardLoading=true;`);
patchPage("visibleVariantCount=5;err('');$('content').innerHTML='<div class=\"loading\">Loading live business data...</div>';", `visibleVariantCount=5;err('');
 if(usesDashboardData())$('content').innerHTML='<div class="loading" role="status">Loading '+esc(page)+'…</div>';`);
patchPage("previousDashboard=null;dashboard=await api(currentPath);", `const loaded=await api(currentPath);
 if(loadId!==dashboardLoadId)return;
 previousDashboard=null;
 dashboard=loaded;`);
const dashboardStart=html.indexOf("async function loadDashboard(){");
const dashboardEnd=html.indexOf("function trendMetricCard",dashboardStart);
const dashboardSource=html.slice(dashboardStart,dashboardEnd);
const renderStart=" if(page==='Overview')renderDashboard();";
const renderError=" }catch(e){err(e.message);$('content').innerHTML='<div class=\"loading\">Dashboard data could not be loaded.</div>';}";
if(!dashboardSource.includes(renderStart)||!dashboardSource.includes(renderError))throw Error("Dashboard render anchors missing");
html=html.slice(0,dashboardStart)+dashboardSource
  .replace(renderStart,` if(!usesDashboardData())return;
 if((page==='Ads'&&dashboard.detailMode!=='ads')||(page==='Channels'&&dashboard.detailMode!=='channels')){
   const details=page==='Ads'?'ads':'channels';
   if(!currentPath.endsWith('&details='+details))return loadDashboard();
 }
`+renderStart)
  .replace(renderError,` }catch(e){
  if(loadId===dashboardLoadId&&usesDashboardData()){
    err(e.message);
    $('content').innerHTML='<div class="loading">Dashboard data could not be loaded. <button class="btn" id="dashboard-retry">Retry</button></div>';
    $('dashboard-retry').onclick=()=>loadDashboard();
  }
 }finally{
  if(loadId===dashboardLoadId)dashboardLoading=false;
 }`)+html.slice(dashboardEnd);

for(const [index,m] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()){
  if(m[1].trim())new vm.Script(m[1],{filename:"analytics-timeout-inline-"+index+".js"});
}
worker=worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64"));
fs.writeFileSync("worker.mjs",worker);
console.log("Analytics requests use unbounded client polling for async Render reports; no browser timeout.");
