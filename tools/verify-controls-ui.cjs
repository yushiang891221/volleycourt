// Isolated headless browser: renders the real UI assets without signing into the game.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),gym=fs.readFileSync(path.join(root,'gym.html'),'utf8');
const css=gym.match(/<style id="app-style">([\s\S]*?)<\/style>/)[1];
const keyboard=gym.split('\n').find(s=>s.includes('id="wk-keys"'));
const fixture=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="stylesheet" href="settings.css"><style>${css}\nbody{margin:0;background:#284347!important;color:#fff}#test-court{position:fixed;inset:25% 10%;border:2px solid #eee;background:#a7654e}#test-court:after{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:2px solid white}</style><div id="test-court"></div>${keyboard}<script src="settings.js"></script><script src="tutorial.js"></script><script>window.lesson=VBTutorialFactory.create();lesson.mount(document);lesson.start('move');</script></html>`;
let browser,ws,server;
(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(fixture);}
    const name=new URL(req.url,'http://localhost').pathname.slice(1),file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
    res.setHeader('content-type',name.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
  }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);assert(exe,'browser installed');
  const port=9500+Math.floor(Math.random()*300),profile=fs.mkdtempSync(path.join(os.tmpdir(),'volley-controls-ui-'));
  browser=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1440,900','--no-first-run','--disable-background-networking','about:blank'],{stdio:'ignore',windowsHide:true});
  let target;
  for(let i=0;i<40;i++){try{const list=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=list.find(t=>t.type==='page');if(target)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  assert(target,'headless debug page');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),10000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result)});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/fixture`});
  for(let i=0;i<30;i++){if(await evaluate('!!window.lesson'))break;await new Promise(r=>setTimeout(r,100));}
  const box=await evaluate(`(()=>{const p=document.querySelector('.vb-tut-panel'),r=p.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(p).fontSize,overflow:p.scrollWidth>p.clientWidth}})()`);
  assert.equal(box.w,340);assert(box.x<=10&&box.y<=10);assert.equal(box.font,'15px');assert(!box.overflow);
  const keysBox=await evaluate("(()=>{const k=document.querySelector('.wk-keys'),r=k.getBoundingClientRect();return {x:r.x,width:r.width,display:getComputedStyle(k.firstElementChild).display}})()");
  assert.equal(keysBox.x,12);assert.equal(keysBox.width,270);assert.equal(keysBox.display,'grid');
  const output=path.resolve(root,'..','tools');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'controls-tutorial-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("lesson.stop();VBSettings.open();document.getElementById('settings-tab-2').click()");
  const controls=await evaluate(`(()=>{const p=document.querySelector('#settings-page-2'),k=p.querySelector('.control-keyboard');return {keys:[...k.querySelectorAll('kbd')].map(e=>e.textContent),width:k.getBoundingClientRect().width,overflow:k.scrollWidth>k.clientWidth,sliders:[...p.querySelectorAll('[data-pref]')].map(e=>e.dataset.pref)}})()`);
  assert(controls.keys.includes('R')&&controls.keys.includes('Q')&&controls.keys.includes('E')&&controls.keys.includes('Ctrl'));assert(!controls.overflow);assert(controls.sliders.includes('setCharge'));
  fs.writeFileSync(path.join(output,'controls-keyboard-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate("VBSettings.close();lesson.start('set')");
  assert(await evaluate("document.querySelector('.vb-tut-panel').getBoundingClientRect().right <= innerWidth"));
  console.log('PASS rendered tutorial upper-left 340px/15px, keyboard map/settings, narrow viewport bounds');console.log(JSON.stringify({box,controls,output}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();browser?.kill();server?.close();});
