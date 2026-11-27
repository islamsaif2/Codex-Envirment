import http from 'node:http';
import fs from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {status,liveForecast,loadState,rpc,recommendations,businessCenter} from './service.mjs';
import {compareScenarios,compileCampaignScenario} from './planning.mjs';
import {runDemo} from './demo.mjs';
import {diagnose} from './diagnostics.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {optimize,forecast} from './core.mjs';
import {decisionAuditReport} from './audit-report.mjs';
import {createChat} from './chat.mjs';
import {readSource} from './sources.mjs';
import {browserAssistantContext,browserAssistantPage} from './browser-assistant.mjs';
export function createServer({token=null,publicOrigin=null,enableApiChat=process.env.DI_ENABLE_API_CHAT==='1'}={}){
 const chat=createChat({readCenter:()=>businessCenter('ultramedix'),readSheetKey:async()=>{const result=await readSource('1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E','Automation Settings','AF10:AF10','select AF');return result.rows[0]?.[0]??null;}});
 let refresh={status:'idle'},refreshPromise=null;
 const refreshBusiness=()=>{if(refreshPromise)return refresh;refresh={status:'running',startedAt:new Date().toISOString()};refreshPromise=promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/collect-business.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),timeout:180000}).then(async()=>{const s=await loadState();refresh={status:'complete',finishedAt:new Date().toISOString(),sources:Object.fromEntries(Object.entries(s.snapshot.sources).map(([k,v])=>[k,v.status]))};}).catch(e=>{refresh={status:'failed',finishedAt:new Date().toISOString(),error:e.message};}).finally(()=>{refreshPromise=null;});return refresh;};
 if(token!==null&&(typeof token!=='string'||token.length<32))throw Error('An optional bearer token must contain at least 32 characters');
 if(publicOrigin&&!token)throw Error('A remote origin requires explicit authentication');
 const allowedHost=publicOrigin?new URL(publicOrigin).host:null;
 if(publicOrigin&&new URL(publicOrigin).protocol!=='https:')throw Error('Public origin must use HTTPS');
 const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 return http.createServer(async(req,res)=>{
  try{
   const host=req.headers.host??'';if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)&&host!==allowedHost)return json(res,403,{error:'Host not allowed'});
   if(req.headers.origin&&!['http://'+host,publicOrigin].includes(req.headers.origin))return json(res,403,{error:'Origin not allowed'});
   const url=new URL(req.url,'http://localhost'),path=url.pathname,businessId=url.searchParams.get('business')??'ultramedix';
   if(req.method==='GET'&&path==='/health')return json(res,200,{service:'Ultramedix Decision Intelligence',status:'online',execution:'disabled'});
   if(req.method==='GET'&&['/','/trial','/chat-settings'].includes(path)){const base=req.diBasePath??'',ancestors=base?"'self'":"'none'";res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors "+ancestors,'cache-control':'no-store'});let html=await fs.readFile(new URL(path==='/'?'../web/decisions.html':path==='/chat-settings'?'../web/chat-settings.html':'../web/trial.html',import.meta.url),'utf8');if(base)html=html.replace(/(src|href)="\/(?!\/)/g,(_,attr)=>attr+'="'+base+'/');return res.end(html);}
   if(req.method==='GET'&&['/app.js','/decisions.js','/decisions.css','/accordion.css','/center.js','/trial.js','/style.css','/chat.js','/chat.css','/chat-settings.js'].includes(path)){res.writeHead(200,{'content-type':path.endsWith('.js')?'text/javascript':'text/css','x-content-type-options':'nosniff'});return res.end(await fs.readFile(new URL('../web'+path,import.meta.url)));}
   if(token){const supplied=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')??''),expected=Buffer.from(token);
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return json(res,401,{error:'Authentication required'});}
   if(path==='/mcp'&&req.method!=='POST'){res.writeHead(405,{Allow:'POST'});return res.end();}
   if(req.method==='GET'){
    if(path==='/api/chat/status')return json(res,200,enableApiChat?{mode:'api',...await chat.status()}:{mode:'browser_account',apiEnabled:false,execution:'disabled'});
    if(path==='/api/chat/context')return json(res,200,browserAssistantContext(await businessCenter(businessId)));
    if(path==='/assistant-context'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; frame-ancestors 'self'",'x-content-type-options':'nosniff'});return res.end(browserAssistantPage(await businessCenter(businessId)));}
    if(path==='/api/center')return json(res,200,await businessCenter(businessId));
    if(path==='/validation-report'){const c=await businessCenter(businessId);res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'"});return res.end(decisionAuditReport(c));}
    if(path==='/api/refresh-status')return json(res,200,refresh);
    if(path==='/report'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await fs.readFile(new URL('../outputs/business-review.html',import.meta.url)));}
    if(path==='/api/demo')return json(res,200,await runDemo());
    if(path==='/api/diagnostics'){const s=await loadState(businessId);return json(res,200,diagnose(s.observations.daily,s.audit));}
    if(path==='/api/status')return json(res,200,await status(businessId));
    if(path==='/api/audit')return json(res,200,(await loadState(businessId)).audit);
    if(path==='/api/model')return json(res,200,(await loadState(businessId)).catalog);
    if(path==='/api/forecasts')return json(res,200,await liveForecast(businessId));
    if(path==='/api/recommendations')return json(res,200,await recommendations(businessId));
   }
   if(req.method!=='POST'||!['/api/chat','/api/chat/settings','/api/chat/disconnect','/api/refresh-business','/api/refresh-onboarding','/api/demo','/api/simulate','/api/compare','/api/compile-scenario','/api/forecast-preview','/mcp'].includes(path))return json(res,404,{error:'Route not found'});
   if(path.startsWith('/api/chat')&&(req.headers.origin!=='http://'+host||!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)))return json(res,403,{error:'Chat settings and requests require the same local origin'});
   if(path.startsWith('/api/chat')&&!enableApiChat)return json(res,409,{error:'API chat is disabled. Use ChatGPT beside the dashboard with your browser or the desktop built-in browser.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Expected application/json'});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)return json(res,413,{error:'Request too large'});chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(res,400,{error:'Invalid JSON'});}
   if(path==='/api/chat/settings')return json(res,200,await chat.configure(body));
   if(path==='/api/chat/disconnect')return json(res,200,await chat.remove());
   if(path==='/api/chat')return json(res,200,await chat.ask(body));
   if(path==='/mcp'){const result=await rpc(body);if(result===null){res.writeHead(202);return res.end();}return json(res,200,result);}
   if(path==='/api/simulate')return json(res,200,optimize(body));
   if(path==='/api/demo')return json(res,200,await runDemo(body));
   if(path==='/api/refresh-business')return json(res,202,refreshBusiness());
   if(path==='/api/refresh-onboarding'){const out=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/sync-onboarding.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),timeout:35000});return json(res,200,JSON.parse(out.stdout));}
   if(path==='/api/compare')return json(res,200,compareScenarios(body.scenarios));
   if(path==='/api/compile-scenario')return json(res,200,optimize(compileCampaignScenario(body)));
   if(path==='/api/forecast-preview')return json(res,200,{...forecast(body.series,body.options),label:'User-supplied data preview; no live business recommendation'});
  }catch(e){json(res,400,{error:e.message});}
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const token=process.env.DI_API_TOKEN||null,port=Number(process.env.DI_PORT||10040),origin=process.env.DI_PUBLIC_ORIGIN||null;
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('DI_PORT must be 1024..65535');
 const server=createServer({token,publicOrigin:origin});
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(port,'127.0.0.1',()=>{console.log(`Decision Center: http://127.0.0.1:${port}`);console.log(token?'Bearer authentication enabled.':'Local team access: no account or access key required.');console.log('Commercial execution is disabled. Existing dashboard settings are unchanged.');});
}
