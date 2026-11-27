import fs from 'node:fs/promises';
// Capture before the dashboard installs its stale-while-revalidate Sheet cache.
// A freshness check must never silently read that stale fallback.
const directFetch=globalThis.fetch.bind(globalThis);
export const HEALTH_SHEET='Data Up to Date Check';
const allowed=new Set(['DATE PRESENT','CURRENT','SYNC OBSERVED','COVERAGE OK','UNVERIFIED','REFERENCE','NO DATA','NO ELIGIBLE ROWS','BEHIND / NO ACTIVITY','INCOMPLETE','FUTURE DATE','CHECK DATA']);
const bad=new Set(['NO DATA','BEHIND / NO ACTIVITY','INCOMPLETE','FUTURE DATE','CHECK DATA','FORMULA ERROR']);
export function cairoToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function date(v){if(typeof v==='number'&&v>20000&&v<100000)return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);const m=String(v??'').match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+))?/);if(m)return m[1]+'-'+String(+m[2]+1).padStart(2,'0')+'-'+m[3].padStart(2,'0')+(m[4]?' '+m[4].padStart(2,'0')+':'+m[5].padStart(2,'0'):'');return /^\d{4}-\d{2}-\d{2}/.test(String(v??''))?String(v):null;}
export function parseHealth(table,{spreadsheetId,now=new Date(),readAt=now.toISOString()}={}){
 const rows=(table.rows??[]).map(r=>(r.c??[]).map(c=>c?.v??c?.f??null));
 if(rows[6]?.[0]!=='Dataset / check'||rows[6]?.[6]!=='Status')throw Error('Data checker layout is missing or outdated.');
 const today=cairoToday(now),referenceDate=date(rows[2]?.[1])?.slice(0,10)??null;
 const datasets=rows.slice(7).filter(r=>typeof r[0]==='string'&&r[0].trim()).map((r,i)=>{
  const hasFormulaError=r.some(v=>/^#(REF!|ERROR!|VALUE!|N\/A|DIV\/0!|NAME\?)/.test(String(v??''))),status=hasFormulaError||!allowed.has(r[6])?'FORMULA ERROR':r[6];
  return {id:'check-'+(i+8),row:i+8,name:r[0],expectedThrough:date(r[1])?.slice(0,10)??null,latestActivity:date(r[2])??r[2]??null,lastSyncEvidence:date(r[3])??r[3]??null,eligibleRows:r[4]??null,rowsWithData:r[5]??null,status,severity:bad.has(status)?'attention':status==='UNVERIFIED'||status==='NO ELIGIBLE ROWS'?'unknown':status==='REFERENCE'?'reference':status==='CURRENT'||status==='COVERAGE OK'?'good':'observed',sourceSheet:r[7]??'',explanation:r[8]??'',nextAction:r[9]??'',sheetUrl:`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=1938475521&range=A${i+8}:J${i+8}`};
 });
 if(!datasets.length)throw Error('The data checker returned no checks.');
 return {today,referenceDate,reportDateCurrent:referenceDate===today,readAt,execution:'read_only',sheetUrl:`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=1938475521`,datasets,summary:{total:datasets.length,needsAttention:datasets.filter(d=>d.severity==='attention').length,unverified:datasets.filter(d=>d.severity==='unknown').length,observed:datasets.filter(d=>d.severity==='observed').length,currentOrCovered:datasets.filter(d=>d.severity==='good').length},meaning:'Activity date, successful-sync evidence and field coverage are different signals. Today is partial. A blank today can mean no activity or a stalled import; no complete import is asserted without evidence.'};
}
export function createHealthReader({spreadsheetId,fetcher=directFetch,now=()=>new Date(),ttl=60000}={}){
 if(!/^[A-Za-z0-9_-]+$/.test(spreadsheetId??''))throw Error('Invalid checker spreadsheet ID');let saved=null,inflight=null;
 const decorate=(result,extra={})=>({...result,today:cairoToday(now()),reportDateCurrent:result.referenceDate===cairoToday(now()),servedAt:now().toISOString(),...extra});
 return async({refresh=false}={})=>{
  if(!refresh&&saved&&Date.parse(now())-Date.parse(saved.readAt)<ttl)return decorate(saved,{cache:'recent_read'});
  if(inflight)return inflight;
  inflight=(async()=>{try{const url=new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);for(const [k,v]of Object.entries({sheet:HEALTH_SHEET,range:'A1:J37',headers:'0',tqx:'out:json',tq:'select *'}))url.searchParams.set(k,v);
   const response=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Sheet read failed');if(response.headers.get('x-ultramedix-sheet-cache')?.startsWith('STALE'))throw Error('Stale Sheet response rejected');const raw=await response.text();let data;try{data=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{throw Error('Unreadable checker response');}if(data.status!=='ok'||!data.table)throw Error('Checker source unavailable');saved=parseHealth(data.table,{spreadsheetId,now:now()});return decorate(saved,{cache:'live_read',stale:false});
  }catch{if(saved)return decorate(saved,{cache:'last_read',stale:true,error:'The live Sheet could not be checked. These are the last observed results, not a fresh confirmation.'});throw Error('The live Sheet data checker could not be read. Check network access and the Data Up to Date Check tab.');}finally{inflight=null;}})();return inflight;
 };
}
export async function serveHealthAsset(path,res){const assets={'/data-health':['data-health.html','text/html'],'/data-health/':['data-health.html','text/html'],'/data-health.js':['data-health-ui.js','text/javascript'],'/data-health.css':['data-health.css','text/css']};const entry=assets[path];if(!entry)return false;res.writeHead(200,{'content-type':entry[1]+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'self'"});res.end(await fs.readFile(new URL('./'+entry[0],import.meta.url)));return true;}
