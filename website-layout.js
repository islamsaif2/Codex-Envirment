function singleDayComparison(title, range) {
  const values = [range.prior ?? range.previous[0]?.value, range.now ?? range.current[0]?.value];
  const available = values.filter(Number.isFinite);
  if (!available.length) return '<div class="kpi-no-trend">Daily trend unavailable</div>';
  const low = Math.min(...available), high = Math.max(...available);
  const y = value => low === high ? 38 : 62 - 46 * (value - low) / (high - low);
  const line = available.length === 2
    ? '<path d="M28 ' + y(values[0]) + ' L292 ' + y(values[1]) + '" stroke="#5277c8" stroke-width="3" fill="none"/>'
    : '';
  const dots = values.map((value, index) => Number.isFinite(value)
    ? '<circle cx="' + (index ? 292 : 28) + '" cy="' + y(value) + '" r="4.5" fill="' + (index ? '#16866d' : '#718caf') + '"><title>' + esc(kpiValueFormat(title, value)) + '</title></circle>'
    : '').join('');
  return '<svg class="kpi-dual-chart" viewBox="0 0 320 80" preserveAspectRatio="none" role="img" aria-label="Previous day to selected day">' + line + dots + '</svg>' +
    '<div class="kpi-chart-legend"><span>' + esc(range.previousFrom) + ' · ' + kpiValueFormat(title, values[0]) + '</span><span>' + esc(range.from) + ' · ' + kpiValueFormat(title, values[1]) + '</span></div>';
}

(() => {
  const root = document.getElementById("content");
  const normalize = label => String(label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases = {
    "website funnel": "ga4 data",
    "ad funnel": "ads",
    "product analysis": "products & page analysis",
  };
  const tabKey = label => aliases[normalize(label)] || normalize(label);
  const rank = value => Number(value) > 0 ? Number(value) : Infinity;
  const heading = element => {
    if (element.dataset.layoutLabel) return element.dataset.layoutLabel;
    const title = element.querySelector(":scope > h2, :scope > h3, :scope > .kt, :scope > div > h3");
    if (!title) return element.id || "";
    return [...title.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim() || title.textContent.trim();
  };
  function reorder(container, elements, orders, labelOf) {
    if (elements.length < 2 || !orders.size) return;
    const sorted = [...elements].sort((a, b) => (orders.get(normalize(labelOf(a))) ?? Infinity) - (orders.get(normalize(labelOf(b))) ?? Infinity));
    if (elements.every((node, index) => node === sorted[index])) return;
    // Only ranked siblings move. Placeholders preserve unrelated controls.
    const slots = elements.map(node => {
      const slot = document.createComment("layout");
      container.replaceChild(slot, node);
      return slot;
    });
    slots.forEach((slot, index) => slot.replaceWith(sorted[index]));
  }
  function update() {
    if (!dashboard || !root.firstElementChild || root.querySelector(":scope > .loading")) return;
    if (page === "Shipping and operation Analysis" && !root.querySelector("#shipping-geography")) {
      const geography = document.createElement("div");
      geography.id = "shipping-geography";
      geography.dataset.layoutLabel = "Shipping geography";
      geography.innerHTML = renderDemographics(true);
      root.append(geography);
      bindDemographics();
      const region = document.getElementById("region-journey");
      if (region) region.onclick = () => openJourney(2);
    }
    const rows = (dashboard.websiteLayout || []).slice(1);
    const tabOrders = new Map(rows.filter(row => row[5] && Number.isFinite(rank(row[6]))).map(row => [tabKey(row[5]), rank(row[6])]));
    const sections = new Map(rows.filter(row => tabKey(row[8]) === tabKey(page) && row[9] && Number.isFinite(rank(row[10]))).map(row => [normalize(row[9]), rank(row[10])]));
    const cards = new Map(rows.filter(row => tabKey(row[0]) === tabKey(page) && row[1] && Number.isFinite(rank(row[2]))).map(row => [normalize(row[1]), rank(row[2])]));
    const overview = document.getElementById("nav-overview");
    if (overview?.parentElement) {
      const nav = overview.parentElement;
      reorder(nav, [...nav.children].filter(element => element.id.startsWith("nav-")), tabOrders, element => tabKey(element.textContent));
    }
    reorder(root, [...root.children].filter(el => sections.has(normalize(heading(el)))), sections, heading);
    for (const grid of root.querySelectorAll(".grid")) {
      reorder(grid, [...grid.children].filter(el => el.classList.contains("kpi")), cards, heading);
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  update();
})();
