import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const failures=[];
page.on("pageerror",e=>failures.push(e.message));
await page.goto("https://ultramedix-dashboard-ogy5.onrender.com",{waitUntil:"domcontentloaded",timeout:60000});
await page.waitForFunction(()=>typeof window.setPage==="function",{timeout:15000});
async function check(tab,expectCreative){
  await page.evaluate(p=>window.setPage(p),tab);
  await page.waitForTimeout(250);
  const state=await page.evaluate(()=>({pageTitle:document.querySelector("#page-title")?.textContent||"",
    sectionTitle:document.querySelector("#content .section-head h2")?.textContent||"",
    creative:!!document.querySelector("#content .ca-workspace"),
    hasContent:(document.querySelector("#content")?.textContent||"").slice(0,150)
  }));
  console.log(JSON.stringify({tab,...state}));
  if(state.creative!==expectCreative)throw Error("Creative Analysis content leaked into "+tab);
  if(!state.pageTitle)throw Error("Missing page title for "+tab);
}
await check("Creative Analysis",true);
await check("Ads",false);
await check("Shipping and operation Analysis",false);
await check("Inventory",false);
await check("Overview",false);
await check("Creative Analysis",true);
await check("Customer Analysis & Retention",false);
console.log("NAVIGATION PASS; browser exceptions:",failures.slice(0,8));
await browser.close();
