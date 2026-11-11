const overviewCurrency = new Intl.NumberFormat("en-EG", {style:"currency", currency:"EGP", maximumFractionDigits:2});
const overviewNumber = new Intl.NumberFormat("en-EG", {maximumFractionDigits:2});

const overviewGroups = {
  business: [
    ["avg-sales","Avg Sales per Day","metrics","avgSalesPerDay","money","shopify","Shopify total sales ÷ calendar days"],
    ["avg-orders","Avg Orders per Day","metrics","avgOrdersPerDay","number","shopify","Shopify orders ÷ calendar days"],
    ["sessions","Sessions","metrics","sessions","number","ga4","Website sessions reported by GA4"],
    ["conversion","Conversion Rate","metrics","conversionRate","percent","shopify,ga4","Shopify orders ÷ GA4 sessions"],
    ["aov","AOV","metrics","averageOrderValue","money","shopify","Shopify total sales ÷ orders"],
  ],
  operations: [
    ["delivered-sales","Delivered Sales","metrics","deliveredRevenue","money","shopify,bosta","Sales on delivered orders, less order discounts"],
    ["delivered-orders","Delivered Orders","metrics","deliveredOrders","number","shopify,bosta","Shopify orders marked Delivered by Bosta"],
    ["delivery-rate","Delivery Rate","metrics","deliveryRate","percent","shopify,bosta","Delivered ÷ (delivered + returned to business)"],
    ["shipping-cost","Shipping Cost","metrics","totalShippingCosts","money","shopify","Total shipping charges before discount · column T",true],
    ["shipping-discounts","Shipping Discounts","metrics","freeShippingDiscounts","money","shopify","Shipping charges minus shipping price after discount · AI"],
    ["order-discounts","Order Discounts","metrics","totalOrderDiscounts","money","shopify","Shopify discounts · column U"],
    ["net","Revenue after delivery, ad costs & discounts","metrics","revenueAfterAdsAndDiscounts","money","shopify,bosta,meta","Delivered sales after order discounts, less total Meta spend"],
  ],
  meta: [
    ["meta-spend","Meta Total Spend","adFunnel","spend","money","meta","Total spend across Meta campaign objectives",true],
    ["meta-purchases","Meta Orders / Purchases","adFunnel","metaPurchases","number","meta","Purchase events reported by Meta Sales campaigns"],
    ["meta-cpa","Meta CPA","adFunnel","metaCpa","money","meta","Meta Sales campaign spend ÷ Meta purchases",true,"metaPurchases"],
  ],
  attributed: [
    ["meta-sales","Meta Total Sales","metrics","metaTotalSales","money","shopify","Sales from Shopify orders attributed to Meta"],
    ["meta-orders","Meta Total Orders","metrics","metaAdsOrders","number","shopify","Shopify orders attributed to Meta"],
    ["meta-delivered-sales","Meta Delivered Sales","metrics","metaDeliveredSales","money","shopify,bosta","Attributed delivered sales after order discounts"],
    ["meta-delivered-orders","Meta Delivered Orders","metrics","deliveredMetaAdsOrders","number","shopify,bosta","Attributed orders marked Delivered by Bosta"],
    ["meta-delivery-rate","Meta Delivery Rate","metrics","metaAdsDeliveryRate","percent","shopify,bosta","Attributed delivered ÷ (delivered + returned)"],
    ["meta-cost","Meta Cost per Order","metrics","costPerOrderAds","money","meta,shopify","Meta Sales campaign spend ÷ attributed orders",true,"metaAdsOrders"],
    ["meta-actual-cost","Meta Actual Cost per Order","metrics","actualCostPerOrderAds","money","meta,shopify,bosta","Meta Sales campaign spend ÷ attributed delivered orders",true,"deliveredMetaAdsOrders"],
  ],
};
const overviewCards = new Map(Object.values(overviewGroups).flat().map(card => [card[0], card]));

function overviewValue(report, card) {
  const [, , group, key, , , , , denominator] = card;
  const values = report?.[group];
  return denominator && !(values?.[denominator] > 0) ? null : values?.[key];
}

function overviewComparison(card) {
  const current = overviewValue(dashboard, card);
  const previous = overviewValue(previousDashboard, card);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return "";
  const change = (current - previous) / Math.abs(previous);
  const direction = change === 0 ? "flat" : (card[7] ? change < 0 : change > 0) ? "good" : "bad";
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "−";
  return '<span class="kpi-delta ' + direction + '" title="Change vs comparison period">' + arrow + ' ' + Math.abs(change * 100).toFixed(1) + '%</span>';
}

function refreshOverviewComparison() {
  document.querySelectorAll("[data-overview-comparison]").forEach(slot => {
    const card = overviewCards.get(slot.dataset.overviewComparison);
    if (card) slot.innerHTML = overviewComparison(card);
  });
}

function overviewCard(card) {
  const [id, title, , , format, sources, description] = card;
  const value = overviewValue(dashboard, card);
  const shown = Number.isFinite(value)
    ? format === "money" ? overviewCurrency.format(value) : format === "percent" ? pct(value) : overviewNumber.format(value)
    : "—";
  return '<article class="kpi overview-kpi" data-overview-card="' + id + '">' +
    '<div class="kt" data-metric-sources="' + sources + '">' + esc(title) + '</div>' +
    '<strong class="kv">' + esc(shown) + '</strong>' +
    '<small>' + esc(description) + '</small>' +
    '<span class="overview-comparison" data-overview-comparison="' + id + '">' + overviewComparison(card) + '</span></article>';
}

function renderDashboard() {
  if (!dashboard) return;
  const cards = (group, classes = "") => '<div class="overview-grid ' + classes + '">' + overviewGroups[group].map(overviewCard).join("") + '</div>';
  $("content").innerHTML =
    '<div class="business-overview">' +
      '<section aria-labelledby="overview-title">' +
        '<div class="overview-header"><h2 id="overview-title">Business Overview</h2>' + dateControls() + '</div>' +
        cards("business", "overview-business-grid") +
      '</section>' +
      '<section aria-labelledby="overview-operations">' +
        '<div class="overview-header"><h2 id="overview-operations">Operations <span>(Deliverability, Costs and Nets)</span></h2></div>' +
        cards("operations", "overview-operations-grid") +
      '</section>' +
      '<section aria-labelledby="overview-paid-ads">' +
        '<div class="overview-header"><h2 id="overview-paid-ads">Paid Ads</h2></div>' +
        '<div class="overview-paid-split">' +
          '<div class="overview-paid-group"><h3>Meta Ads Manager</h3>' + cards("meta", "overview-paid-grid") + '</div>' +
          '<div class="overview-paid-group"><h3>Shopify · Meta-attributed orders</h3>' + cards("attributed", "overview-paid-grid") + '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  bindDateRange();
}
