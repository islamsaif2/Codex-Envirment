// Read-only, optional context configuration from two tabs in the Ultramedix workbook.
// Data incidents are source-specific: a GA4 gap must NOT suppress Shopify alerts.
const cache=new Map(), TTL=120000;
async function sheetRows(spreadsheetId,sheet,limit=200){
  const key=spreadsheetId+"|"+sheet, now=Date.now(),hit=cache.get(key);
  if(hit&&hit.expires>now)return hit.rows;
  const url=new URL("https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/gviz/tq");
  url.searchParams.set("tqx","out:json");
  url.searchParams.set("sheet",sheet);
  url.searchParams.set("range","A1:G"+limit);
  url.searchParams.set("headers","0");
  const res=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error(sheet+" returned HTTP "+res.status);
  const body=await res.text(),a=body.indexOf("{"),b=body.lastIndexOf("}");
  if(a<0||b<a)throw Error("Invalid Google Sheet response: "+sheet);
  const parsed=JSON.parse(body.slice(a,b+1));
  if(parsed.status!=="ok"||!Array.isArray(parsed.table?.rows))throw Error("Unable to read "+sheet);
  const rows=parsed.table.rows.map(row=>(row.c||[]).slice(0,7).map(c=>c?.v??c?.f??""));
  cache.set(key,{rows,expires:now+TTL});return rows;
}
function isoDate(v){
  const s=String(v??"").trim();
  const m=s.match(/^Date\((\d+),(\d+),(\d+)\)/);
  if(m)return m[1]+"-"+String(Number(m[2])+1).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
  return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+"T12:00:00Z"))?s:"";
}
export function parseSetup(rows){
  const config={};
  for(const row of rows.slice(1)){
    const key=String(row[0]||"").trim(),value=String(row[2]??"").trim();
    if(/^[a-z][a-z0-9_]*$/.test(key)&&value)config[key]=value;
  }
  // Only settings with a meaningful operational interpretation are surfaced.
  const policy=["Exclude from baseline","Flag only"].includes(config.data_repair_policy)
    ?config.data_repair_policy:"Exclude from baseline";
  return {businessId:/^[a-z0-9-]+$/.test(config.business_id||"")?config.business_id:null,
    primaryGoal:["Profit","Revenue","Growth","Efficiency","Balanced"].includes(config.primary_goal)?config.primary_goal:"Balanced",
    currency:config.currency||"EGP",timeZone:config.business_timezone||"Africa/Cairo",
    historicalInventory:config.historical_inventory||"Not sure",
    dataRepairPolicy:policy,knownTrackingGaps:config.known_tracking_gaps||"Not sure",
    attributionModel:config.attribution_model||"linear"};
}
export function parseIncidents(rows){
  return rows.slice(1).filter(r=>String(r[0]||"").trim()).map(r=>({
    source:String(r[0]).trim(),start:isoDate(r[1]),end:isoDate(r[2]),
    type:String(r[3]||"Other").trim(),status:String(r[4]||"Investigate").trim(),
    note:String(r[5]||"").slice(0,500),handling:String(r[6]||"Flag only").trim()
  }));
}
export function evaluateDataQuality(incidents,{asOf,source="Shopify Attribution",policy="Exclude from baseline"}={}){
  const normalize=x=>String(x).trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const matching=incidents.filter(i=>normalize(i.source)===normalize(source));
  const unspecified=matching.filter(i=>!i.start||!i.end);
  const confirmed=matching.filter(i=>i.status==="Confirmed"&&i.start&&i.end&&i.start<=asOf&&i.end>=asOf);
  const exclusions=confirmed.filter(i=>i.handling==="Exclude from baseline"&&policy==="Exclude from baseline");
  return {source,asOf,status:exclusions.length?"blocked":confirmed.length?"flagged":unspecified.length?"incomplete-incident-info":"no-reported-incident",
    mayAnalyze:!exclusions.length,activeIncidents:confirmed,undatedOrOpenIncidents:unspecified,
    caution:"No-reported-incident does not prove complete data. Events need dated evidence and source-level validation."};
}
export function excludeIncidentDates(rows,incidents,{source="Shopify Attribution",policy="Exclude from baseline"}={}){
 if(policy!=="Exclude from baseline")return {rows,excludedDates:[]};
 const normalize=x=>String(x).trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
 const ranges=incidents.filter(i=>normalize(i.source)===normalize(source)&&i.status==="Confirmed"
   &&i.handling==="Exclude from baseline"&&i.start&&i.end&&i.start<=i.end);
 const excluded=new Set();
 const clean=rows.filter(r=>{
   const hit=ranges.some(i=>r.day>=i.start&&r.day<=i.end);
   if(hit)excluded.add(r.day);
   return !hit;
 });
 return {rows:clean,excludedDates:[...excluded].sort()};
}
export async function readDecisionContext(spreadsheetId){
  const [setup,incidents]=await Promise.allSettled([
    sheetRows(spreadsheetId,"Decision Intelligence Setup",100),
    sheetRows(spreadsheetId,"Data Quality Incidents",200)]);
  return {
    setup:setup.status==="fulfilled"?parseSetup(setup.value):null,
    incidents:incidents.status==="fulfilled"?parseIncidents(incidents.value):null,
    availability:{setup:setup.status==="fulfilled",incidents:incidents.status==="fulfilled"},
    warnings:[...(setup.status==="rejected"?["Setup Sheet unavailable; context not applied"]:[]),
      ...(incidents.status==="rejected"?["Incident Sheet unavailable; data integrity not verified"]:[])]
  };
}
