import fs from "node:fs";
import vm from "node:vm";
// Date-filtered Google Visualization queries avoid importing ~90k Meta rows
// for a selected 7/28-day reporting period. No dashboard metrics are redefined.
let worker=fs.readFileSync("worker.mjs","utf8");
const anchor="async function buildDashboard(env, business, startDate, endDate, detailMode='') {";
if(!worker.includes(anchor))throw Error("Marketing query optimization: dashboard builder anchor missing");
const original="async function readPublicSheetOriginal(spreadsheetId,title,range,rawMode=false)";
if(!worker.includes(original))throw Error("Marketing query optimization: Google sheet reader anchor missing");
worker=worker.replace(original,"async function readPublicSheetOriginal(spreadsheetId,title,range,rawMode=false,queryText='')");
const urlAnchor="if(range)url.searchParams.set('range',range);let response;";
if(!worker.includes(urlAnchor))throw Error("Marketing query optimization: Google Visualization query URL anchor missing");
worker=worker.replace(urlAnchor,"if(range)url.searchParams.set('range',range);if(queryText)url.searchParams.set('tq',queryText);let response;");
const legacy='Promise.all([readPublicSheet(business.spreadsheetId,mr.sheet,"A2:Q"),readPublicSheet(business.spreadsheetId,mr.sheet,"AE2:AP")]).then(([meta,ga])=>Array.from({length:Math.max(meta.length,ga.length)},(_,i)=>{const row=Array(42).fill("");const m=meta[i]||[],g=ga[i]||[];for(let j=0;j<17;j++)row[j]=m[j]??"";const offset=g.length>=42?30:0;for(let j=0;j<12;j++)row[30+j]=g[offset+j]??"";return row;}))';
if(!worker.includes(legacy))throw Error("Marketing query optimization: obsolete full-sheet merge anchor missing");
const helper=`// Date-limited Meta and GA4 reporting, keeping the mapped physical column positions.
// Meta occupies A:Q; GA4 occupies AR:BC after the November sheet migration.
async function readPeriodMarketingData(spreadsheetId,sheet,startDate,endDate){
  const valid=s=>/^\\d{4}-\\d{2}-\\d{2}$/.test(String(s||""));
  const condition=column=>{
    const clauses=[];
    if(valid(startDate))clauses.push(column+" >= date '"+startDate+"'");
    if(valid(endDate))clauses.push(column+" <= date '"+endDate+"'");
    return clauses.length?"select * where "+clauses.join(" and "):"";
  };
  const read=(range,column)=>{
    const tq=condition(column);
    return tq?readPublicSheetOriginal(spreadsheetId,sheet,range,false,tq):
      readPublicSheet(spreadsheetId,sheet,range);
  };
  const [metaHeader,gaHeader,meta,ga]=await Promise.all([
    readPublicSheet(spreadsheetId,sheet,"A2:Q2"),
    readPublicSheet(spreadsheetId,sheet,"AR2:BC2"),
    read("A3:Q","A"),
    read("AR3:BC","AR")
  ]);
  const len=Math.max(meta.length,ga.length),result=new Array(len+1);
  const header=Array(55).fill("");
  for(let j=0;j<17;j++)header[j]=metaHeader[0]?.[j]??"";
  for(let j=0;j<12;j++)header[43+j]=gaHeader[0]?.[j]??"";
  result[0]=header;
  for(let i=0;i<len;i++){
    const row=Array(55).fill(""),m=meta[i]||[],g=ga[i]||[];
    for(let j=0;j<17;j++)row[j]=m[j]??"";
    for(let j=0;j<12;j++)row[43+j]=g[j]??"";
    result[i+1]=row;
  }
  console.log("[marketing-query]",JSON.stringify({metaRows:meta.length,gaRows:ga.length,from:startDate,to:endDate}));
  return result;
}
`;
worker=worker.replace(anchor,helper+anchor);
worker=worker.replace(legacy,'readPeriodMarketingData(business.spreadsheetId,mr.sheet,startDate,endDate)');
new vm.Script(worker.replace(/^export default \{/m,"const __workerDefault = {"),{filename:"optimized-worker.mjs"});
fs.writeFileSync("worker.mjs",worker);
console.log("Meta / GA4 daily data now filters in Google Sheets before transfer to Render.");
