const assert = require('node:assert/strict'), fs = require('node:fs');
const h = fs.readFileSync('index.html','utf8'), js = fs.readFileSync('js/lobby-ranked.js','utf8'), css = fs.readFileSync('css/lobby-ranked.css','utf8');
for (const tab of ['home','custom']) assert(h.includes(`data-page="${tab}"`));
assert(h.includes('id="tab-team"') && !h.includes('data-page="rank"') && !h.includes('tab-locker'));   /* 2026-11-19 使用者：上方只留大廳、自訂房間、練習、球隊 */
const custom=h.split('<section id="custom-page"')[1].split('</section>')[0];
for(const id of ['create','quick','filter','refresh','rooms','rooms-prev','rooms-next']) assert(custom.includes(`id="${id}"`),id);
assert(!h.includes('id="character-info"'));
for(const api of ['window.PlayOneLobby','setParty(','setMyRating(','setMatchState(','onStartMatch']) assert(js.includes(api),api);
assert(js.includes("matchMedia('(pointer: coarse), (max-width: 819px)')"));
assert(js.includes('mobile.matches ? party.slice(0, 1) : party'));
assert(css.includes('.avatar-card'));
assert(js.includes('!match.canAI'));   /* WEB-029：「直接用 AI 開打」改看伺服器給的 canAI（等滿 10 秒） */
console.log('WEB-027 結構檢查通過；互動與手機畫面由 capture-web027.cjs 驗證。');

// WEB-027B：入口唯一、預設收合與收合切換。
assert.equal((h.match(/id="practice"/g) || []).length, 1);
assert(h.split('</header>')[0].includes('id="practice"'));
const footer = h.split('<footer')[1].split('</footer>')[0];
assert(!footer.includes('id="practice"') && !footer.includes('天梯排行榜'));
assert(h.includes('chat panel is-collapsed'));
assert(h.includes('aria-expanded="false" aria-controls="messages chat"'));
assert(css.includes('.messages > :not(:last-child)'));
assert(css.includes('width:max-content'));
assert(js.includes("' is-self'"));
const lobby = fs.readFileSync('js/lobby.js', 'utf8');
let handler, collapsed = true;
const toggle = { setAttribute(k,v) { this[k] = v; }, addEventListener(k,fn) { handler = fn; } };
const messages = { scrollHeight: 123 };
require('node:vm').runInNewContext(lobby.slice(lobby.indexOf("$('chat-toggle').addEventListener")), {
 $: id => id === 'chat-toggle' ? toggle : messages,
 document: { querySelector: () => ({ classList: { toggle: () => collapsed = !collapsed } }) }
});
handler(); assert.equal(toggle['aria-expanded'], 'true'); assert.equal(toggle.textContent, '收合');
assert.equal(messages.scrollTop, 123);
handler(); assert.equal(toggle['aria-expanded'], 'false'); assert.equal(toggle.textContent, '展開');
// 將實際 CSS 的站位尺寸代入不同舞台高度，驗證排間留白與角色視窗比例。
assert(css.includes('height:calc(53% - 10px)'));
assert(css.includes('height:42.4%; bottom:3%'));
assert(css.includes('inset:40px 0 0'));
for (const height of [240, 320, 400, 480, 720, 1080]) {
 const backBottom = height * .424;
 const selfTop = height * .97 - (height * .53 - 10);
 assert(selfTop >= backBottom, '前排名牌不可進入後排視窗');
 assert(Math.abs((height * .53 - 50) / (height * .424 - 40) - 1.25) < 1e-9);
 assert(Math.abs((height * .9 - 50) / (height * .72 - 40) - 1.25) < 1e-9);
}
console.log('WEB-027B 入口、留言板切換、站位與尺寸比例檢查通過。');
