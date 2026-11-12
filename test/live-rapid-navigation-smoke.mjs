import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on("pageerror",e=>errors.push(e.message));
try{
  await page.goto("https://ultramedix-dashboard-ogy5.onrender.com",{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForFunction(()=>typeof window.setPage==="function",{timeout:20000});
  for(const tab of ["Creative Analysis","Ads","Overview","Creative Analysis","Ads","Inventory","Creative Analysis","Customer Analysis & Retention","Ads"]){
    await page.evaluate(t=>setPage(t),tab);
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(()=>typeof dashboard!=="undefined"&&!!dashboard?.metrics,null,{timeout:150000});
  await page.waitForTimeout(1000);
  const initial=await page.evaluate(()=>({
    name:document.querySelector("#page-name")?.textContent,
    title:document.querySelector("#page-title")?.textContent,
    creative:!!document.querySelector("#content .ca-workspace"),
    content:(document.querySelector("#content")?.textContent||"").slice(0,160)
  }));
  console.log("RAPID_SWITCH_AFTER_INITIAL_LOAD",JSON.stringify(initial));
  assert.equal(initial.creative,false,"Creative filters leaked into Ads");
  assert.equal(initial.title,"Ads","Wrong title after rapid startup navigation");
  for(const tab of ["Creative Analysis","Overview","Ads","Creative Analysis","Shipping and operation Analysis","Ads"]){
    await page.evaluate(t=>setPage(t),tab);
    await page.waitForTimeout(320);
    const state=await page.evaluate(()=>({
      title:document.querySelector("#page-title")?.textContent,
      creative:!!document.querySelector("#content .ca-workspace"),
      content:(document.querySelector("#content")?.textContent||"").slice(0,100)
    }));
    console.log("SWITCH",tab,JSON.stringify(state));
    assert.equal(state.creative,tab==="Creative Analysis","Creative filters incorrectly displayed on "+tab);
    assert.equal(state.title,tab==="Overview"?"Business Overview":tab,"Incorrect heading on "+tab);
  }
  assert.deepEqual(errors,[],"Browser JavaScript errors: "+errors.slice(0,4).join(", "));
  console.log("RAPID_NAVIGATION_AND_STARTUP_PASS");
}finally{await browser.close();}
