const monthlyInventoryState={business:'',loading:false,data:null,error:'',request:0};
const monthlyInventoryDescriptions={avgStock:'Mean of total recorded variant stock on complete historical days; requires at least 70% variant-day snapshot coverage. The tooltip lists the complete days used.',coverage:'Sum of min(stock, estimated demand) divided by sum of estimated demand, for supported variant-days.',availability:'Estimated demand from adequately stocked variants divided by total estimated demand.',lostUnits:'Sum of max(0, estimated demand minus stock) on supported dates. An estimate, without extrapolation across missing dates.',unitsSold:'Shopify units from item quantities and product lines. ≥ marks a known minimum when a multi-product order lacks per-line quantities.'};
const monthlyInventoryFields={
 avgStock:'AVG Daily Stock',coverage:'Inventory Coverage %',availability:'Demand-Weighted Availability %',lostUnits:'Estimated Lost Units',unitsSold:'Units Sold'
};
function monthlyInventoryNotes(){
 return '<div class="monthly-inventory-notes" title="'+esc(Object.values(monthlyInventoryDescriptions).join(' '))+'">'+
 '<span>AVG Daily Stock averages recorded daily variant stock; missing snapshots stay unknown.</span>'+
 '<span>Coverage = fulfilled estimated demand ÷ estimated demand; availability weights adequately stocked variants by demand.</span>'+
 '<span>Lost Units estimates stock-constrained demand; Units Sold uses Shopify quantities; ≥ means some mixed-order quantities cannot be allocated.</span>'+
 '<span>Demand uses 70% prior 28d + 30% preceding 90d, requiring 7/14 eligible days; otherwise recent or historical fallback.</span>'+
 '<span>Closing snapshots approximate daily availability. Missing history shows Insufficient Data; older fallback has lower confidence.</span></div>';
}
function loadMonthlyInventory(){
 if(monthlyInventoryState.business!==businessId){
  Object.assign(monthlyInventoryState,{business:businessId,data:null,error:'',loading:false});
  monthlyInventoryState.request++;
 }
 if(monthlyInventoryState.loading||monthlyInventoryState.data||monthlyInventoryState.error)return;
 monthlyInventoryState.loading=true;
 const serial=++monthlyInventoryState.request;
 api('/api/inventory-monthly?businessId='+encodeURIComponent(businessId)).then(data=>{
  if(serial===monthlyInventoryState.request)monthlyInventoryState.data=data;
 }).catch(error=>{if(serial===monthlyInventoryState.request)monthlyInventoryState.error=error.message;})
 .finally(()=>{
  if(serial!==monthlyInventoryState.request)return;
  monthlyInventoryState.loading=false;
  if(page===dayBusinessTitle)renderDayBusiness();
  else if(page==='Products & Page Analysis')renderProductAnalysis();
 });
}
function monthlyInventoryName(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function monthlyInventoryItem(name,month){
 return monthlyInventoryState.data?.products.find(row=>monthlyInventoryName(row.name)===monthlyInventoryName(name)&&row.month===month);
}
function monthlyInventoryDisplay(row,key){
 if(!row||!Number.isFinite(row[key]))return 'Insufficient Data';
 if(['coverage','availability'].includes(key))return pct(row[key]);
 return (key==='unitsSold'&&row.unitsSoldExact===false?'≥ ':'')+Number(row[key]).toLocaleString('en',{maximumFractionDigits:key==='unitsSold'?0:1});
}
function monthlyInventoryTooltip(row){
 if(!row)return monthlyInventoryState.error?'History source unavailable':'Historical metrics are loading or unavailable';
 return row.confidence+' · snapshots '+pct(row.snapshotCoverage)+' · demand evidence '+pct(row.modelCoverage)+' · '+row.completeDays+' complete stock days'+(row.unitsSoldExact===false?' · Units Sold is a known minimum; some mixed-product quantities cannot be allocated':'');
}
function monthlyInventoryProductCard(markup,month){
 const holder=document.createElement('div');holder.innerHTML=markup;
 const card=holder.querySelector('.db-v7-products');if(!card)return markup;
 card.querySelector('.db-v7-product-columns')?.remove();
 card.querySelector('.db-v7-inventory-caption')?.remove();
 card.querySelectorAll('.db-v7-stock-badge').forEach(x=>x.remove());
 for(const li of card.querySelectorAll('ol > li')){
  const title=li.querySelector('.db-rank-title strong');if(!title)continue;
  const row=monthlyInventoryItem(title.textContent,month);
  const metrics=document.createElement('div');metrics.className='monthly-inventory-grid';metrics.title=monthlyInventoryTooltip(row);
  for(const [key,label] of Object.entries(monthlyInventoryFields)){
   const cell=document.createElement('span'),small=document.createElement('small'),number=document.createElement('b');
   small.textContent=label;cell.title=monthlyInventoryDescriptions[key];number.textContent=monthlyInventoryDisplay(row,key);cell.append(small,number);metrics.append(cell);
  }
  li.append(metrics);
  const badge=document.createElement('small');badge.className='monthly-inventory-confidence';
  badge.textContent=row?row.confidence+(row.snapshotCoverage<.9?' · '+pct(row.snapshotCoverage)+' snapshots':''):monthlyInventoryState.error?'History unavailable':'Loading history…';
  badge.title=monthlyInventoryTooltip(row);li.append(badge);
 }
 card.insertAdjacentHTML('beforeend',monthlyInventoryNotes());
 return holder.innerHTML;
}
const previousMonthlyInventoryCards=dayBusinessMonthCards;
dayBusinessMonthCards=function(rows,data,keys,icon,month){
 const original=previousMonthlyInventoryCards(rows,data,keys,icon,month);
 return keys.includes('products')?monthlyInventoryProductCard(original,month):original;
};
const previousMonthlyInventoryRender=renderDayBusiness;
renderDayBusiness=function(...args){loadMonthlyInventory();return previousMonthlyInventoryRender.apply(this,args);};
Object.assign(weeklyProductFields,monthlyInventoryFields);
const previousMonthlyInventoryValue=weeklyProductValue;
weeklyProductValue=function(item,key){
 if(!Object.hasOwn(monthlyInventoryFields,key))return previousMonthlyInventoryValue(item,key);
 const row=item?.inventoryHistory;
 const confidence=key==='avgStock'&&row&&row.confidence!=='Reliable'?'<small class="monthly-inventory-confidence">'+esc(row.confidence)+'</small>':'';
 return '<span title="'+esc(monthlyInventoryDescriptions[key]+' '+monthlyInventoryTooltip(row))+'">'+monthlyInventoryDisplay(row,key)+confidence+'</span>';
};
const previousMonthlyProductsRender=renderProductAnalysis;
renderProductAnalysis=function(...args){
 loadMonthlyInventory();
 const monthly=weeklyProductPeriod==='month',savedColumns=weeklyProductColumns;
 const originals=dashboard?.monthlyProducts;
 if(monthly&&dashboard){
  weeklyProductColumns=[...new Set([...weeklyProductColumns,...Object.keys(monthlyInventoryFields)])];
  dashboard.monthlyProducts=(originals||[]).map(row=>({...row,inventoryHistory:monthlyInventoryItem(row.name,row.week.slice(0,7))}));
 }
 try{
  const value=previousMonthlyProductsRender.apply(this,args);
  const panel=$('weekly-products');
  if(monthly&&panel){
   panel.querySelector('h3').textContent='Monthly Product Analysis';
   panel.insertAdjacentHTML('beforeend',monthlyInventoryNotes());
  }
  return value;
 }finally{
  weeklyProductColumns=savedColumns;
  if(dashboard&&originals)dashboard.monthlyProducts=originals;
 }
};




