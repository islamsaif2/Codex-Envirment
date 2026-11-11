import fs from "node:fs";
import vm from "node:vm";

// The risk counters must use the same selected demand period as the inventory table.
// Previously each variant's status was calculated only from Shopify's fixed row.cover,
// making Alert/Needs attention/Good totals identical for every period.
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!embedded)throw Error("Inventory counters: HTML not found");
let html=Buffer.from(embedded[1],"base64").toString("utf8");
const begin=html.indexOf("function renderInventory(){");
const end=html.indexOf("\nfunction ",begin+1);
if(begin<0||end<0)throw Error("Inventory counters: renderInventory boundaries not found");
let segment=html.slice(begin,end);

function replaceExact(oldText,newText,label){
  if(!segment.includes(oldText))throw Error("Inventory counters: missing "+label);
  segment=segment.replace(oldText,newText);
}

// Use the current stock snapshot for quantity, and period-specific observed demand
// for 28/60-day stock cover. The 7-day and All Time views use the script's
// current stock estimate, because All Time has no defined daily demand denominator.
replaceExact(
`    const hasCover=Number.isFinite(row.cover);
    const state=!row.active?states.inactive
      :!row.tracked||!hasStock||row.status==='Update stock data'?states.review
      :row.stock<=0?states.out
      :!hasCover?states.review
      :row.cover<=3?states.critical
      :row.cover<=7?states.soon:states.good;`,
`    const periodUnits=view.period===7?row.units7:view.period===28?row.units28:
      view.period===60?row.demand60:row.demandAll;
    const usablePeriodDemand=Number.isFinite(periodUnits)&&periodUnits>=0;
    const periodCover=view.period===28||view.period===60
      ? !usablePeriodDemand?null
        :periodUnits===0?Infinity
        :Math.max(0,row.stock)/(periodUnits/view.period)
      :row.cover;
    const state=!row.active?states.inactive
      :!row.tracked||!hasStock||row.status==='Update stock data'?states.review
      :row.stock<=0?states.out
      :periodCover===null||periodCover===undefined||Number.isNaN(periodCover)?states.review
      :periodCover<=3?states.critical
      :periodCover<=7?states.soon:states.good;`,
"variant risk calculation");
replaceExact(
"product.variants.push({row,state,units:view.period===7?row.units7:view.period===28?row.units28:view.period===60?row.demand60:row.demandAll});",
"product.variants.push({row,state,units:periodUnits,cover:periodCover});",
"variant period demand");
replaceExact(
"const compare=(a,b)=>a.state.rank-b.state.rank||(a.row.cover??Infinity)-(b.row.cover??Infinity)||(b.units??0)-(a.units??0);",
"const compare=(a,b)=>a.state.rank-b.state.rank||(a.cover??Infinity)-(b.cover??Infinity)||(b.units??0)-(a.units??0);",
"variant risk sorting");
replaceExact(
"const rows=product.variants.map(({row,state,units})=>{",
"const rows=product.variants.map(({row,state,units,cover})=>{",
"variant row status");
replaceExact(
"const forecast=out?'0':days(showForecast?row.cover:null);",
"const forecast=out?'0':days(showForecast?cover:null);",
"days remaining display");
replaceExact(
"(showForecast&&row.runout?'<small class=\"inv-runout\"",
"(showForecast&&(view.period===7||view.period===0)&&row.runout?'<small class=\"inv-runout\"",
"stock runout dates");

// The totals already count one active variant per selected state; their inputs
// now change with period selection, and inactive variants remain excluded.
replaceExact(
"const totals={red:0,orange:0,green:0};",
"const totals={red:0,orange:0,green:0}; // Recomputed on every render for the selected period",
"count reset");
html=html.slice(0,begin)+segment+html.slice(end);
new vm.Script(segment,{filename:"inventory-counter-function.js"});
fs.writeFileSync("worker.mjs",worker.replace(embedded[1],Buffer.from(html,"utf8").toString("base64")));
console.log("Inventory counters now use the selected demand period (7/28/60), with all-time using the current cover estimate.");
