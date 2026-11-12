const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const lobby = read('lobby.js'), sql = read('server/supabase/013_last_seen.sql');
const context = { Date, Map };
vm.createContext(context);
vm.runInContext(lobby.slice(lobby.indexOf('function offlineStatus('), lobby.indexOf('async function refreshAccounts(')), context);
const now = Date.parse('2026-11-12T12:00:00Z'), ago = minutes => new Date(now - minutes * 60000).toISOString();
const online = [{id:'b',name:'B',status:'比賽中'},{id:'me',name:'Z',status:'大廳中'},{id:'a',name:'A',status:'練習中'}];
const accounts = [{nickname:'B',last_seen_at:ago(1)},{nickname:'Old',last_seen_at:ago(3000)},{nickname:'New',last_seen_at:ago(12)},{nickname:'Never',last_seen_at:null},{nickname:'New',last_seen_at:ago(15)}];
const merged = context.mergePlayers(online, accounts, 'me', 'Z', now);
assert.equal(merged.map(p=>p.name).join(','), 'Z,A,B,New,Old,Never');
assert.equal(merged.find(p=>p.name==='B').status, '比賽中');
assert.equal(merged.find(p=>p.name==='A').offline, false);
assert.equal(context.mergePlayers([], [{nickname:'Me',last_seen_at:null},{nickname:'Other',last_seen_at:ago(1)}], 'me', 'Me', now)[0].name, 'Me');
for (const [minutes, expected] of [[0,'剛剛'],[4,'剛剛'],[5,'5 分鐘前'],[12,'12 分鐘前'],[59,'59 分鐘前'],[60,'1 小時前'],[180,'3 小時前'],[1439,'23 小時前'],[1440,'1 天前'],[2880,'2 天前']]) {
  assert.equal(context.offlineStatus(ago(minutes),now), `離線・${expected}`);
}
assert.equal(context.offlineStatus(null,now), '離線');
assert.equal(context.offlineStatus('invalid',now), '離線');
assert.match(lobby, /openFriendsPanel\(\(\) => players\.map\(p => p\.name\)\)/);
assert.match(lobby, /if\(!p.self\)row.querySelector\('strong'\).dataset.player=p.name/);
assert.match(lobby, /playerPage\*8,playerPage\*8\+8/);
assert.match(read('lobby.css'), /\.player\.offline \.state/);
assert.match(sql, /add column if not exists last_seen_at timestamptz/i);
assert.match(sql, /revoke insert \(last_seen_at\), update \(last_seen_at\).*from public, anon, authenticated/i);
for (const name of ['touch_seen','lobby_accounts']) {
  assert.match(sql, new RegExp(`function public\\.${name}\\(\\)[\\s\\S]*?security definer set search_path = ''`, 'i'));
  assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(\\) from public, anon, authenticated`, 'i'));
}
assert.equal((sql.match(/grant execute/g)||[]).length,2);
assert.equal((sql.match(/to authenticated;/g)||[]).length,2);
assert.match(sql, /where id = auth.uid\(\)/);
assert.match(sql, /interval '60 seconds'/);
const accountSql = sql.slice(sql.indexOf('create or replace function public.lobby_accounts'), sql.indexOf('revoke all'));
assert.match(accountSql, /returns table \(nickname text, last_seen_at timestamptz\)/);
assert.doesNotMatch(accountSql, /\b(id|email)\b/i);
assert.match(accountSql, /order by p.last_seen_at desc nulls last/);
assert.match(accountSql, /limit 500/);

(async()=>{
  let fail = false, renders = 0;
  context.getAccountService = async()=>({rpc:async name=>{assert.equal(name,'lobby_accounts');if(fail)throw Error('missing 013');return accounts;}});
  context.renderPlayers = ()=>renders++;
  vm.runInContext('let accounts=null;'+lobby.slice(lobby.indexOf('async function refreshAccounts('),lobby.indexOf('function startAccountList(')).replace("const {getAccountService}=await import('./auth.js');",''),context);
  await context.refreshAccounts();
  assert.equal(vm.runInContext('accounts.length',context),accounts.length);
  fail=true;await context.refreshAccounts();
  assert.equal(vm.runInContext('accounts',context),null);
  assert.equal(renders,2);
  assert.equal(context.mergePlayers(online,null,'me','Z',now).map(p=>p.name).join(','),[...online].sort((a,b)=>Number(b.id==='me')-Number(a.id==='me')||a.name.localeCompare(b.name)).map(p=>p.name).join(','));
  const timers=[];let signedIn=true,calls=0;
  const heartbeat={getAccountService:async()=>({signedIn:async()=>signedIn,rpc:async name=>{assert.equal(name,'touch_seen');calls++;throw Error('missing 013');}}),setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;}};
  vm.createContext(heartbeat);
  vm.runInContext(read('last-seen.js').replace(/^import .*;\r?\n/,'').replace('export function','function'),heartbeat);
  heartbeat.startLastSeen();heartbeat.startLastSeen();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(timers.length,1);assert.equal(timers[0].ms,300000);
  await timers[0].fn();assert.equal(calls,2);
  signedIn=false;await timers[0].fn();assert.equal(calls,2);
  assert.match(lobby,/setInterval\(refreshAccounts,2\*60\*1000\)/);
  assert.match(lobby,/setInterval\(renderPlayers,60\*1000\)/);
  assert.match(lobby,/function connectLobby\(\)\{if\(client\)return;startAccountList\(\)/);
  assert.match(read('gym.html'),/import \{ startLastSeen \} from '.\/last-seen.js'; startLastSeen\(\)/);
  console.log('WEB-016 PASS：合併排序、離線文字、失敗退回、好友在線、心跳與 SQL 權限。');
})().catch(error=>{console.error(error);process.exitCode=1;});
