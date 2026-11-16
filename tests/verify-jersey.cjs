// 個人球衣客製 J1：代碼格式、文字過濾、現成配色、18 款花紋與各種版位都畫得出來（用假畫布，不需要瀏覽器）
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const J = await import(pathToFileURL(path.join(__dirname, '../js/jersey.js')).href);
  const ok = (msg) => console.log('PASS ' + msg);

  // 數量跟企劃一樣
  assert.equal(J.STYLES.length, 18); assert.equal(J.PALETTE.length, 28); assert.equal(J.PRESETS.length, 6); assert.equal(J.FONTS.length, 8);
  for (const c of J.PALETTE) assert.match(c, /^#[0-9A-F]{6}$/);
  for (const p of J.PRESETS) for (const k of ['body', 'accent', 'trim', 'ink', 'shorts']) assert(p[k] >= 0 && p[k] < J.PALETTE.length, p.name + k);
  ok('18 款樣式、28 色、6 組配色、8 種字體');

  // 代碼來回一樣；每個欄位每個值都試
  const all = [];
  for (let style = 0; style < J.STYLES.length; style++) for (let p = 0; p < J.PRESETS.length; p++)
    all.push(J.applyPreset({ style, neck: style % 2, layout: style % 4, font: style % 8, backIcon: !!(style % 2), shortsNum: !(p % 2), front: '台北排球', back: 'KEVIN' }, p));
  for (let cut = 0; cut < J.CUTS.length; cut++) all.push({ cut, style: 9, front: '', back: '' });
  for (const d of all) { const code = J.encodeJersey(d), back = J.decodeJersey(code); assert.deepEqual(back, J.normalizeJersey(d), code); assert.equal(J.encodeJersey(back), code); }
  assert.equal(J.normalizeJersey({ neck: 1 }).neck, 0, '全部圓領'); assert.equal(J.decodeJersey('j1104' + '9h707003~~').neck, 0);
  assert.equal(J.LAYOUTS[2], null, '左胸小字＋號碼拿掉了'); assert.equal(J.normalizeJersey({ layout: 2 }).layout, 1, '舊的左胸小字變成大字＋號碼'); assert.equal(J.decodeJersey('j10049h707203~早安~').layout, 1);
  assert.deepEqual(J.CUTS, ['短袖', '長袖', '短版', '無袖']); assert.deepEqual(J.CUT_TOP, [1, 2, 3, 0]);
  ok(`代碼來回一致（${all.length} 種）`);

  // 壞代碼一律不收
  for (const bad of [null, '', 'j1', 'j0000000000000~~', 'j1zzzzzzzzzzz~~', 'j100c9h707003~a~b~c', 'j100c9h707003~一二三四五六七八九~', 'j100c9h707003~\u0001~']) assert.equal(J.decodeJersey(bad), null, String(bad));
  ok('壞代碼、超過 8 字、控制字元都不收');

  // 文字過濾
  assert.equal(J.sanitizeText('  台北~排球\u0007隊  '), '台北排球隊');
  assert.equal(J.sanitizeText('一二三四五六七八九十'), '一二三四五六七八');
  assert.equal(J.sanitizeText('😀😀😀😀😀😀😀😀😀'), '😀'.repeat(8), '表情符號算一個字');
  assert.equal(J.sanitizeText(null), '');
  ok('文字：去掉 ~ 和控制字元、最多 8 字');

  // 顏色：白色號碼配深色外框、深色號碼配白色外框；肩膀撞色袖子用花紋色
  assert.equal(J.jerseyColors(J.applyPreset({}, 0)).inkEdge, '#141414');
  assert.equal(J.jerseyColors(J.applyPreset({}, 2)).inkEdge, '#FFFFFF');
  assert.equal(J.jerseyColors({ ...J.applyPreset({}, 0), style: 11 }).sleeve, J.PALETTE[J.PRESETS[0].accent]);
  ok('號碼外框對比色、撞色袖子');

  // 不雅字：網頁與資料庫（supabase/017_my_jerseys.sql）清單一樣；去掉空白、標點、大小寫也擋得到
  const fs = require('node:fs'), sqlDir = path.join(__dirname, '../supabase'), read = (f) => fs.readFileSync(path.join(sqlDir, f), 'utf8');
  const sqlFiles = fs.readdirSync(sqlDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort(), sql = read('017_my_jerseys.sql');
  const latest = read(sqlFiles.filter((f) => /jersey_code_ok/.test(read(f))).pop());
  const sqlWords = [...sql.match(/unnest\(array\[([\s\S]*?)\]\) w/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlWords, J.BAD_WORDS, '網頁和資料庫的不雅字清單要一樣');
  for (const t of ['F u c k', '靠.北', 'SHIT', '幹你!']) assert(J.badWord(t), t);
  for (const t of ['台北排球', 'KEVIN', '幹部', '操場', '']) assert.equal(J.badWord(t), null, t);
  assert.equal(J.jerseyProblem({ back: 'shit' }), '背面名字有不適合的字，請換一個'); assert.equal(J.jerseyProblem({ front: '台北' }), '');
  // 網頁做得出來的每一件，資料庫的格式檢查都要收（照 SQL 的正規式）
  const sqlRe = new RegExp(latest.match(/select c ~ '([^']+)'/)[1]);   // 最新的那版格式檢查
  for (const d of all) assert.match(J.encodeJersey(d), sqlRe);
  assert(!sqlRe.test('j1zzzzzzzzzzz~~') && !sqlRe.test('j100c9h707003~一二三四五六七八九~'));
  ok('不雅字清單網頁＝資料庫、網頁做得出來的球衣資料庫都收');

  // 假畫布：記錄畫了什麼，確定每一款都有畫、不會出錯、不會畫到畫布外太遠
  function fakeCtx(w, h) {
    const log = { calls: 0, texts: [], fills: 0, out: 0 };
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get(t, k) {
        if (k === 'log') return log;
        if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        if (k in t) return t[k];
        return (...a) => {
          log.calls++;
          if (k === 'fillText') log.texts.push(a[0]);
          if (k === 'fill' || k === 'fillRect' || k === 'stroke') log.fills++;
          if ((k === 'fillRect' || k === 'moveTo' || k === 'lineTo' || k === 'arc') && (a[0] < -w || a[0] > 2 * w || a[1] < -h || a[1] > 2 * h)) log.out++;
        };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    return ctx;
  }
  for (let style = 0; style < J.STYLES.length; style++) for (let layout = 0; layout < J.LAYOUTS.length; layout++) {
    const x = fakeCtx(1024, 700);
    J.drawJerseyTorso(x, 1024, 700, { style, layout, neck: 1, front: '台北排球', back: 'KEVIN' }, 7);
    const L = x.log;
    assert(L.fills > 3, `${style}/${layout} 有畫東西`);
    assert.equal(L.out, 0, `${style}/${layout} 沒畫到畫布外`);
    assert(L.texts.filter((t) => t === '7').length >= 3, `${style}/${layout} 正面一個號碼＋背面左右兩半`);
    assert(L.texts.filter((t) => t === 'KEVIN').length === 2, `${style}/${layout} 背面名字左右兩半各一次`);
    if (layout > 0) assert(L.texts.some((t) => '台北排球'.includes(t)), `${style}/${layout} 正面字`);
  }
  // 同一款畫兩次一模一樣（花紋的亂數固定，別人看到的跟你一樣）
  const a = fakeCtx(512, 300), b = fakeCtx(512, 300);
  J.drawJerseyTorso(a, 512, 300, { style: 16 }, 3); J.drawJerseyTorso(b, 512, 300, { style: 16 }, 3);
  assert.equal(a.log.calls, b.log.calls);
  ok('18 款 × 4 種版位都畫得出來、背面名字跟號碼都在、花紋每次一樣');
})().catch((e) => { console.error(e); process.exit(1); });
