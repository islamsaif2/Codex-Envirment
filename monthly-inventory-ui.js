const monthlyInventoryState={business:'',loading:false,data:null,error:'',request:0};
const monthlyInventoryDescriptions={
 avgStock:'The average total stock across all sizes on days with complete records. For example, 10 units one day and 30 the next gives an average of 20. Missing records are excluded.',
 availability:'The share of expected demand coming from sizes with enough stock. Popular sizes count more: plenty of XL stock will not make up for a sold-out M if most customers buy M.',
 lostUnits:'An estimate of how many units stock could not cover. If expected demand was 10 and only 2 units were available, the estimate is 8. It does not confirm that 8 customers tried to buy.',
 unitsSold:'Units identified from Shopify orders. ≥93 means at least 93 units are confirmed, but some orders contain several products without specifying the quantity of each.',
 coverage:'The share of estimated demand that stock could cover.'
};
const monthlyInventoryFields={
 avgStock:'AVG Daily Stock',availability:'Demand-Weighted Availability %',lostUnits:'Estimated Lost Units',unitsSold:'Units Sold'
};
function monthlyInventoryNotes(){
 const notes=[
  'AVG Daily Stock: Your average daily stock across all sizes. For example, 10 units one day and 30 the next gives 20. Only days with complete stock records are included.',
  'Availability: Did you have enough stock in the sizes customers wanted? Popular sizes count more, so lots of XL stock cannot make up for a sold-out M if most customers buy M.',
  'Lost Units: Estimated demand that stock could not cover. If demand was 10 units and stock was 2, the estimate is 8. These are estimated missed units, not confirmed lost sales.',
  'Units Sold: Units identified in Shopify orders. ≥93 means at least 93 are confirmed; some orders contain several products without saying how many of each were bought.',
  'Demand estimate: We use sales from days with enough stock: 70% from the previous 28 days and 30% from the 90 days before those. We need 7 usable recent days and 14 older days. If recent weeks were sold out, we use usable older history. Daily stock records cannot show every stockout during the day. Missing records stay unknown; older estimates have lower confidence.'
 ];
 return '<div class="monthly-inventory-notes">'+notes.map(text=>'<span title="'+esc(text)+'">'+esc(text)+'</span>').join('')+'</div>';
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
 if(!row||!Number.isFinite(row.snapshotCoverage))return monthlyInventoryState.error?'History source unavailable':'Historical metrics are loading or unavailable';
 return row.confidence+' · snapshots '+pct(row.snapshotCoverage)+' · demand evidence '+pct(row.modelCoverage)+' · '+row.completeDays+' complete stock days'+(row.unitsSoldExact===false?' · Units Sold is a known minimum; some mixed-product quantities cannot be allocated':'');
}
const monthlyProductSort=new Map();
const monthlyProductScroll=new Map();
const monthlyProductColumns=[
 ['name','Product'],['stockHealth','Stock Health'],
 ['avgStock','AVG Stock'],['availability','Demand-Weighted Availability'],['lostUnits','Lost Units'],['unitsSold','Units Sold']
];
function monthlyProductRows(data,month){
 const rows=new Map();
 for(const product of data.products||[])rows.set(monthlyInventoryName(product.name),{...product,cr:product.sessions>0?product.orders/product.sessions:null});
 for(const history of monthlyInventoryState.data?.products||[]){
  if(history.month!==month)continue;
  const key=monthlyInventoryName(history.name);
  const existing=rows.get(key)||{name:history.name,orders:0,sessions:null,cr:null,thumbnail:(dayBusiness.inventorySnapshot||[]).find(v=>monthlyInventoryName(v.product)===key)?.imageUrl||''};
  rows.set(key,{...existing,...history});
 }
 return [...rows.values()];
}
function monthlyInventoryProductCard(markup,month,data){
 const holder=document.createElement('div');holder.innerHTML=markup;
 const card=holder.querySelector('.db-v7-products');if(!card)return markup;
 const products=monthlyProductRows(data,month),sort=monthlyProductSort.get(month)||{key:'stockHealth',asc:false};
 products.sort((a,b)=>{
  const x=a[sort.key==='stockHealth'?'availability':sort.key],y=b[sort.key==='stockHealth'?'availability':sort.key];
  if(sort.key==='name')return (sort.asc?1:-1)*a.name.localeCompare(b.name);
  if(!Number.isFinite(x))return Number.isFinite(y)?1:a.name.localeCompare(b.name);
  if(!Number.isFinite(y))return -1;
  return (sort.asc?x-y:y-x)||a.name.localeCompare(b.name);
 });
 const heading=card.querySelector('h4');
 heading.innerHTML=(heading.querySelector('svg')?.outerHTML||'')+' Product Analysis <small>'+products.length+' products</small>';
 card.replaceChildren(heading);
 const headers=monthlyProductColumns.map(([key,label])=>{
  const active=sort.key===key,order=active?(sort.asc?'ascending':'descending'):'none';
  const extras=key==='name'?'<span class="monthly-product-subsort">'+[['sessions','Sessions'],['cr','CR']].map(([field,text])=>'<button type="button" data-monthly-product-sort="'+field+'" data-product-month="'+month+'">'+text+(sort.key===field?(sort.asc?' ↑':' ↓'):' ↕')+'</button>').join(' · ')+'</span>':'';
  return '<th scope="col" aria-sort="'+order+'"><button type="button" data-monthly-product-sort="'+key+'" data-product-month="'+month+'" title="'+esc(key==='stockHealth'?'Stock Health uses Demand-Weighted Availability: the share of expected demand belonging to sizes with enough stock.':monthlyInventoryDescriptions[key]||label)+'">'+label+(active?(sort.asc?' ↑':' ↓') :' ↕')+'</button>'+extras+'</th>';
 }).join('');
 const value=(row,key)=>{
  if(key==='stockHealth')return Number.isFinite(row.availability)?pct(row.availability):'Insufficient Data';
  if(Object.hasOwn(monthlyInventoryFields,key))return monthlyInventoryDisplay(row,key);
  if(key==='cr')return Number.isFinite(row.cr)?pct(row.cr):'—';
  return Number.isFinite(row[key])?fmt(row[key]):'—';
 };
 const body=products.map(row=>{
  const image=/^https:\/\//i.test(row.thumbnail||'')?'<img src="'+esc(row.thumbnail)+'" alt="" loading="lazy" onerror="this.hidden=true">':'';
  return '<tr>'+monthlyProductColumns.map(([key])=>key==='name'?'<th scope="row"><span class="monthly-product-name">'+image+'<span title="'+esc(monthlyInventoryTooltip(row))+'">'+esc(row.name)+'<small>'+value(row,'sessions')+' sessions · '+value(row,'cr')+' CR</small></span></span></th>':
    '<td title="'+esc(monthlyInventoryTooltip(row))+'">'+value(row,key)+'</td>').join('')+'</tr>';
 }).join('');
 card.insertAdjacentHTML('beforeend','<div class="monthly-product-scroll" data-product-scroll="'+month+'" tabindex="0" aria-label="All products for '+month+'"><table><thead><tr>'+headers+'</tr></thead><tbody>'+body+'</tbody></table></div>'+monthlyInventoryNotes());
 return holder.innerHTML;
}
function bindMonthlyProductTables(){
 const root=$('content');if(!root)return;
 for(const area of root.querySelectorAll('[data-product-scroll]')){
  area.scrollTop=monthlyProductScroll.get(area.dataset.productScroll)||0;
  area.onscroll=()=>monthlyProductScroll.set(area.dataset.productScroll,area.scrollTop);
 }
 root.querySelectorAll('[data-monthly-product-sort]').forEach(button=>button.onclick=()=>{
  const month=button.dataset.productMonth,key=button.dataset.monthlyProductSort;
  const previous=monthlyProductSort.get(month)||{key:'stockHealth',asc:false};
  monthlyProductSort.set(month,{key,asc:previous.key===key?!previous.asc:key==='name'});
  monthlyProductScroll.set(month,0);
  const strip=root.querySelector('.db-months'),x=strip?.scrollLeft||0,y=window.scrollY;
  renderDayBusiness();
  const updated=root.querySelector('.db-months');if(updated)updated.scrollLeft=x;
  window.scrollTo(0,y);
  root.querySelector('[data-product-month="'+month+'"][data-monthly-product-sort="'+key+'"]')?.focus({preventScroll:true});
 });
}
const previousMonthlyInventoryCards=dayBusinessMonthCards;
dayBusinessMonthCards=function(rows,data,keys,icon,month){
 const original=previousMonthlyInventoryCards(rows,data,keys,icon,month);
 return keys.includes('products')?monthlyInventoryProductCard(original,month,data):original;
};
const previousMonthlyInventoryRender=renderDayBusiness;
renderDayBusiness=function(...args){loadMonthlyInventory();const result=previousMonthlyInventoryRender.apply(this,args);bindMonthlyProductTables();return result;};
dayBusinessCards.products=['Product Analysis','shopify'];
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







