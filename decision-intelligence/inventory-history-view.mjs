// Lightweight historical inventory report. This is a separate experimental page, not
// a replacement for the existing Inventory Tracking formulas or dashboard navigation.
export function inventoryHistoryPage(){
return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Historical Inventory | Ultramedix</title>
<style>
:root{color-scheme:light;font-family:Inter,Arial,sans-serif}body{margin:0;background:#f7faf9;color:#172b24}main{max-width:1220px;margin:32px auto;padding:0 24px}h1{font-size:26px;margin:0 0 10px}p{color:#53665f;line-height:1.5}.panel{background:white;border:1px solid #dbe7df;border-radius:14px;padding:20px;margin:20px 0}form{display:flex;flex-wrap:wrap;align-items:end;gap:12px}label{display:grid;gap:7px;font-size:13px;font-weight:600}input{border:1px solid #bccbc3;padding:10px;border-radius:7px;font-size:14px;min-width:150px}input[name=store]{min-width:240px}button{background:#136d48;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}.small{font-size:12px}.summary{font-weight:600}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th{text-align:left;background:#ecf4ef}th,td{padding:10px;border-bottom:1px solid #e1e9e4}.warning{border-left:4px solid #bc8415;padding:12px;background:#fff9ed}#chart{width:100%;height:140px;display:block}#status{white-space:pre-line}
</style></head><body><main><h1>Historical Inventory</h1><p>Review period-specific stock records by product and variant. Historical values are never replaced with today's stock.</p><section class="panel"><form id="query"><label>Store domain<input name="store" value="w510ww-g1.myshopify.com" required></label><label>From<input name="from" type="date" required></label><label>To<input name="to" type="date" required></label><label>Variant ID (optional)<input name="variantId"></label><button>Load history</button></form></section><div id="status" class="panel">Choose a date range and load the report.</div><div id="results" class="panel" hidden><h2>Historical stock records</h2><p id="coverage"></p><svg id="chart" viewBox="0 0 900 140" preserveAspectRatio="none" role="img" aria-label="Stock trend for first matching variant"></svg><div class="table"><table><thead><tr><th>Period</th><th>Variant</th><th>Stock at start</th><th>Stock at end</th><th>Units sold</th><th>Stockout days</th><th>Source</th><th>Quality</th></tr></thead><tbody id="rows"></tbody></table></div><p class="warning">Daily snapshots are observations at sync time, not proof of uninterrupted availability. Monthly and daily figures are not interchangeable, and stock adjustments alone cannot establish stock level.</p></div></main><script>
const form=document.getElementById('query'),status=document.getElementById('status'),panel=document.getElementById('results');
function e(tag,txt){const el=document.createElement(tag);el.textContent=txt==null?'—':String(txt);return el}
const now=new Date(),yesterday=new Date(now.getTime()-86400000),month=new Date(now.getTime()-30*86400000);
const d=x=>x.toISOString().slice(0,10);form.elements.from.value=d(month);form.elements.to.value=d(yesterday);
form.addEventListener('submit',async ev=>{
 ev.preventDefault();panel.hidden=true;status.textContent='Loading historical records…';
 const p=new URLSearchParams(new FormData(form));
 try{
 const r=await fetch('/api/inventory-history?'+p.toString());const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to load history');
 panel.hidden=false;status.textContent='Loaded '+data.rows.length+' records'+(data.truncated?' (display limited)':'');
 document.getElementById('coverage').textContent='Reported historical periods: '+data.sources.historicalPeriod+' · Daily observed snapshots: '+data.sources.dailyObserved+' · Stock adjustments: '+data.sources.adjustmentOnly;
 const body=document.getElementById('rows');body.replaceChildren();
 for(const x of data.rows) {
  const tr=document.createElement('tr');
  for(const v of [x.periodStart+' → '+x.periodEnd,x.product+' / '+x.variant,x.startingStock,x.endingStock,x.unitsSold,x.daysOutOfStock,x.source,x.quality])tr.appendChild(e('td',v));
  body.appendChild(tr);
 }
 const firstVariant=data.rows.find(x=>Number.isFinite(x.endingStock))?.variantId;\n const values=data.rows.filter(x=>x.variantId===firstVariant&&Number.isFinite(x.endingStock)).sort((a,b)=>a.periodStart.localeCompare(b.periodStart)).slice(0,90);
 const svg=document.getElementById('chart');svg.replaceChildren();
 if(values.length>1){
  const min=Math.min(...values.map(x=>x.endingStock)),max=Math.max(...values.map(x=>x.endingStock)),span=Math.max(max-min,1);
  const points=values.map((x,i)=>[(i/(values.length-1))*880+10,125-(x.endingStock-min)/span*105]);
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',points.map(p=>p.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#16794f');line.setAttribute('stroke-width','3');svg.appendChild(line);
 }
 }catch(err){status.textContent='History unavailable: '+err.message}
});
</script></body></html>`;
}
