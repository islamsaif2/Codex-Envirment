(function(){
  "use strict";
  function compactInventory(){
    if(typeof page==="undefined"||page!=="Inventory")return;
    const root=document.getElementById("content");
    if(!root||!root.querySelector(".inv-grid"))return;
    // Keep the page-level title; remove the duplicated inventory section title.
    root.querySelector(":scope > .section-head")?.remove();
    const section=root.querySelector(".inv-heading")?.parentElement;
    if(!section)return;
    section.classList.add("ultra-inventory-compact");
    let notes=[...section.querySelectorAll(":scope > p.hint")];
    if(notes.length){
      let top=notes[0],raw=top.textContent||"";
      let count=(raw.match(/^Showing\s+[^.]+\./)||[])[0]||"";
      top.textContent=count||"Product stock and demand, by size.";
      top.classList.add("ultra-inventory-count");
      const detailed=notes.slice(1);
      if(detailed.length){
        const details=document.createElement("details");
        details.className="ultra-inventory-explain";
        const summary=document.createElement("summary");
        summary.textContent="How stock alerts and demand are calculated";
        details.append(summary);
        detailed.forEach(p=>details.append(p));
        top.after(details);
      }
    }
    const grid=root.querySelector(".inv-grid");
    grid.classList.add("ultra-inventory-full-grid");
  }
  // Preserve all original inventory actions/rerenders.
  if(typeof renderInventory==="function"){
    const original=renderInventory;
    renderInventory=function(...args){
      const result=original.apply(this,args);
      compactInventory();
      return result;
    };
  }
  compactInventory();
  function moveSourcesLeft(root=document){
    for(const heading of root.querySelectorAll("#content .kpi .kt")){
      const elements=[...heading.children].filter(el=>
        el.matches(".ultra-source-collection,.metric-source-icons,.metric-source-heading,.source-brand-icon")
      );
      if(!elements.length)continue;
      for(const el of elements){
        // Reposition original markup without rebuilding the icons or changing
        // labels. Badge stays in its own absolute slot at the upper right.
        if(el!==heading.firstChild)heading.insertBefore(el,heading.firstChild);
      }
      heading.classList.add("ultra-source-title-left");
    }
    for(const th of root.querySelectorAll("#content th")){
      const icons=th.querySelector(":scope > .ultra-source-icons");
      if(icons&&icons!==th.firstChild)th.insertBefore(icons,th.firstChild);
    }
  }
  let scheduled=false;
  const observer=new MutationObserver(records=>{
    if(!records.some(rec=>rec.type==="childList"&&[...rec.addedNodes].some(n=>n.nodeType===1)))return;
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;moveSourcesLeft(document);});
  });
  const target=document.getElementById("content");
  if(target)observer.observe(target,{childList:true,subtree:true});
  moveSourcesLeft(document);
})();