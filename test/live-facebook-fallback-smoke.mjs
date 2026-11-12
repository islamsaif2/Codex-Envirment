import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on("pageerror",err=>errors.push(err.message));
try{
 await page.goto("https://ultramedix-dashboard-ogy5.onrender.com",{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>typeof dashboard!=="undefined"&&!!dashboard?.metrics,{timeout:160000});
 await page.evaluate(()=>setPage("Creative Analysis"));
 await page.waitForSelector(".ca-card img[data-ca-post]",{timeout:120000});
 const target=page.locator(".ca-card img[data-ca-post]").first();
 const post=await target.getAttribute("data-ca-post");
 assert.match(post,/^https:\/\/www\.facebook\.com\//);
 await target.evaluate(img=>{
   img.dataset.caProxyTried="yes";
   img.src="/definitely-missing-creative-fallback-test.png";
 });
 await page.waitForSelector(".ca-card .ca-facebook-preview iframe",{timeout:15000});
 const state=await page.locator(".ca-card .ca-facebook-preview iframe").first().evaluate(frame=>({
    src:frame.getAttribute("src"),height:frame.getBoundingClientRect().height
 }));
 assert.match(state.src,/^https:\/\/www\.facebook\.com\/plugins\/(post|video)\.php\?/);
 assert.ok(state.height>30,"Fallback embed should occupy the media panel");
 console.log("FACEBOOK_FALLBACK_DOM_PASS",JSON.stringify({iframeType:state.src.includes("video.php")?"video":"post",height:state.height}));

 // The previous regression must not reoccur: Creative content must clear on tab switches.
 await page.evaluate(()=>setPage("Ads"));
 await page.waitForTimeout(350);
 assert.equal(await page.locator("#content .ca-facebook-preview").count(),0);
 assert.equal(await page.locator("#content .ca-workspace").count(),0);
 await page.evaluate(()=>setPage("Overview"));
 assert.match(await page.locator("#page-title").innerText(),/Business Overview/);
 assert.deepEqual(errors,[]);
 console.log("TAB_ISOLATION_PASS");
}finally{await browser.close();}
