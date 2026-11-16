// Isolated headless browser: renders the real UI assets without signing into the game.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),gym=fs.readFileSync(path.join(root,'gym.html'),'utf8');
const css=gym.match(/<style id="app-style">([\s\S]*?)<\/style>/)[1];
const keyboard=gym.split('\n').find(s=>s.includes('id="wk-keys"'));
const wheel=gym.slice(gym.indexOf('const SET_OPT ='),gym.indexOf('// Q/E choose the side'));
const coach=gym.slice(gym.indexOf('const TUT_COACH ='),gym.indexOf('// ---------------------------------------------------------------- loop',gym.indexOf('const TUT_COACH =')));
const fixture=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="stylesheet" href="css/settings.css"><style>${css}\nbody{margin:0;background:#284347!important;color:#fff}#test-court{position:fixed;inset:25% 10%;border:2px solid #eee;background:#a7654e}#test-court:after{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:2px solid white}</style><div id="test-court"></div><div class="sta" id="sta" style="--v:.55"><b>體力 55%</b><i></i></div>${keyboard}<div class="set-wheel" id="set-menu" hidden><i id="set-cur"></i></div><script src="js/settings.js"></script><script src="js/tutorial.js"></script><script>const walk={on:true},VM={on:false},$=id=>document.getElementById(id);const vbManualSetCancel=()=>{},roomSpectator=()=>false,vbSet=(...args)=>window.lastSet=args;${wheel};window.lesson=VBTutorialFactory.create({now:()=>window.lessonClock||0});lesson.mount(document);lesson.start('move');</script><script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const scene=new THREE.Scene(),BALL_R=.105,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,100);camera.position.set(6,8,10);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.domElement.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:1';document.body.prepend(renderer.domElement);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,9),new THREE.MeshBasicMaterial({color:0xa7654e}));floor.rotation.x=-Math.PI/2;scene.add(floor);
${coach}
TUT_COACH.ring=TUT_COACH.circle(new THREE.Vector3(0,0,0));TUT_COACH.progress(.5);TUT_COACH.trajectory(new THREE.Vector3(-3,3.25,0),new THREE.Vector3(6,1,0));
window.preview={coach:TUT_COACH,render:()=>renderer.render(scene,camera)};preview.render();
</script></html>`;
let browser,ws,server;
(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url.startsWith('/fixture')){res.setHeader('content-type','text/html; charset=utf-8');return res.end(fixture);}
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
  await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/fixture?practice=1`});
  for(let i=0;i<30;i++){if(await evaluate('!!window.lesson'))break;await new Promise(r=>setTimeout(r,100));}
  const box=await evaluate(`(()=>{const p=document.querySelector('.vb-tut-panel'),r=p.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(p).fontSize,overflow:p.scrollWidth>p.clientWidth}})()`);
  assert.equal(box.w,440);assert(box.x<=20&&box.y>=100);assert.equal(box.font,'19px');assert(!box.overflow);
  const keysBox=await evaluate("(()=>{const k=document.querySelector('.wk-keys'),r=k.getBoundingClientRect();return {x:r.x,width:r.width,display:getComputedStyle(k.firstElementChild).display}})()");
  assert.equal(keysBox.x,12);assert.equal(keysBox.width,270);assert.equal(keysBox.display,'grid');
  const output=path.resolve(root,'..','tools');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'controls-tutorial-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'}))");
  assert(await evaluate("document.querySelector('#wk-keys [data-key=w]').parentElement.classList.contains('pressed')"));
  await evaluate("dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w'}))");
  assert(await evaluate("!document.querySelector('#wk-keys [data-key=w]').parentElement.classList.contains('pressed')"));
  await evaluate("lesson.stop();setWheelOpen();setMenuMove(-70,-121)");
  assert.equal(await evaluate("SETM.m.hov"),0);
  const wheelSize=await evaluate("({outer:document.getElementById('set-menu').clientWidth,center:document.querySelector('.sw-center').offsetWidth})");
  assert(wheelSize.outer>=518);assert(wheelSize.center>=170);
  await evaluate("setWheelOpen(0);setMenuMove(60,0)");assert.equal(await evaluate('SETM.m.hov'),-1,'inside large center cannot select a route');
  await evaluate("setMenuMove(80,0)");assert.equal(await evaluate('SETM.m.hov'),2);
  await evaluate("setMenuMove(-80,0)");assert.equal(await evaluate('SETM.m.hov'),-1,'returning to center clears selection');
  await evaluate("setWheelOpen(0);setMenuMove(-70,-121)");

  assert.equal(await evaluate("window.lastSet"),undefined);
  fs.writeFileSync(path.join(output,'set-wheel-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  for(let i=0;i<6;i++){
    const hit=await evaluate('(function(){setWheelOpen(0);const a=setWheelAngle('+i+');setMenuMove(Math.cos(a)*140,-Math.sin(a)*140);const h=SETM.m.hov;setMenuClose(true);return {h,shot:lastSet};})()');
    assert.equal(hit.h,i);assert.equal(hit.shot[2],true);
  }
  await evaluate("setWheelOpen(1);setMenuMove(-140,0);setMenuClose(true)");
  assert.deepEqual(await evaluate('lastSet'),[4,'line3',true]);
  await evaluate("setWheelOpen(0);setWheelScroll({deltaY:1,preventDefault(){},stopPropagation(){}})");
  assert.equal(await evaluate('SETM.page'),1);
  await evaluate("setMenuClose(false);setWheelOpen(1);setMenuMove(140,0);window.lastSet=null;setMenuClose(true)");
  assert.equal(await evaluate('lastSet'),null,'empty rear sector cancels instead of firing');
  await evaluate("setWheelOpen(0);dispatchEvent(new Event('blur'))");assert.equal(await evaluate('SETM.m'),null);
  await evaluate("dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',key:'Shift'}));dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftRight',key:'Shift'}));dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',key:'Shift'}))");
  assert(await evaluate("document.querySelector('#wk-keys [data-key=shift]').parentElement.classList.contains('pressed')"));
  await evaluate("dispatchEvent(new Event('blur'))");assert(await evaluate("!document.querySelector('#wk-keys .pressed')"));
  await evaluate("history.replaceState(null,'','/fixture');practiceKeysRender()");assert(await evaluate("document.getElementById('wk-keys').hidden"));
  await evaluate("history.replaceState(null,'','/fixture?practice=1');practiceKeysRender();VBSettings.open();document.getElementById('settings-tab-2').click()");
  await evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  const controls=await evaluate(`(()=>{const p=document.querySelector('#settings-page-2'),k=p.querySelector('.control-keyboard');return {keys:[...k.querySelectorAll('kbd')].map(e=>e.textContent),width:k.getBoundingClientRect().width,overflow:k.scrollWidth>k.clientWidth,sliders:[...p.querySelectorAll('[data-pref]')].map(e=>e.dataset.pref)}})()`);
  assert(controls.keys.includes('R')&&controls.keys.includes('Q')&&controls.keys.includes('E')&&controls.keys.includes('Ctrl'));assert(!controls.overflow,JSON.stringify(controls));assert.equal(controls.keys.length,104);assert(!controls.sliders.includes('setCharge'));
  assert.equal(await evaluate('VBSettings.values.keys.q'),'KeyC');assert.equal(await evaluate('VBSettings.values.keys.b'),'KeyB');
  await evaluate("document.querySelector('[data-physical=KeyC]').click();document.querySelector('.vb-settings').dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',bubbles:true}))");
  assert.equal(await evaluate('VBSettings.values.keys.q'),'KeyZ');
  await evaluate("document.querySelector('[data-physical=KeyU]').click();document.querySelector('[data-hotkey-action]').value='v';document.querySelector('[data-hotkey-apply]').click()");
  assert.equal(await evaluate('VBSettings.values.keys.v'),'KeyU');
  await evaluate("document.querySelector('[data-reset-keys]').click();VBSettings.update({fov:60})");
  assert.equal(await evaluate('VBSettings.values.fov'),85);assert.equal(await evaluate('VBSettings.values.keys.q'),'KeyC');
  fs.writeFileSync(path.join(output,'controls-keyboard-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("VBSettings.close();lesson.start('set');lesson.emit('set',{n:1,v:'high',menu:true})");
  assert.equal(await evaluate("document.querySelectorAll('.vb-tut-progress i.done').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('.vb-tut-progress i').length"),3);
  for(let i=0;i<100;i++){if(await evaluate('!!window.preview'))break;await new Promise(r=>setTimeout(r,100));}
  assert(await evaluate('!!window.preview'),'Three.js preview loaded');
  fs.writeFileSync(path.join(output,'tutorial-progress-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  for(let i=0;i<2;i++)await evaluate("lessonClock=(window.lessonClock||0)+900;lesson.frame({x:0,z:0,focused:true});lesson.emit('set',{n:1,v:'high',menu:true})");
  assert.equal(await evaluate("document.querySelectorAll('.vb-tut-progress i.done').length"),3);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.vb-tut-panel')).backgroundColor"),'rgb(23, 36, 49)');
  await evaluate('preview.coach.progress(1);preview.render()');
  fs.writeFileSync(path.join(output,'tutorial-complete-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("lesson.start('move');for(let i=0;i<4;i++){lesson.skip();lessonClock=(window.lessonClock||0)+800;lesson.frame({focused:true});}");
  assert(await evaluate("document.body.classList.contains('vb-tut-stamina')"));
  assert(await evaluate("document.querySelector('#sta').getBoundingClientRect().height>=32"));
  fs.writeFileSync(path.join(output,'tutorial-stamina-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("lesson.stop()");assert(await evaluate("document.querySelector('#sta').getBoundingClientRect().height>=20"));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate("VBSettings.close();lesson.start('set')");
  assert(await evaluate("document.querySelector('.vb-tut-panel').getBoundingClientRect().right <= innerWidth"));
  console.log('PASS rendered tutorial left-middle 440px/19px, keyboard map/settings, narrow viewport bounds');console.log(JSON.stringify({box,controls,output}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();browser?.kill();server?.close();});
