import fs from "node:fs";
import vm from "node:vm";

let worker = fs.readFileSync("worker.mjs", "utf8");
const embedded = worker.match(/const APP_HTML_B64 = "([^"]+)"/);
let html = Buffer.from(embedded[1], "base64").toString("utf8");

function edit(source, from, to) {
  if (!source.includes(from)) throw new Error("Missing dashboard anchor: " + from.slice(0, 100));
  return source.replace(from, () => to);
}
function section(source, start, end, code) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error("Missing dashboard section: " + start);
  return source.slice(0, a) + code + source.slice(b);
}

worker = 'import { canonicalMetaRows } from "./meta-snapshots.mjs";\n' + worker;
worker = section(worker, "  const placementDays=new Set();", "  const metaDetailRaw=",
  '  const canonicalMeta = canonicalMetaRows(marketingRaw.slice(1), placementByDataRow, value => dateCandidates(value)[0]);\n' +
  '  const isCanonicalMetaRow = (_row, index) => canonicalMeta.has(index);\n');
worker = edit(worker, 'readPublicSheet(business.spreadsheetId,"Cards Order","A1:D1000")',
  'readPublicSheet(business.spreadsheetId,"Website Layout","A1:L1000").catch(()=>readPublicSheet(business.spreadsheetId,"Cards Order","A1:L1000"))');
worker = edit(worker, "    inventory,\n", "    inventory,\n    websiteLayout: shippingOrderRaw,\n");
worker = edit(worker, '"dashboard-cache:v3:"', '"dashboard-cache:v4:"');

worker = section(worker, "  const isOldStoreHistoricalRange", "  const periodCustomers",
  '  const retentionIdentity = (row, order) => String(row[idx.customerId] ?? "").trim() || "guest:" + order;\n');
worker = worker.replaceAll(
  '    const customerId=String(r[idx.customerId]??"").trim();\n    const orderName=String(r[idx.order]??"").trim();\n    if(!customerId||!orderName||isExcludedRetentionOrder(customerId,orderName))continue;',
  '    const orderName=String(r[idx.order]??"").trim();\n    if(!orderName)continue;\n    const customerId=retentionIdentity(r,orderName);');
if (worker.includes("isExcludedRetentionOrder")) throw new Error("Unexpected retention exclusion");
worker = edit(worker, "  const activeCustomers=", [
  '  const firstOrderByCustomer = new Map();',
  '  for (const [id, history] of allHistoryOrders) {',
  '    const first = [...history].reduce((earliest, entry) => !earliest || entry[1] < earliest[1] ? entry : earliest, null);',
  '    if (first) firstOrderByCustomer.set(id, first[0]);',
  '  }',
  '  const orderMix = {newOrders: 0, returningOrders: 0, unidentifiedOrders: 0};',
  '  for (const row of orders) {',
  '    const order = String(row[idx.order] ?? "").trim();',
  '    const id = String(row[idx.customerId] ?? "").trim();',
  '    if (!id || !order) orderMix.unidentifiedOrders++;',
  '    else if (firstOrderByCustomer.get(id) === order) orderMix.newOrders++;',
  '    else orderMix.returningOrders++;',
  '  }',
  '  const activeCustomers=',
].join("\n"));
worker = edit(worker, "const retention={totalCustomers", "const retention={...orderMix,totalCustomers");

worker = edit(worker, "    if(!day||day<productMomentumStart||day>productMomentumEnd)continue;\n    const mappedProducts",
  "    if(!day)continue;\n    const mappedProducts");
worker = edit(worker, "      p.total++;p.counts.set(day,(p.counts.get(day)||0)+1);",
  "      p.total++;if(day>=productMomentumStart&&day<=productMomentumEnd)p.counts.set(day,(p.counts.get(day)||0)+1);");
worker = edit(worker, '    if(!/^\\/products\\//.test(pagePath))continue;\n    const key=productTitleKey(page[1]);',
  '    const productPath=pagePath.match(/(?:^|\\/)products\\/([^/]+)/);\n' +
  '    if(!productPath)continue;\n' +
  '    const titleKey=productTitleKey(page[1]);\n' +
  '    const key=productMomentumMap.has(titleKey)?titleKey:productTitleKey(productPath[1]);');
worker = edit(worker,
  "    sessions:productMomentumDays.map(d=>productMomentumPageDays.has(d)?(productMomentumPageSessions.get(key)?.get(d)||0):null),",
  "    sessions:productMomentumDays.map(d=>productMomentumPageSessions.get(key)?.get(d)??null),");
worker = edit(worker, "    available:inventoryRaw.length>0,",
  "    available:inventoryRaw.length>0,\n" +
  "    orderHistoryStart: orderRows.reduce((earliest,row)=>{const day=dateCandidates(row[idx.date])[0];return day&&(!earliest||day<earliest)?day:earliest;},''),");
worker = edit(worker, '      return {product:String(r[1]??""),variant:',
  "      const history = productMomentumMap.get(productTitleKey(r[1]));\n" +
  "      const last60 = history ? productMomentumDays.slice(-60).reduce((sum,day)=>sum+(history.counts.get(day)||0),0) : null;\n" +
  '      return {orders60:last60,ordersAll:history?.total??null,product:String(r[1]??""),variant:');

html = edit(html, "const span=r.compareDays||r.days;",
  "if(r.days===1 && r.compareDays===1)return singleDayComparison(title,r);\nconst span=r.compareDays||r.days;");
html = edit(html, "Latest Shopify stock by product and size. Product status gives more weight to sizes that account for a larger share of units ordered in the selected period.",
  "Shopify stock by product and size. The product card shows the status of most active sizes. Each size has its own stock and runout estimate.");
html = edit(html, "Sum of Meta daily ad spend", "All campaign objectives · latest Meta export per day");
html = edit(html, "    product.variants.push({row,state,units:view.period===7?row.units7:row.units28});",
  "    product.variants.push({row,state,units:view.period===7?row.units7:view.period===28?row.units28:null});");
html = section(html, "    const demand={red:0,orange:0,green:0};", "  const number=n=>", [
  "    const good = active.filter(v=>v.state===states.good).length;",
  "    const red = active.filter(v=>v.state.tone==='red').length;",
  "    product.tone = !active.length?'gray':red>active.length/2?'red':good>active.length/2?'green':'orange';",
  "    if(view.period===60||view.period===0){",
  "      const snapshot = product.variants[0].row;",
  "      product.unitsOrdered = (view.period===60?snapshot.orders60:snapshot.ordersAll) ?? -1;",
  "    }",
  "  }",
  "  products.sort((a,b)=>b.unitsOrdered-a.unitsOrdered||a.name.localeCompare(b.name));",
  "",
].join("\n"));
html = edit(html, "[7,28].map(n=>", "[7,28,60,0].map(n=>");
html = edit(html, "Best sellers last '+n+' days", "'+(n?'Last '+n+' days':'All time')+'");
html = edit(html,
  "Ranked by units ordered. Red means all active sizes are out of stock or at least 25% of orders came from sizes that are out of stock or have 3 days or less left. Orange means at least 10% of orders came from flagged sizes, or sizes are flagged and there are no orders to weigh. Each size keeps its own status.",
  "A card is green when most active sizes have over 7 days of stock or positive stock with no recent demand. Red means most active sizes are out of stock or have 3 days or less. Other mixes are orange. Each size with over 3 and up to 7 days is orange.");
html = edit(html, "'+(view.period===28?'<p class=\"hint\">28-day totals include units matched to a Shopify variant. Imported orders without a variant match may be missing.</p>':'')+",
  "'+(view.period===60||view.period===0?'<p class=\"hint\">Sorted by matched Shopify orders per product. History begins '+esc(data.orderHistoryStart||'on the first available order')+'.</p>':'')+");
html = edit(html, "+fmt(product.variants.length)+' variants</small>",
  "+fmt(product.variants.length)+' variants'+((view.period===60||view.period===0)&&product.unitsOrdered>=0?' · '+fmt(product.unitsOrdered)+' matched orders':'')+'</small>");
html = edit(html, "Orders<small class=\"inv-column-note\">(last '+view.period+' days)</small>",
  "'+(view.period===60||view.period===0?'Variant units unavailable':'Units ordered<small class=\"inv-column-note\">(last '+view.period+' days)</small>')+'");

html = edit(html, "function renderDemographics(){", "function renderDemographics(shipping=false){");
html = edit(html, "return '<div class=\"section-head\" style=\"margin-top:26px\"><div><h2>Demographics</h2><p>Delivered revenue, delivery rate and geographic performance.</p>",
  "return (shipping?'':'<div class=\"section-head\" style=\"margin-top:26px\"><div><h2>Customer demographics</h2><p>Orders and delivered revenue by gender.</p>");
html = edit(html, "+genderOrdersGraphic(true)+'</section><section class=\"panel\" style=\"margin-top:14px\"><h3>Region / District by Revenue</h3>",
  "+genderOrdersGraphic(true)+'</section>')+(shipping?'<section class=\"panel\" style=\"margin-top:14px\"><h3>Shipping regions and districts</h3>");
html = edit(html, "+more('demo-more-durations',demoDurationCount,regions.length)+'</section>';}", "+more('demo-more-durations',demoDurationCount,regions.length)+'</section>':'');}");
html = html.replaceAll("demoLocationCount+=5;renderCustomerAnalysis()", "demoLocationCount+=5;renderShippingAnalysis()")
  .replaceAll("demoDurationCount+=5;renderCustomerAnalysis()", "demoDurationCount+=5;renderShippingAnalysis()");
html = edit(html, "$('region-journey').onclick=()=>openJourney(2);", "");
html = edit(html, "Retention cohort is selected-period customers; lifetime metrics use their full available order history.",
  "Customer counts are unique people. The order breakdown includes every Shopify order and every status.");
html = edit(html, "+'</section><section class=\"cols\" style=\"margin-top:14px\"><div class=\"panel\"><h3>New vs returning customers",
  "+'</section><section class=\"panel\"><h3>Orders by customer type</h3><p class=\"hint\">'+fmt(m.totalOrders)+' total orders · '+fmt(ret.newOrders)+' first orders · '+fmt(ret.returningOrders)+' repeat orders'+(ret.unidentifiedOrders?' · '+fmt(ret.unidentifiedOrders)+' without a customer ID':'')+'</p></section><section class=\"cols\" style=\"margin-top:14px\"><div class=\"panel\"><h3>New vs returning customers");

html = edit(html, '<div class="mx-filter mx-date-filter"><label>Date range</label>\'+calendarControl(dateFrom,dateTo,true)+\'</div>', "");
html = edit(html, '${renderMetaExplorer()}<div class="banner"><span><i class="dot"></i>Meta Ads Funnel</span>',
  '<div class="banner"><span><i class="dot"></i>Meta Ads Funnel</span>');
html = edit(html, '${dailyTable}<section class="panel funnel-panel"><h3>Advertising conversion sequence</h3>',
  '<section class="panel funnel-panel"><h3>Conversion funnel</h3>');
html = edit(html, 'const supporting=[cards[6],cards[15]', 'const supporting=[cards[0],cards[6],cards[15]');
html = edit(html, '${sequence}</section><section class="grid">${supporting}</section><section class="panel" style="margin-top:14px"><h3>Shopify attribution rule</h3>',
  '${sequence}</section><section class="ads-summary" data-layout-label="Performance cards"><h3>Performance cards</h3><p class="hint">These cards use the dates at the top of Ads. Spend includes all Meta objectives. Funnel events, CTR and CPM use Sales campaigns.</p><div class="grid">${supporting}</div></section>${dailyTable}${renderMetaExplorer()}<section class="panel" style="margin-top:14px"><h3>Shopify attribution rule</h3>');

html = edit(html, "</style>", [
  ".ads-clean #content > .panel, .ads-clean #content > .ads-summary { margin-block: 0 20px; }",
  ".ads-clean .ads-summary { padding: 18px; border: 1px solid var(--border, #dbe4ef); border-radius: 14px; }",
  ".ads-clean .ads-summary > h3 { margin: 0 0 5px; }",
  ".ads-clean .ads-summary > .hint { margin-bottom: 14px; }",
  "</style>",
].join("\n"));

const layoutScript = fs.readFileSync("website-layout.js", "utf8");
html = edit(html, "</body>", "<script>\n" + layoutScript + "\n</script>\n</body>");
for (const [index, script] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  if (script[1].trim()) new vm.Script(script[1], { filename: "dashboard-inline-" + index + ".js" });
}
worker = worker.replace(embedded[1], Buffer.from(html, "utf8").toString("base64"));
fs.writeFileSync("worker.mjs", worker);
