const {chromium}=require(process.argv[2] || 'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+req.url.split('?')[0]);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  let submitted=false, posts=0;
  await page.route('**/js/auth.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function getAccountService(){return {feedbackStatus:async()=>({submitted:window.already||false}),accessToken:async()=>'fake'}}`}));
  await page.route('**/js/progress.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function loadProgress(){}'}));
  await page.route('**/api/feedback',route=>{posts++;submitted=true;return route.fulfill({json:{submitted:true,reward:500}});});
  await page.route('**/fixture',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/lobby.css"><link rel="stylesheet" href="/css/theme-playone.css"><link rel="stylesheet" href="/css/theme-playone-dialogs.css"><script type="module">import {openFeedback} from "/js/feedback.js";window.openFeedback=openFeedback;openFeedback();</script>'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.locator('[data-submit]:enabled').waitFor();
  await page.locator('textarea').fill('太短');await page.locator('[data-submit]').click();assert.equal(posts,0);
  const dir=path.join(root,'.dbg');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'feedback-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.locator('dialog').boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=390,'mobile dialog fits');
  await page.screenshot({path:path.join(dir,'feedback-mobile.png')});
  await page.locator('textarea').fill('希望可以調整練習模式的球速讓新手更好上手');
  await page.locator('[data-submit]').click();await page.getByText('謝謝你的建議！已成功收件，500 金幣已入帳。').waitFor();
  assert(submitted);assert.equal(posts,1);assert(await page.locator('[data-submit]').isDisabled());
  await page.locator('[data-close]').click();await page.evaluate(()=>{window.already=true;return window.openFeedback();});
  assert(await page.locator('[data-submit]').isDisabled());
  console.log('PASS feedback UI: validation, desktop/mobile bounds, send success, weekly lock');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
