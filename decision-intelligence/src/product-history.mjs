import {addDays} from './core.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export const productKey=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const stockNumber=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
export function normalizeInventoryHistory(rows,headers){
 const variants=new Map();
 for(const r of rows){if(!r[2]||!r[3])continue;const key=productKey(r[2])+'|'+productKey(r[3]);let v=variants.get(key);if(!v){v={product:r[2],variant:r[3],stores:new Set(),days:new Map()};variants.set(key,v);}v.stores.add(r[0]);
  for(let i=5;i<headers.length;i++){const date=String(headers[i]??''),quantity=stockNumber(r[i]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||quantity===null)continue;const old=v.days.get(date);if(old===undefined)v.days.set(date,quantity);else if(old!==quantity)v.days.set(date,null);}
 }
 return {rows:[...variants.values()].map(v=>({product:v.product,variant:v.variant,multipleStores:v.stores.size>1,observations:[...v.days].sort(([a],[b])=>a.localeCompare(b)).map(([date,quantity])=>({date,quantity:v.stores.size>1?null:quantity}))})),provenance:'Source closing-stock history; reconstruction and intraday availability not certified. Conflicting duplicate size records remain unknown.'};
}
export function productHistory(snapshot,{today}){
 const daily=snapshot.sources?.orders?.data?.daily??[],products=snapshot.sources?.orders?.data?.products??[],inventory=snapshot.sources?.inventory?.data?.rows??[],history=snapshot.sources?.inventoryHistory?.data?.rows??[];
 const through=daily.map(r=>r.date).filter(d=>d<today).sort().at(-1);if(!through)return {status:'insufficient_history',products:[]};
 const from=addDays(through,-59),stockFrom=addDays(through,-179),recentFrom=addDays(through,-29),priorThrough=addDays(recentFrom,-1),recent7From=addDays(through,-6);
 const dailyByDate=new Map(daily.map(r=>[r.date,r]));
 const selected=daily.filter(r=>r.date>=from&&r.date<=through),complete=new Set(selected.map(r=>r.date)).size===60&&selected.every(r=>finite(r.orders));
 const allBefore=complete?selected.filter(r=>r.date<recentFrom).reduce((s,r)=>s+r.orders,0):null,allRecent=complete?selected.filter(r=>r.date>=recentFrom).reduce((s,r)=>s+r.orders,0):null;
 const groups=new Map();for(const r of products){if(r.date<stockFrom||r.date>through)continue;const key=productKey(r.product);if(!groups.has(key))groups.set(key,{product:r.product,rows:[]});groups.get(key).rows.push(r);}
 const results=[...groups.values()].map(({product,rows})=>{
  const count=(a,b)=>complete&&rows.every(r=>finite(r.ordersContainingProduct))?rows.filter(r=>r.date>=a&&r.date<=b).reduce((s,r)=>s+r.ordersContainingProduct,0):null;
  const prior=count(from,priorThrough),recent=count(recentFrom,through),last7=count(recent7From,through),priorShare=allBefore>0?prior/allBefore:null,recentShare=allRecent>0?recent/allRecent:null;
  const expected=finite(priorShare)&&finite(allRecent)?priorShare*allRecent:null,mixGap=finite(expected)&&finite(recent)?Math.max(0,expected-recent):null;
  const sizes=inventory.filter(r=>productKey(r.product)===productKey(product)),hs=history.filter(r=>productKey(r.product)===productKey(product)),knownDates=[],stockedDates=[];let allZeroDays=0,partialStockDays=0;
  const productByDate=new Map();for(const r of rows)productByDate.set(r.date,(productByDate.get(r.date)??0)+r.ordersContainingProduct);
  const stockMaps=sizes.map(s=>new Map((hs.find(h=>productKey(h.variant)===productKey(s.variant))?.observations??[]).map(o=>[o.date,o.quantity])));
  for(let date=stockFrom;date<=through;date=addDays(date,1)){const quantities=stockMaps.map(m=>m.get(date)??null);if(!quantities.length||quantities.some(q=>!finite(q)))continue;knownDates.push(date);if(quantities.every(q=>q===0))allZeroDays++;else if(quantities.some(q=>q===0))partialStockDays++;else if(quantities.every(q=>q>0)&&finite(dailyByDate.get(date)?.orders))stockedDates.push(date);}
  const stockedProductOrders=stockedDates.reduce((n,date)=>n+(productByDate.get(date)??0),0),stockedAllOrders=stockedDates.reduce((n,date)=>n+dailyByDate.get(date).orders,0);
  const historyOrders=daily.filter(r=>r.date>=stockFrom&&r.date<=through),complete180=new Set(historyOrders.map(r=>r.date)).size===180&&historyOrders.every(r=>finite(r.orders)),historicalProductOrders=complete180?rows.reduce((n,r)=>n+r.ordersContainingProduct,0):null,historicalAllOrders=complete180?historyOrders.reduce((n,r)=>n+r.orders,0):null;
  const stockedBaseline=stockedDates.length>=14&&stockedProductOrders>=10&&stockedAllOrders>0,benchmarkShare=stockedBaseline?stockedProductOrders/stockedAllOrders:historicalAllOrders>0?historicalProductOrders/historicalAllOrders:priorShare,benchmarkMethod=stockedBaseline?'180-day positive-closing-stock observations':historicalAllOrders>0?'180-day observed order share; availability not controlled':'earlier 30-day share; insufficient 180-day coverage';
  const recoveryShortfall=finite(benchmarkShare)&&finite(allRecent)&&finite(recent)?Math.max(0,benchmarkShare*allRecent-recent):null,siteDrop=finite(allBefore)&&finite(allRecent)?allBefore-allRecent:null,productDrop=finite(prior)&&finite(recent)?prior-recent:null;
  return {product,from,priorThrough,recentFrom,through,stockFrom,stockHistoryDays:180,prior30OrdersContainingProduct:prior,recent30OrdersContainingProduct:recent,last7OrdersContainingProduct:last7,prior30AllOrders:allBefore,recent30AllOrders:allRecent,priorOrderShare:priorShare,recentOrderShare:recentShare,rawOrderDecline:productDrop,observedSiteOrderDecline:siteDrop,observedDropShare:siteDrop>0&&finite(productDrop)?Math.max(0,productDrop)/siteDrop:null,dropShareDefinition:'Descriptive share of the decline in orders containing this product, not a causal contribution. Multi-product orders overlap; percentages are not additive.',expectedRecentOrdersAtPriorShare:expected,productMixShortfall:mixGap,historicalProductOrders,historicalAllOrders,benchmarkShare,benchmarkMethod,stockedBaselineDays:stockedDates.length,stockedBaselineProductOrders:stockedProductOrders,stockedBaselineAllOrders:stockedAllOrders,recoveryShortfall,sevenDayShareRecoveryScenario:finite(recoveryShortfall)?recoveryShortfall*7/30:null,stockHistoryKnownDays:knownDates.length,stockHistoryAllSizesZeroDays:allZeroDays,stockHistoryPartialSizesZeroDays:partialStockDays,stockHistoryThrough:knownDates.at(-1)??null,causalClaim:false};
 });
 return {status:complete?'180_day_stock_with_30_day_period_comparison':'180_day_stock_incomplete_order_comparison',from,stockFrom,stockHistoryDays:180,through,coverageDays:new Set(selected.map(r=>r.date)).size,products:results,definition:'180-day stock context and order-share benchmarks; recent decline uses matching 30-day periods. Product occurrences and descriptive decline shares overlap and are not causal or additive.'};
}
