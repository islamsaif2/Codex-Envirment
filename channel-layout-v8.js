(function(){
  // Keep the source provenance visible without changing attribution calculations.
  const metaLogo='<svg viewBox="0 0 34 20" width="22" height="15" aria-hidden="true"><path d="M2 14C5 5 8 3 12 5c4 2 7 10 11 10 3 0 5-6 6-9 1-3 4-3 4 1 0 5-5 12-10 12-7 0-10-11-15-11-2 0-4 4-5 8" fill="none" stroke="#1877f2" stroke-width="3.1" stroke-linecap="round"/></svg>';
  const shopLogo='<svg viewBox="0 0 24 26" width="18" height="20" aria-hidden="true"><path fill="#87B938" d="M2 5l16-3 4 5-1 17-19 2z"/><path fill="#496C19" d="M18 2l4 5-4 2z"/><path d="M10 3c0-4 6-3 6 3M7 5c0-5 7-6 7 0" fill="none" stroke="#fff" stroke-width="1.5"/><text x="7.7" y="19" font-size="13" font-family="Arial,sans-serif" font-weight="900" fill="white" transform="rotate(-7 11 15)">S</text></svg>';
  const icons=[
    ["Meta Platform Analysis","meta"],["Meta Placement Analysis","meta"],
    ["Channel Analysis","shopify"],["Shopify first-/last-visit orders","shopify"],
    ["Paid vs organic","shopify"],["Channel mix over time","shopify"]
  ];
  function refineChannels(){
    const root=document.getElementById("content");if(!root)return;
    for(const [label,brand] of icons){
      const header=[...root.querySelectorAll("section.panel h3")].find(h=>h.textContent.trim()===label);
      if(!header||header.querySelector(".source-brand-icon"))continue;
      const span=document.createElement("span");span.className="source-brand-icon source-brand-"+brand;
      span.title=brand==="meta"?"Source: Meta Ads":"Source: Shopify / Order Tracking";
      span.setAttribute("role","img");span.setAttribute("aria-label",span.title);
      span.innerHTML=brand==="meta"?metaLogo:shopLogo;header.prepend(span);
    }
    // Pair paid/organic (left) with the weekly channel mix (right).
    const paid=root.querySelector("section.source-pie");
    const mix=[...root.querySelectorAll("section.mix-panel")].find(p=>p.querySelector("h3")?.textContent.includes("Channel mix over time"));
    if(paid&&mix&&!paid.closest(".channel-summary-grid")){
      const grid=document.createElement("div");grid.className="channel-summary-grid";
      paid.before(grid);grid.append(paid,mix);
    }
    // Keep the placement card the same height as its neighboring platform card.
    const metaPair=root.querySelector(".meta-analysis-grid");
    if(metaPair){metaPair.classList.add("meta-visual-balanced");}
  }
  if(typeof renderChannels!=="function")return;
  const original=renderChannels;
  renderChannels=function(...args){
    const value=original.apply(this,args);
    refineChannels();
    return value;
  };
})();