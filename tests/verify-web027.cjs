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
assert(!footer.includes('id="practice"') && footer.includes('id="rank-open"'));   /* 2026-11-19 使用者：排行榜放回底下 */
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
// 6 對 6 是 V 字隊形（使用者 2026-11-19）：自己最前面中間最大，越後面越小、越高；前面的人蓋在後面的人上面
const six = n => { const at = css.indexOf(`[data-mode="6v6"] .slot-${n} { left:`); assert(at >= 0, 'slot-' + n); const rule = css.slice(at, css.indexOf('}', at)); const num = k => Number((rule.match(new RegExp(k + ':([0-9.]+)')) || [])[1]); return [num('left'), num('width'), num('height'), num('bottom'), num('z-index')]; };
const S = [0, 1, 2, 3, 4, 5].map(six);
for (let n = 1; n < 6; n++) { assert(S[n][2] < S[0][2] && S[n][3] > S[0][3] && S[n][4] < S[0][4], '隊友比自己小、站後面、被自己擋住'); assert(S[n][0] >= 0 && S[n][0] + S[n][1] <= 100, '全員放得進舞台'); }
assert(Math.abs(S[0][0] + S[0][1] / 2 - 60) < 1e-9, '自己對齊大廳正中間（舞台 60%）');
const panel = fs.readFileSync('js/character-panel.js', 'utf8');
assert(panel.includes('renderer.clearDepth()') && panel.includes('a[2].bottom - b[2].bottom'), '後面的人先畫、前面的人蓋上去');
console.log('WEB-027B 入口、留言板切換、站位與尺寸比例檢查通過。');
// 大廳炫技（使用者 2026-11-19）：不要按鈕列、改按住 T 開輪盤；動作跟遊戲同一份（js/emote-keys.js 由遊戲程式產生）
assert(!js.includes('lobby-emotes') && !css.includes('#lobby-emotes'), '炫技按鈕列拿掉');
assert(js.includes("e.code !== 'KeyT'") && js.includes("e.code === 'KeyT'") && js.includes('P.myWheel()'), '按住 T 開輪盤、放開做動作，輪盤內容跟遊戲一樣');
assert(panel.includes("from './emote-keys.js'") && !panel.includes("'sway'"), '大廳用遊戲的動作，不再是簡化版跳／轉／搖');
require('node:child_process').execFileSync(process.execPath, ['tools/build-emote-keys.cjs', '--check'], { stdio: 'inherit' });
import('../js/emote-keys.js').then(m => {
  for (const k of Object.keys(m.EMO_KEYS)) for (const dir of [1, -1]) for (let t = 0; t <= m.emoKeyDuration(k) + 0.1; t += 0.05) {   // 左右都要測（往左鏡像曾當掉）
    const p = m.emoKeySample(k, t, dir).pose; for (const f of ['sh', 'el', 'hip', 'kn', 'hab', 'ankle', 'head']) assert(p[f].flat().every(Number.isFinite), `${k} ${dir} ${t} ${f}`);
    assert([p.sp, p.tw, p.lean].every(Number.isFinite), `${k} ${dir} ${t}`);
  }
  console.log('大廳炫技：T 輪盤、遊戲動作、左右鏡像檢查通過。');
}).catch(e => { console.error(e); process.exit(1); });
