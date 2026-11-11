import fs from "node:fs";
import vm from "node:vm";

let worker = fs.readFileSync("worker.mjs", "utf8");
function replace(source, from, to) {
  if (!source.includes(from)) throw new Error("Missing dashboard anchor: " + from.slice(0, 100));
  return source.replace(from, () => to);
}
const embedded = worker.match(/const APP_HTML_B64 = "([^"]+)"/);
let html = Buffer.from(embedded[1], "base64").toString("utf8");

worker = replace(worker, "  const idx={", `  const orderColumn = (column,key) => or.sheet === "Order Tracking Details"
    ? colNumber(column) - colNumber(or.value.match(/^[A-Z]+/i)[0])
    : mapCol(mapping,key,"orders.range",orderRaw);
  const idx={`);
worker = replace(worker, 'mapCol(mapping,"orders.orderStatus","orders.range",orderRaw)', 'orderColumn("AM","orders.orderStatus")');
worker = replace(worker, 'mapCol(mapping,"orders.cancellationReason","orders.range",orderRaw)', 'orderColumn("AN","orders.cancellationReason")');
worker = replace(worker,
  "if(!reason)continue;cancellationCounts.set(reason,(cancellationCounts.get(reason)||0)+1);",
  "if(!reason)continue;const key=norm(reason);const entry=cancellationCounts.get(key)||{reason,count:0};entry.count++;cancellationCounts.set(key,entry);");
worker = replace(worker, "[...cancellationCounts].map(([reason,count])=>({reason,count}))", "[...cancellationCounts.values()]");
worker = replace(worker, `    if(isCancelledOrder(row)||status==="cancelled"||status==="canceled")continue;
    const region=String(row[idx.region]??"").trim()||"Unspecified",key=norm(region);
    const counts=outcomeRegions.get(key)||{region,delivered:0,returned:0,open:0,missing:0,total:0};
    const outcome=status==="delivered"?"delivered":isReturnedStatus(status)?"returned":status?"open":"missing";`, `    const outcome = status === "delivered" ? "delivered" : isReturnedStatus(status) ? "returned" : null;
    if (!outcome) continue;
    const region=String(row[idx.region]??"").trim()||"Unspecified",key=norm(region);
    const counts=outcomeRegions.get(key)||{region,delivered:0,returned:0,total:0};`);

worker = worker.replace(/  const isOldStoreHistoricalRange[\s\S]*?(?=  const periodCustomers)/, "");
worker = worker.replaceAll("||isExcludedRetentionOrder(customerId,orderName)", "");
worker = replace(worker, "  const activeCustomers=", `  // Count orders separately from unique customers, using full purchase history and all statuses.
  const historyIdentity = row => String(row[idx.customerId] ?? "").trim();
  const firstOrder = new Map();
  for (const row of orderRows) {
    const id = historyIdentity(row);
    const day = dateCandidates(row[idx.date])[0];
    if (!id || !day) continue;
    const time = or.sheet === "Order Tracking Details" ? String(row[orderColumn("X","orders.date")] ?? "") : "";
    const orderNo = Number(String(row[idx.order] ?? "").replace(/^#/, ""));
    const rank = [day, /\\d{1,2}:\\d{2}/.test(time) ? time.match(/\\d{1,2}:\\d{2}(?::\\d{2})?/)[0].padStart(8,"0") : "", Number.isFinite(orderNo) ? orderNo : Infinity];
    const previous = firstOrder.get(id);
    if (!previous || rank[0] < previous.rank[0] ||
        (rank[0] === previous.rank[0] && (rank[1] < previous.rank[1] ||
         (rank[1] === previous.rank[1] && rank[2] < previous.rank[2])))) firstOrder.set(id,{row,rank});
  }
  const orderMix = {newOrders:0, returningOrders:0, unidentifiedOrders:0};
  const orderMixByDay = new Map();
  for (const row of orders) {
    const id = historyIdentity(row);
    const kind = !id || !firstOrder.has(id) ? "unidentifiedOrders" : firstOrder.get(id).row === row ? "newOrders" : "returningOrders";
    orderMix[kind]++;
    const day = dateCandidates(row[idx.date],startDate,endDate).find(date=>(!startDate||date>=startDate)&&(!endDate||date<=endDate));
    if (!day) continue;
    const counts = orderMixByDay.get(day) || {newOrders:0,returningOrders:0,unidentifiedOrders:0};
    counts[kind]++;
    orderMixByDay.set(day, counts);
  }
  const activeCustomers=`);
worker = replace(worker, "const retention={totalCustomers", "const retention={...orderMix,totalCustomers");

worker = replace(worker, "  const inventory=inventoryRange?", `  const productOrderHistory = new Map();
  const inventoryAsOf = new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const firstInventoryDay = shiftDay(inventoryAsOf,-59);
  if (inventoryRange) for (const row of orderRows) {
    const day = dateCandidates(row[idx.date])[0];
    if (!day || day > inventoryAsOf) continue;
    const sourceTitles = or.sheet === "Order Tracking Details"
      ? String(row[orderColumn("L","orders.date")] ?? "").split("\\n").map(line=>line.replace(/,\\s*EGP\\s*.*$/i,""))
      : [];
    const products = new Set([...sourceTitles,...productColumnPairs.map(([i])=>row[i])].map(productTitleKey).filter(Boolean));
    for (const key of products) {
      const count = productOrderHistory.get(key) || {all:0,last60:0};
      count.all++;
      if (day >= firstInventoryDay) count.last60++;
      productOrderHistory.set(key,count);
    }
  }
  const inventory=inventoryRange?`);
worker = replace(worker, "      return {product:String(r[1]??", "      const history = productOrderHistory.get(productTitleKey(r[1]));\n      return {orders60:history?.last60??0,ordersAll:history?.all??0,product:String(r[1]??");
worker = replace(worker, "  const detailDaily=[...drillDays.values()]", `  for (const date of new Set([...drillDays.keys(),...orderMixByDay.keys(),...allObjectiveSpendByDate.keys()])) {
    const row = drillDays.get(date) || {date,orders:0,totalSales:0,deliveredOrders:0,deliveredRevenue:0};
    Object.assign(row, orderMixByDay.get(date)||{newOrders:0,returningOrders:0,unidentifiedOrders:0});
    row.metaAllSpend = allObjectiveSpendByDate.get(date) ?? null;
    drillDays.set(date,row);
  }
  const detailDaily=[...drillDays.values()]`);
worker = replace(worker, "firstConversionRate:x.ordersAvailable", "fromSessionsSheet:true,firstConversionRate:x.ordersAvailable");
worker = worker.replace(/dashboard-cache:v\d+:/g, "dashboard-cache:v12:");

html = replace(html, "const outcomeSeries=[['delivered','Delivered','#0f9d78'],['returned','Returned','#c24b45'],['open','Open','#536ff0'],['missing','Missing status','#8993a5']];", "const outcomeSeries=[['delivered','Delivered','#0f9d78'],['returned','Returned','#c24b45']];");
html = replace(html, "Current Bosta outcomes for orders in the selected dates, grouped by shipping region. Canceled orders are excluded.", "Delivered and returned orders by shipping region, using Order Status from Order Tracking Details.");
html = replace(html, "Latest Shopify stock by product and size. Product status gives more weight to sizes that account for a larger share of units ordered in the selected period.", "Shopify stock by product and size. The card summarizes active sizes, and the dot beside each size shows its own stock risk.");
html = replace(html, "    product.variants.push({row,state,units:view.period===7?row.units7:row.units28});", "    product.variants.push({row,state,units:view.period===7?row.units7:view.period===28?row.units28:null});");
const inventoryStart = html.indexOf("    const demand={red:0,orange:0,green:0};");
const inventoryEnd = html.indexOf("  const number=n=>",inventoryStart);
if (inventoryStart < 0 || inventoryEnd < 0) throw new Error("Missing inventory status");
html = html.slice(0,inventoryStart)+`    const good = active.filter(v=>v.state===states.good).length;
    const red = active.filter(v=>v.state.tone==="red").length;
    product.tone = !active.length?"gray":red>active.length/2?"red":good>active.length/2?"green":"orange";
    if (view.period===60 || view.period===0) {
      const history = product.variants[0].row;
      product.unitsOrdered = view.period===60 ? history.orders60 : history.ordersAll;
    }
  }
  products.sort((a,b)=>b.unitsOrdered-a.unitsOrdered||a.name.localeCompare(b.name));
`+html.slice(inventoryEnd);
html = replace(html, "row.status==='Update stock data'||!hasCover?states.review", "!hasCover?states.review");
html = replace(html, "[7,28].map(n=>", "[7,28,60,0].map(n=>");
html = replace(html, "Best sellers last '+n+' days", "'+(n?'Last '+n+' days':'All time')+'");
html = replace(html, "Ranked by units ordered. Red means all active sizes are out of stock or at least 25% of orders came from sizes that are out of stock or have 3 days or less left. Orange means at least 10% of orders came from flagged sizes, or sizes are flagged and there are no orders to weigh. Each size keeps its own status.", "Green means most active sizes are well stocked. Red means most are out of stock or have 3 days or less left. Other mixes are orange. A size with over 3 and up to 7 days left gets an orange dot. Sorting changes the order of the cards.");
html = replace(html, "Orders<small class=\"inv-column-note\">(last '+view.period+' days)</small>", "'+(view.period===60||view.period===0?'Variant units unavailable':'Units ordered<small class=\"inv-column-note\">(last '+view.period+' days)</small>')+'");
html = replace(html, "+fmt(product.variants.length)+' variants</small>", "+fmt(product.variants.length)+' variants'+(view.period===60||view.period===0?' · '+fmt(product.unitsOrdered)+' matched orders':'')+'</small>");
html = replace(html, "+'</section><section class=\"cols\" style=\"margin-top:14px\"><div class=\"panel\"><h3>New vs returning customers", "+'</section><section class=\"panel\"><h3>Orders by customer type</h3><p class=\"hint\">Every order in the selected dates, including cancellations. A customer’s first order counts as new.</p><div class=\"grid\">'+card('New customer orders',fmt(ret.newOrders),'First orders in Shopify history')+card('Returning customer orders',fmt(ret.returningOrders),'Orders after the first order')+(ret.unidentifiedOrders?card('Orders without customer ID',fmt(ret.unidentifiedOrders),'Orders without enough customer history to classify'):'')+card('Total Orders',fmt(m.totalOrders),'All orders and statuses')+'</div></section><section class=\"cols\" style=\"margin-top:14px\"><div class=\"panel\"><h3>New vs returning customers");
html = replace(html, '"Meta Total Spend":["meta","spend"]', '"Meta Total Spend":["metric","metaAllSpend"]');
html = replace(html, "function sparkDaily(data,title){", `Object.assign(sparkSpecs,{
  "New customer orders":["metric","newOrders"], "Returning customer orders":["metric","returningOrders"],
  "Orders without customer ID":["metric","unidentifiedOrders"], "Meta Total Spend":["metric","metaAllSpend"],
  "Discounts":["metric","ultraOrderDiscount"], "Free Shipping Discounts":["metric","ultraShippingDiscount"],
  "Total Shipping Costs":["metric","ultraShippingCost"],
  "Revenue After Delivery Rate / Ad Costs / Discounts / Shipping Costs":["metric","ultraNetRevenue"],
  "Average CTR":["meta","ctr"], "Average CPM":["meta","cpm"]
});
function sparkDaily(data,title){`);
html = replace(html, "if(!r.hasTrend||!r.current.length)return '<div class=\"kpi-no-trend\">Daily trend unavailable</div>';", "if(!sparkSpecs[title])return '';\nif(!r.hasTrend||!r.current.length)return '<div class=\"kpi-no-trend\">No daily data for these dates</div>';");
html = replace(html, "if(!numbers.length)return '<div class=\"kpi-no-trend\">Daily trend unavailable</div>';", "if(!numbers.length)return '<div class=\"kpi-no-trend\">No daily data for these dates</div>';");
for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
fs.writeFileSync("worker.mjs",worker.replace(embedded[1],Buffer.from(html).toString("base64")));
