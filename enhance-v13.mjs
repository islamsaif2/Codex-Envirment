import fs from "node:fs";
import vm from "node:vm";
let worker=fs.readFileSync("worker.mjs","utf8");
const embedded=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
let html=Buffer.from(embedded[1],"base64").toString("utf8");
function change(source,old,next){
  if(!source.includes(old))throw Error("Missing reporting anchor: "+old.slice(0,120));
  return source.replace(old,()=>next);
}
function section(source,start,end,code){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0)throw Error("Missing reporting section: "+start);
  return source.slice(0,a)+code+source.slice(b);
}
worker=change(worker,'  // Reuse Meta A:Q',`  const mappedReport = key => mapping.has(key)
    ? readPublicSheet(business.spreadsheetId,mapRange(mapping,key).sheet,mapRange(mapping,key).value).catch(()=>[])
    : Promise.resolve([]);
  const [metaSnapshotRows,productLineRows]=await Promise.all([
    mappedReport("marketing.snapshotIndex"),mappedReport("products.lines")
  ]);
  // Reuse Meta A:Q`);
worker=section(worker,'  const placementDays=new Set();','  const metaDetailRaw=',`  const snapshotByDay=new Map();
  let previousDay="";
  for(let i=0;i<marketingRaw.length-1;i++){
    const day=dateCandidates(marketingRaw[i+1][0])[0]||"";
    if(day&&day!==previousDay)snapshotByDay.set(day,{start:i,lastPlacement:-1});
    if(day&&placementByDataRow[i])snapshotByDay.get(day).lastPlacement=i;
    previousDay=day;
  }
  // Formula index positions start at 1 for raw row 3. Match them against the
  // loaded raw export so a recalculation/cache lag never selects an old snapshot.
  for(const row of metaSnapshotRows){
    const day=dateCandidates(row[0])[0];
    const observed=snapshotByDay.get(day);
    const start=Number(row[1])-1,lastPlacement=Number(row[2])-1;
    if(observed?.start===start&&observed.lastPlacement===lastPlacement){
      snapshotByDay.set(day,{start,lastPlacement});
    }
  }
  const isCanonicalMetaRow=(row,i)=>{
    const snapshot=snapshotByDay.get(dateCandidates(row[0])[0]);
    return !!snapshot&&i>=snapshot.start&&
      (snapshot.lastPlacement<snapshot.start||Boolean(placementByDataRow[i]));
  };
`);
worker=change(worker,'    const productTotals = new Map();',`  const sheetProductLines=new Map();
  for(const row of productLineRows){
    const date=dateCandidates(row[0])[0],id=String(row[1]??"").trim(),name=String(row[2]??"").trim();
    if(!date||!id||!name)continue;
    const key=date+"|"+id,lines=sheetProductLines.get(key)||[];
    lines.push([name,money(row[3])]);
    sheetProductLines.set(key,lines);
  }
  const getProductLines=row=>{
    const key=(dateCandidates(row[idx.date])[0]||"")+"|"+String(row[idx.order]??"").trim();
    if(sheetProductLines.has(key))return sheetProductLines.get(key);
    const lines=String(row[idx.products]??"").split(/\\r?\\n/).map(line=>{
      const match=line.trim().match(/^(.+?),\\s*(?:(?:EGP|E£|LE|\\$)\\s*)?([\\d,]+(?:\\.\\d+)?)\\s*$/i);
      return match?[match[1].trim(),money(match[2])]:null;
    }).filter(Boolean);
    if(lines.length)return lines;
    return productColumnPairs.map(([i,j])=>[String(row[i]??"").trim(),row[j]]).filter(([name,price])=>name&&String(price??"").trim());
  };
  const productTotals = new Map();`);
worker=section(worker,'    const mappedProducts=productColumnPairs.map(([i,priceIx])','    for(const [title,priceCell]',`    const productLines=getProductLines(r);
`);
worker=section(worker,'    const mappedProducts=productColumnPairs.map(([titleIx,priceIx])','      const key=productTitleKey(name)',`    const seen=new Set();
    for(const [name] of getProductLines(row)){
`);
worker=change(worker,'weeklyProductData(orderRows,idx,productColumnPairs)','weeklyProductData(orderRows,idx,getProductLines)');
worker=section(worker,'function weeklyProductData(', 'async function buildDashboard',`function weeklyProductData(rows,idx,productLines){
  const weeks=new Map();
  for(const row of rows){
    const day=dateCandidates(row[idx.date])[0];
    if(!day)continue;
    const d=new Date(day+"T12:00:00Z");
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    const week=d.toISOString().slice(0,10);
    const order=String(row[idx.order]??"");
    for(const [name,price] of productLines(row)){
      const key=productTitleKey(name)+"|"+week;
      const entry=weeks.get(key)||{name,week,orders:new Set(),revenue:0};
      if(order)entry.orders.add(order);
      entry.revenue+=money(price);
      weeks.set(key,entry);
    }
  }
  return [...weeks.values()].map(x=>({...x,orders:x.orders.size}));
}
`);
worker=section(worker,'  const productOrderHistory = new Map();','  const inventory=inventoryRange?',`  const productOrderHistory=new Map();
  const inventoryAsOf=dateCandidates(inventoryRaw[8]?.[23])[0]||
    new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const inventoryStarts=[7,28,60].map(days=>shiftDay(inventoryAsOf,1-days));
  if(inventoryRange)for(const row of orderRows){
    const day=dateCandidates(row[idx.date])[0],order=String(row[idx.order]??"").trim();
    if(!day||!order||day>inventoryAsOf)continue;
    const keys=new Set(getProductLines(row).map(([name])=>productTitleKey(name)).filter(Boolean));
    for(const key of keys){
      const counts=productOrderHistory.get(key)||[new Set(),new Set(),new Set(),new Set()];
      inventoryStarts.forEach((start,i)=>{if(day>=start)counts[i].add(order);});
      counts[3].add(order);
      productOrderHistory.set(key,counts);
    }
  }
`);
worker=change(worker,'orders60:history?.last60??0,ordersAll:history?.all??0,','orders7:history?.[0].size??0,orders28:history?.[1].size??0,orders60:history?.[2].size??0,ordersAll:history?.[3].size??0,');
worker=change(worker,'    available:inventoryRaw.length>0,','    available:inventoryRaw.length>0,orderHistoryThrough:inventoryAsOf,');
worker=change(worker,'const periodMeta=mappedMetaMetrics(periodMetaCounts,salesSpend);','const periodMeta=mappedMetaMetrics(periodMetaCounts,spend);');
worker=change(worker,'mappedMetaMetrics(metaByDate.get(date)||emptyMetaCounts(),r.spend)','mappedMetaMetrics(metaByDate.get(date)||emptyMetaCounts(),allObjectiveSpendByDate.get(date)||0)');
worker=change(worker,'costPerAttributedOrder:attributedOrders.length?salesSpend/attributedOrders.length:0, actualCostPerDeliveredAttributedOrder:attributedDeliveredOrders.length?salesSpend/attributedDeliveredOrders.length:0','costPerAttributedOrder:attributedOrders.length?spend/attributedOrders.length:0, actualCostPerDeliveredAttributedOrder:attributedDeliveredOrders.length?spend/attributedDeliveredOrders.length:0');
worker=change(worker,'calc("revenueAfterDeliveryAndAdCosts",metricValues,','calc("revenueAfterDeliveryAndAdCosts",{...metricValues,advertisingSpend:spend},');
worker=change(worker,'const optional=i=>String(r[i]??"").trim()===""?null:money(r[i]);',`const optional=i=>{
        const value=String(r[i]??"").trim().replace(/,/g,"");
        return value!==""&&Number.isFinite(Number(value))?Number(value):null;
      };`);
worker=worker.replace(/dashboard-cache:v\d+:/g,"dashboard-cache:v15:");
html=change(html,`    if (view.period===60 || view.period===0) {
      const history = product.variants[0].row;
      product.unitsOrdered = view.period===60 ? history.orders60 : history.ordersAll;
    }`,`    const history = product.variants[0].row;
    product.unitsOrdered = view.period===0 ? history.ordersAll : history["orders"+view.period];`);
html=change(html,`+(view.period===60||view.period===0?' · '+fmt(product.unitsOrdered)+' matched orders':'')`,`+' · '+fmt(product.unitsOrdered)+' unique product orders'`);
html=change(html,`    const good = active.filter(v=>v.state===states.good).length;
    const red = active.filter(v=>v.state.tone==="red").length;
    product.tone = !active.length?"gray":red>active.length/2?"red":good>active.length/2?"green":"orange";`,`    const demandOf = variant => variant.row.units28;
    const knownDemand = active.every(v=>Number.isFinite(demandOf(v))&&demandOf(v)>=0);
    const totalDemand = knownDemand ? active.reduce((sum,v)=>sum+demandOf(v),0) : 0;
    const flagged = active.filter(v=>v.state.tone==="red"||v.state.tone==="orange");
    const allOut = active.length>0 && active.every(v=>v.state===states.out);
    const redDemand = totalDemand ? flagged.reduce((sum,v)=>sum+(v.state.tone==="red"?demandOf(v):0),0) : 0;
    const flaggedDemand = totalDemand ? flagged.reduce((sum,v)=>sum+demandOf(v),0) : 0;
    const highestDemand = totalDemand ? Math.max(...active.map(demandOf)) : 0;
    const topSizeFlagged = highestDemand>0 && flagged.some(v=>demandOf(v)===highestDemand);
    if (!active.length) product.tone="gray";
    else if (allOut || (totalDemand>0 && redDemand*2>=totalDemand)) product.tone="red";
    else if (topSizeFlagged || (totalDemand>0 && flaggedDemand*5>=totalDemand) ||
      (!totalDemand && flagged.length>0)) product.tone="orange";
    else product.tone="green";`);
html=change(html,'Shopify stock by product and size. The card summarizes active sizes, and the dot beside each size shows its own stock risk.','Shopify stock by product and size. The card color reflects recent demand for at-risk sizes. The dot beside each size shows its own stock risk.');
html=change(html,'Green means most active sizes are well stocked. Red means most are out of stock or have 3 days or less left. Other mixes are orange. A size with over 3 and up to 7 days left gets an orange dot. Sorting changes the order of the cards.',`Cards rank by unique product orders through '+esc(data.orderHistoryThrough||'the stock snapshot')+'. Variant rows show Shopify units. <strong>Size dots:</strong> Red = out of stock or 3 days or less left. Orange = over 3 and up to 7 days left, or stock data needs review. Green = more than 7 days left or stocked with no recorded demand.</p><p class="hint"><strong>Product card colors use units ordered in the last 28 days for active sizes.</strong> Red means all active sizes are out of stock or red sizes account for at least 50% of those units. Otherwise, orange means a best-selling size is flagged, red and orange sizes together account for at least 20% of units, or a size is flagged and there is no reliable demand history. Green means neither alert applies. Inactive sizes are excluded, and changing the sort does not change these colors.`);
for(const [i,script] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(script[1],{filename:"reporting-ui-"+i});
fs.writeFileSync("worker.mjs",worker.replace(embedded[1],Buffer.from(html).toString("base64")));
