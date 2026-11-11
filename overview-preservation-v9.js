(function () {
  "use strict";
  // Presentation-only upgrade. Preserve API requests, card formulas, date-range
  // comparisons, funnels, business tabs, Meta Explorer and original click handlers.
  const $ = s => document.querySelector(s);
  const escText = x => String(x == null ? "" : x);
  let selectedTitle = "", parentPage = "Overview", pending = false;

  function metricAliases() {
    if (typeof sparkSpecs === "undefined") return;
    Object.assign(sparkSpecs, {
      "Total Sessions": ["ga", "sessions"],
      "Avg Sales per Day": ["metric", "totalSales"],
      "Avg Orders per Day": ["metric", "orders"],
      "Avg Sessions per Day": ["ga", "sessions"]
    });
    if (typeof cardMetricPaths !== "undefined") {
      Object.assign(cardMetricPaths, {
        "Total Sessions": "metrics.sessions",
        "Avg Sales per Day": "metrics.totalSales",
        "Avg Orders per Day": "metrics.avgOrdersPerDay",
        "Avg Sessions per Day": "metrics.sessions"
      });
    }
  }
  function periodDays() {
    if (typeof dateFrom === "undefined" || typeof dateTo === "undefined") return 1;
    const start = Date.parse(dateFrom + "T12:00:00Z"), end = Date.parse(dateTo + "T12:00:00Z");
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 1;
  }
  function metricTitle(el) {
    const t = el && el.querySelector(".kt");
    if (!t) return "";
    return (el.dataset.ultraMetric || t.querySelector(".metric-source-name")?.textContent || [...t.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join("")).trim();
  }
  function currency(v) {
    return typeof money === "function" ? money(v) : Number(v || 0).toLocaleString();
  }
  function number(v) {
    return Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-US",{maximumFractionDigits:2}) : "N/A";
  }
  function makeCard(label, value, hint) {
    if (typeof card !== "function") return null;
    const temp = document.createElement("template");
    temp.innerHTML = card(label, value, hint);
    return temp.content.querySelector(".kpi");
  }
  function safeMetricBadges(root) {
    root.querySelectorAll(".kpi").forEach(el => {
      const t = metricTitle(el);
      if (!t) return;
      let slot = el.querySelector(".kpi-badge-slot");
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "kpi-badge-slot";
        const heading = el.querySelector(".kt");
        heading?.append(slot);
      }
      if (typeof cardPercentBadge === "function") {
        try { const next = cardPercentBadge(t); if(slot.innerHTML !== next) slot.innerHTML = next; } catch (error) { console.debug("Metric comparison:", error); }
      }
      let trend = el.querySelector(".period-details");
      if (!trend) {
        trend = document.createElement("div");
        trend.className = "period-details";
        el.append(trend);
      }
      if(trend.dataset.periodTitle !== encodeURIComponent(t)) trend.dataset.periodTitle = encodeURIComponent(t);
      if (typeof cardPeriodInfo === "function") {
        try { const next = cardPeriodInfo(t); if(trend.innerHTML !== next) trend.innerHTML = next; } catch (error) { console.debug("Metric sparkline:", error); }
      }
      // Existing metrics with native click handlers retain their own detail behavior.
      if (!el.hasAttribute("data-metric-detail") && !el.dataset.ultraDrilldown) {
        el.dataset.ultraDrilldown = "1";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.addEventListener("click", event => {
          if (event.target.closest("button,a,input,select")) return;
          openMetric(t);
        });
        el.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();openMetric(t);
          }
        });
      }
    });
  }
  function createRow(container, labels, lookup) {
    const row = document.createElement("div");
    row.className = "ultra-metric-row";
    for (const label of labels) {
      const key = label.toLowerCase();
      const item = lookup.get(key);
      if (item) { row.append(item); lookup.delete(key); }
    }
    if (row.children.length) container.append(row);
  }
  function improveOverview(root) {
    const source = [...root.querySelectorAll("section.grid")].find(g => {
      const titles = [...g.querySelectorAll(".kpi")].map(metricTitle);
      return titles.includes("Total Sales") && titles.includes("Total Orders");
    });
    if (!source || source.dataset.ultraStructured === "v9") return;
    metricAliases();
    source.dataset.ultraStructured = "v9";
    source.classList.add("ultra-rest-metrics");
    const items = [...source.children].filter(x => x.matches(".kpi"));
    const lookup = new Map(items.map(item => [metricTitle(item).toLowerCase(), item]));
    // Keep the original GA4 session card and its metric comparator; only rename its display.
    const sessions = lookup.get("google sessions");
    if (sessions) {
      lookup.delete("google sessions");
      const title = sessions.querySelector(".kt .metric-source-name") || sessions.querySelector(".kt")?.firstChild;
      if (title) title.textContent = "Total Sessions";
      sessions.setAttribute("data-period-title", encodeURIComponent("Total Sessions"));
      lookup.set("total sessions", sessions);
    }
    const orders = lookup.get("avg orders per day");
    if (orders) {
      const title = orders.querySelector(".kt .metric-source-name") || orders.querySelector(".kt")?.firstChild;
      if (title) title.textContent = "Avg Orders per Day";
    }
    const metrics = typeof dashboard !== "undefined" ? dashboard?.metrics : null;
    if (metrics) {
      const days = periodDays();
      const salesAvg = makeCard("Avg Sales per Day", currency((Number(metrics.totalSales) || 0) / days), "Total Shopify sales divided by calendar days in the selected period");
      const sessionsAvg = makeCard("Avg Sessions per Day", number((Number(metrics.sessions) || 0) / days), "GA4 sessions divided by calendar days in the selected period");
      if (salesAvg) lookup.set("avg sales per day", salesAvg);
      if (sessionsAvg) lookup.set("avg sessions per day", sessionsAvg);
    }
    const section = document.createElement("section");
    section.className = "ultra-business-priority";
    section.innerHTML = '<div class="ultra-priority-heading"><h3>Business overview</h3><p>Daily averages, period totals, then efficiency — compare each metric with the previous period.</p></div>';
    source.before(section);
    createRow(section, ["Avg Sales per Day","Avg Orders per Day","Avg Sessions per Day"], lookup);
    createRow(section, ["Total Sales","Total Orders","Total Sessions"], lookup);
    createRow(section, ["Conversion Rate","AOV"], lookup);
    const remaining = [...lookup.values()];
    remaining.forEach(item => source.append(item));
    // Do not remove any remaining card or any original daily graph or funnel.
    if (source.querySelector(".kpi")) {
      const label = document.createElement("div");
      label.className = "ultra-secondary-heading";
      label.innerHTML = '<h3>Additional business metrics</h3><p>Delivery, advertising, revenue and cost performance</p>';
      source.before(label);
    }
  }
  function sourceFor(t) {
    if (typeof sparkDaily !== "function" || typeof dashboard === "undefined") return [];
    try { return sparkDaily(dashboard, t).filter(x => Number.isFinite(x.value)); } catch (_) { return []; }
  }
  function fmtValue(t, v) {
    if (/rate|ctr|conversion|bounce/i.test(t)) return (v*100).toFixed(2)+"%";
    if (/sales|spend|revenue|cost|aov|cpa|cpm/i.test(t)) return currency(v);
    return number(v);
  }
  function linePath(rows, lo, hi, x, y, w, h) {
    return rows.map((v,i) => {
      const px = x + (rows.length < 2 ? w/2 : i*w/(rows.length-1));
      const py = y + h - ((v-lo)/Math.max(0.000001,hi-lo))*h;
      return (i?"L":"M")+px.toFixed(1)+","+py.toFixed(1);
    }).join(" ");
  }
  function escapeHtml(s) {
    const el = document.createElement("span");
    el.textContent=escText(s);
    return el.innerHTML;
  }
  function renderCustomDetail() {
    const content = $("#content");
    if (!content || !selectedTitle || typeof sparkInfo !== "function") return;
    const title = selectedTitle;
    let data;
    try { data = sparkInfo(title); } catch (_) { data = null; }
    const current = (data?.current || []).filter(v => Number.isFinite(v.value));
    const previous = (data?.previous || []).filter(v => Number.isFinite(v.value));
    const all = current.concat(previous).map(v => v.value);
    let chart = '<p class="empty">Daily trend data is unavailable for this metric.</p>';
    if (all.length) {
      let lo=Math.min(...all),hi=Math.max(...all);
      if (hi===lo) {lo-=Math.max(1,Math.abs(lo)*.1);hi+=Math.max(1,Math.abs(hi)*.1);}
      const currPath=linePath(current.map(v=>v.value),lo,hi,48,22,820,235);
      const prevPath=linePath(previous.map(v=>v.value),lo,hi,48,22,820,235);
      const circles=current.map((v,i) => {
        const cx=48+(current.length<2?410:i*820/(current.length-1));
        const cy=257-(v.value-lo)/Math.max(.000001,hi-lo)*235;
        return '<circle cx="'+cx.toFixed(2)+'" cy="'+cy.toFixed(2)+'" r="4" fill="#218f79" data-chart-hover="'+escapeHtml(v.date+": "+fmtValue(title,v.value))+'"><title>'+escapeHtml(v.date+": "+fmtValue(title,v.value))+'</title></circle>';
      }).join("");
      chart='<div class="ultra-detail-legend"><span><i class="ultra-dot ultra-current"></i>Selected period</span><span><i class="ultra-dot ultra-previous"></i>Previous period</span></div><svg class="ultra-detail-chart" viewBox="0 0 900 300" role="img" aria-label="'+escapeHtml(title)+' comparison line chart"><path d="'+prevPath+'" fill="none" stroke="#90a3c4" stroke-width="3" stroke-dasharray="7 5"/><path d="'+currPath+'" fill="none" stroke="#218f79" stroke-width="3"/>'+circles+'</svg>';
    }
    const maxRows=Math.max(current.length,previous.length);
    const body=Array.from({length:maxRows},(_,i)=>'<tr><td>'+escapeHtml(current[i]?.date||"—")+'</td><td>'+ (current[i]?escapeHtml(fmtValue(title,current[i].value)):"—")+'</td><td>'+escapeHtml(previous[i]?.date||"—")+'</td><td>'+(previous[i]?escapeHtml(fmtValue(title,previous[i].value)):"—")+'</td></tr>').join("");
    let badge="";
    try { badge=typeof cardPercentBadge==="function"?cardPercentBadge(title):""; } catch(_){}
    content.innerHTML='<div class="ultra-detail-heading"><div><button type="button" class="btn" id="ultra-detail-back">← Back to '+escapeHtml(parentPage)+'</button><h2>'+escapeHtml(title)+'</h2><p>Selected period compared with the preceding period</p></div><div class="ultra-detail-badge">'+badge+'</div></div><section class="panel ultra-detail-panel">'+chart+'</section><section class="panel ultra-detail-table"><h3>Daily breakdown</h3><div class="tablewrap"><table><thead><tr><th>Current date</th><th>Current</th><th>Previous date</th><th>Previous</th></tr></thead><tbody>'+body+'</tbody></table></div></section>';
    $("#ultra-detail-back")?.addEventListener("click",()=>{
      const back=parentPage;selectedTitle="";
      if(typeof setPage==="function")setPage(back);
    });
  }
  function openMetric(title) {
    metricAliases();
    if (typeof page === "undefined" || typeof setPage !== "function") return;
    parentPage=page==="Metric Detail"?"Overview":page;
    selectedTitle=title;
    setPage("Metric Detail");
  }
  function restoreNativeDrilldowns(root) {
    root.querySelectorAll(".kpi[data-metric-detail]").forEach(el => {
      // Existing native metric-detail pages remain the authority for their metric.
      el.classList.add("ultra-clickable");
    });
  }
  function apply() {
    const root=$("#content");
    if (!root || typeof page === "undefined") return;
    metricAliases();
    if (page==="Metric Detail" && selectedTitle) {
      if(!root.querySelector(".ultra-detail-panel"))renderCustomDetail();
      return;
    }
    if (page==="Overview")improveOverview(root);
    safeMetricBadges(root);
    restoreNativeDrilldowns(root);
  }
  function queue() {
    if (pending) return;
    pending=true;
    requestAnimationFrame(() => {pending=false;apply();});
  }
  // Existing page renderer remains untouched. Observer handles dashboard
  // re-renders after date changes, new data, tab changes and comparison refreshes.
  function start() {
    metricAliases();
    const root=$("#content");
    if(!root)return;
    const observer=new MutationObserver(() => queue());
    observer.observe(root,{childList:true,subtree:true});
    queue();
    // Preserve native details and ensure our generic detail page survives reloads.
    if(typeof renderMetricDetail==="function") {
      const native=renderMetricDetail;
      renderMetricDetail=function(...args) {
        if(selectedTitle) {renderCustomDetail();return;}
        return native.apply(this,args);
      };
    }
    document.addEventListener("click", e => {
      if(e.target.closest(".kpi[data-metric-detail]"))selectedTitle="";
    },true);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();