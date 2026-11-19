import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {engine,source:fnSource,Vector}=require('./tutorial-engine.cjs');
const source=fs.readFileSync(new URL('../src/gym/game/11-volley-control.js',import.meta.url),'utf8');
const pure={};
vm.runInNewContext(source.slice(source.indexOf('function vbOverheadTiming'),source.indexOf('function vbOverheadReceive')),pure);
test('上手時機：早、準、晚、噴、重球與邊界',()=>{
  for(const [dt,speed,kind] of [[-.1,10,'perfect'],[.03,10,'perfect'],[.12,10,'slip'],[.3,10,'spray'],[-.4,10,'early'],[.05,17,'slip'],[-.25,10,'perfect'],[.06,10,'perfect'],[.2,10,'slip'],[-.031,17,'slip'],[.03,17,'perfect']]) {
    const r=pure.vbOverheadTiming(dt,speed); assert.equal(r.kind,kind,`${dt}/${speed}`);
    if(kind==='slip'||kind==='spray'){assert(r.back>0);assert(r.rise>0);assert(r.q<1);}
    if(kind==='early')assert.equal(r.hit,false);
  }
});
test('軌跡找得到未到與已過的最接近時刻，並保留橫向偏差',()=>{
  const H={x:0,y:2,z:0},v={x:0,y:0,z:10};
  for(const t of [-.3,-.12,.1,.4]){
    const p={x:.3,y:2+4.9*t*t,z:-10*t};
    const r=pure.vbOverheadClosest(p,v,H);
    assert(Math.abs(r.t-t)<.006);assert(Math.abs(r.dmin-.3)<.001);
  }
});
function settings(raw){
  const c={window:{},matchMedia:()=>({matches:false}),innerWidth:1200,localStorage:{getItem:k=>k==='vb.settings'?JSON.stringify(raw):null,setItem(){}},dispatchEvent(){},CustomEvent:class{}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/settings.js',import.meta.url),'utf8'),c);return c.window.VBSettings;
}
test('v5 遷移、重載、E 衝突、未綁定與自訂鍵保留',()=>{
  const p=settings({controlVersion:4,volume:37,keys:{1:'KeyQ',2:'KeyE',3:'KeyR',6:'Digit1',4:'Digit2',5:'Digit3'}});
  assert.equal(p.values.controlVersion,5);assert.equal(p.values.volume,37);
  assert.deepEqual([p.values.keys[1],p.values.keys[2],p.values.keys[3]],['','','']);
  assert.equal(p.values.keys.oh,'KeyE');assert.equal(p.key({code:'KeyQ',key:'q'}),'');
  assert.equal(p.key({code:'KeyE',key:'e'}),'oh');
  assert.equal(settings(p.values).values.keys[1],'');
  const other=settings({controlVersion:4,keys:{1:'KeyY',2:'KeyU',3:'KeyR',interact:'KeyE'}});
  assert.equal(other.values.keys[1],'KeyY');assert.equal(other.values.keys[2],'KeyU');
  assert.equal(other.values.keys.interact,'KeyE');assert.notEqual(other.values.keys.oh,'KeyE');
  const assigned=Object.values(other.values.keys).filter(Boolean);assert.equal(new Set(assigned).size,assigned.length);
  assert(p.bind('1','KeyW'));assert.equal(p.values.keys[1],'KeyW');assert.equal(p.values.keys.w,'');
});
class V {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new V(this.x,this.y,this.z);}
  length(){return Math.hypot(this.x,this.y,this.z);}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
function fixture(t=.1){
  const b={m:{position:new V(0,2+4.9*t*t,.25-10*t)},v:new V(0,0,10),rest:0};
  const c={THREE:{Vector3:V},walk:{on:true,x:0,z:0},skill:{},VM:{on:false},VB:{dt:.05,ts:1},camera:{position:{y:1.75}},balls:[b],performance:{now:()=>1000},vbFwd:()=>[0,1],gameRandom:()=>1,roomSpectator:()=>false,hands:{},toast:m=>c.message=m,pose:'hold'};
  vm.runInNewContext(source.slice(source.indexOf('function vbOverheadTiming'),source.indexOf('function vbDoOverheadReceive')),c);
  c.vbDoOverheadReceive=o=>{c.hit=o;};return {c,b};
}
test('早按只排一次佇列，時間到才碰球；晚按立即碰球',()=>{
  const {c,b}=fixture();c.vbOverheadReceive();assert(c.walk.ohQ);assert(!c.hit);assert.equal(c.pose,'set');   /* 第一人稱手的姿勢表只有 set（setReady 是全身姿勢，用了會當掉） */
  const queued=c.walk.ohQ;c.vbOverheadReceive();assert.equal(c.walk.ohQ,queued);
  c.vbOverheadStep();assert(!c.hit);b.m.position=new V(0,2,.25);c.vbOverheadStep();assert(c.hit);assert.equal(c.walk.ohQ,null);
  for(const t of [-.12,-.3]){const f=fixture(t);f.c.vbOverheadReceive();assert(f.c.hit);assert.equal(f.c.hit.dt,-t);}
});
test('太早、太低、太遠、觀戰及球已失效不觸球',()=>{
  let f=fixture(.4);f.c.vbOverheadReceive();assert.equal(f.c.message,'上手太早了');assert(!f.c.hit);
  f=fixture(0);f.b.m.position.x=2;f.c.vbOverheadReceive();assert.equal(f.c.message,'球太遠，上手接不到');
  f=fixture(.1);f.c.VM.on=true;f.c.roomSpectator=()=>true;f.c.vbOverheadReceive();assert(!f.c.walk.ohQ);
  f=fixture(.1);f.c.vbOverheadReceive();f.b.rest=1;f.c.vbOverheadStep();assert.equal(f.c.walk.ohQ,null);assert(!f.c.hit);
  f=fixture(0);f.b.m.position.y=1;f.b.v=new V(0,8,0);f.c.vbOverheadReceive();assert.equal(f.c.message,'球太低，用 V 接');assert(!f.c.hit);
});
test('慢速模式仍以實際秒判定；重球額外溜手機率加倍',()=>{
  const {c}=fixture(.1);c.VB.ts=.5;c.vbOverheadReceive();assert.equal(c.walk.ohQ.dt,-.2);assert.equal(c.walk.ohQ.left,.2);
  assert.equal(pure.vbOverheadTiming(.01,15,.15).kind,'perfect');
  assert.equal(pure.vbOverheadTiming(.01,17,.15).kind,'slip');
});
test('實際出球：晚按往背後，觸球不挪球，觸發 set 與上手事件',()=>{
  const {c}=engine();c.gameRandom=()=>1;c.window.__gym={};
  for(const name of ['vbOverheadTiming','vbDoOverheadReceive'])vm.runInContext(fnSource(name),c);
  const touches=[],events=[],hits=[],costs=[];
  c.vmOnTouch=(...a)=>touches.push(a);c.tutEv=(...a)=>events.push(a);c.recHit=o=>hits.push(o);c.staPay=k=>costs.push(k);
  for(const dt of [.03,.12,.3]){
    const cp=new Vector(c.walk.x,2,c.walk.z-.25),b={m:{position:cp.clone()},v:new Vector(0,0,10),rest:0};
    c.vbDoOverheadReceive({b,dt,dmin:.1,vin:10,result:c.vbOverheadTiming(dt,10)});
    assert.equal(b.m.position.distanceTo(cp),0);assert.equal(c.pose,'setPush');assert.equal(c.walk.flash,.45);
    assert.equal(touches.at(-1)[2],'set');assert.equal(events.at(-1)[0],'recvOverhead');assert.equal(hits.at(-1).kind,'set');assert.equal(costs.at(-1),'overhead');
    assert.equal(c.window.__gym.lastOverhead.dt,dt);
    if(dt>.06)assert(b.v.z>0,'面向負 z 時，溜手出球應往正 z');
    if(dt>.2){const T=(b.v.y+Math.sqrt(b.v.y*b.v.y+19.6*(cp.y-c.BALL_R)))/9.8;const landing=cp.z+b.v.z*T-c.walk.z;assert(landing>=2&&landing<=5);}
  }
});
test('V 高球分段品質與 50% 接噴；撲救維持原品質',()=>{
  const {c}=engine();c.gameRandom=()=>.9;c.window.__gym={};
  c.vbReceiveTarget=o=>({...o,ct:null,second:false,tx:c.walk.x,tz:c.walk.z,ty:2,T:1,back:false,defl:null});
  const receive=(y,roll,dive=false)=>{
    c.gameRandom=()=>roll;let q;c.vbLaunch=(b,cp,v,kind,quality)=>{q=quality;b.v=v;};
    const b={m:{position:new Vector(c.walk.x,y,c.walk.z-.4)},v:new Vector(0,0,10)};
    c.vbDoReceive({b,dx:0,dz:-.4},dive);return q;
  };
  assert.equal(receive(1.25,.9),1);assert.equal(receive(1.45,.9),.75);
  assert.equal(receive(1.46,.9),.55);assert.equal(receive(1.46,.49),.2);
  assert.equal(receive(1.46,.49,true),.8);
});
