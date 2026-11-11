/* Overview density V2: move existing controls, never recreate date filters. */
(function(){
  "use strict";
  const body=document.body;
  const $=s=>document.querySelector(s);
  let scheduled=false;
  function apply(){
    scheduled=false;
    const overview=typeof page!=="undefined"&&page==="Overview";
    body.classList.toggle("ultra-compact-overview",overview);
    const content=$("#content"),top=$(".main > header.top");
    if(!overview){top?.querySelector(".ultra-overview-toolbar")?.remove();return;}
    if(!content||!top)return;
    // Keep the original title for accessibility and one-page hierarchy.
    const title=$("#page-title");
    if(title&&title.textContent!=="Business Overview")title.textContent="Business Overview";
    const banner=content.querySelector(":scope > .banner");
    if(banner)banner.remove();
    const firstSection=content.querySelector(":scope > .section-head");
    const controls=firstSection?.querySelector(".dashboard-date-compare");
    if(!top.querySelector(".ultra-overview-toolbar")){
      const bar=document.createElement("div");bar.className="ultra-overview-toolbar";
      bar.setAttribute("role","group");bar.setAttribute("aria-label","Overview date and comparison controls");
      const live=document.createElement("span");live.className="ultra-overview-live";live.textContent="Live data";
      // Preserve the existing refresh button and updated timestamp.
      const actions=top.querySelector(".actions");
      if(actions)actions.before(bar);
      else top.append(bar);
      bar.append(live);
    }
    const bar=top.querySelector(".ultra-overview-toolbar");
    if(controls&&controls.parentElement!==bar)bar.prepend(controls);
    if(firstSection)firstSection.remove();
    // Section grouping remains as rendered: no KPI cards or chart handlers are removed.
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }
  function start(){
    const content=$("#content");
    if(!content)return;
    new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
    const title=$("#page-title");
    if(title)new MutationObserver(schedule).observe(title,{childList:true,characterData:true,subtree:true});
    document.querySelectorAll(".nav button").forEach(button=>button.addEventListener("click",schedule));
    schedule();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();