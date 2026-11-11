// WEB-010 比賽結算面板：等級＋分數、戰力六角圖、四個評分面向長條圖、這場數據、文字解說、經驗金幣、全場排名
// gym.html 在開房比賽結束時呼叫 showMatchResult(...)；經驗算好後再呼叫 setMatchReward(...)
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEX = ['攻擊', '攔網', '發球', '接球', '舉球', '穩定'];
const BARS = [['c', '得分貢獻', 35], ['f', '效率', 25], ['p', '參與度', 20], ['r', '位置表現', 20]];
const ROLE = { st: '舉球', rc: '接球', sp: '攻擊', bt: '攔網' };
const GRADE_COL = { S: '#FFD84F', A: '#7CE0A3', B: '#6FB7FF', C: '#C9B6FF', D: '#FF8A80' };

function css() {
  if (document.getElementById('mr-css')) return;
  const s = document.createElement('style'); s.id = 'mr-css';
  s.textContent = `
#mr-panel { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: rgba(8,12,20,.66); padding: 16px; font-family: inherit; }
#mr-panel[hidden] { display: none; }
.mr-box { width: min(880px, 100%); max-height: 100%; overflow: auto; background: #1B2638; color: #fff; border: 1px solid #F2B705; border-radius: 16px; padding: 18px 22px 16px; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
.mr-head { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,.12); }
.mr-grade { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; font-size: 40px; font-weight: 900; color: #1B2638; flex: none; }
.mr-ttl h3 { margin: 0; font-size: 21px; } .mr-ttl p { margin: 4px 0 0; color: #B8C2D0; font-size: 13.5px; }
.mr-score { margin-left: auto; text-align: right; } .mr-score b { font-size: 34px; line-height: 1; } .mr-score small { display: block; color: #B8C2D0; font-size: 12px; margin-top: 2px; }
.mr-mvp { display: inline-block; margin-left: 8px; padding: 2px 9px; border-radius: 999px; background: #F2B705; color: #1B2638; font-size: 13px; font-weight: 900; vertical-align: 3px; }
.mr-cols { display: grid; grid-template-columns: 300px 1fr; gap: 20px; margin-top: 14px; }
.mr-cols h4 { margin: 0 0 8px; font-size: 13.5px; color: #F2B705; letter-spacing: .04em; }
.mr-hex svg { width: 100%; height: auto; display: block; }
.mr-bar { display: grid; grid-template-columns: 112px 1fr 34px; align-items: center; gap: 8px; margin: 7px 0; font-size: 13px; }
.mr-bar small { color: #8C97A8; } .mr-bar i { display: block; height: 10px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; }
.mr-bar i span { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #E39B00, #FFD84F); transition: width .6s; }
.mr-bar b { text-align: right; }
.mr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0; }
.mr-stats div { background: rgba(255,255,255,.06); border-radius: 8px; padding: 6px 4px; text-align: center; } .mr-stats b { display: block; font-size: 18px; } .mr-stats small { color: #B8C2D0; font-size: 11.5px; }
.mr-say { background: rgba(242,183,5,.08); border-left: 3px solid #F2B705; border-radius: 6px; padding: 9px 12px; font-size: 13.5px; line-height: 1.75; }
.mr-say p { margin: 0; }
.mr-reward { display: flex; align-items: center; gap: 12px; margin-top: 12px; font-size: 14px; }
.mr-reward .lv { flex: 1; } .mr-reward .lv i { display: block; height: 8px; border-radius: 5px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 4px; } .mr-reward .lv i span { display: block; height: 100%; background: #6FB7FF; transition: width .8s; }
.mr-reward small { color: #B8C2D0; }
.mr-rank { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.12); }
.mr-rank h5 { margin: 0 0 4px; font-size: 12.5px; color: #B8C2D0; }
.mr-rank div.row { display: flex; align-items: center; gap: 8px; padding: 3px 8px; border-radius: 6px; font-size: 13px; }
.mr-rank div.row.me { background: rgba(242,183,5,.16); } .mr-rank .g { width: 20px; font-weight: 900; } .mr-rank .n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .mr-rank .s { font-variant-numeric: tabular-nums; }
.mr-btns { display: flex; justify-content: flex-end; margin-top: 14px; } .mr-btns button { min-height: 0; padding: 8px 22px; background: #F2B705; color: #1B2638; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; }
`;
  document.head.append(s);
}

// 六角圖（SVG）
function hexSvg(v) {
  const W = 300, H = 270, cx = W / 2, cy = H / 2 + 4, R = 92, pt = (i, k) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k]; };
  const poly = (k) => HEX.map((_, i) => pt(i, k).map((x) => x.toFixed(1)).join(',')).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${poly(k)}" fill="${k === 1 ? 'rgba(255,255,255,.04)' : 'none'}" stroke="rgba(255,255,255,${k === 1 ? 0.3 : 0.13})"/>`).join('');
  const spokes = HEX.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.13)"/>`; }).join('');
  const val = HEX.map((_, i) => pt(i, Math.max(0.04, (v[i] | 0) / 100)).map((x) => x.toFixed(1)).join(',')).join(' ');
  const dots = HEX.map((_, i) => { const [x, y] = pt(i, Math.max(0.04, (v[i] | 0) / 100)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#FFD84F"/>`; }).join('');
  const labels = HEX.map((n, i) => { const [x, y] = pt(i, 1.22); return `<text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle" fill="#DDE3EC" font-size="13" font-weight="700">${n}</text><text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="middle" fill="#F2B705" font-size="12">${v[i] | 0}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="戰力六角圖：${HEX.map((n, i) => `${n} ${v[i] | 0}`).join('、')}">${grid}${spokes}<polygon points="${val}" fill="rgba(242,183,5,.32)" stroke="#FFD84F" stroke-width="2"/>${dots}${labels}</svg>`;
}

// 文字解說：整體一句＋最強項＋最該加強的一項
function commentary(my, st, isMvp) {
  const open = { S: '幾乎完美的一場，攻守都打在高水準！', A: '表現很亮眼，是隊上的重要戰力。', B: '穩定發揮，該做的事都有做到。', C: '有做出貢獻，但還有不少進步空間。', D: '這場比較辛苦，下一場再加油！' }[my.gr] || '';
  const hx = my.hx || [0, 0, 0, 0, 0, 0], top = hx.indexOf(Math.max(...hx));
  const strong = Math.max(...hx) < 30 ? '' : [
    `扣球拿下 ${st.k} 分（攻擊 ${st.sp} 次），進攻火力是你最大的武器。`,
    `攔網得 ${st.b} 分、攔網碰球 ${st.bt} 次，網前很有壓迫感。`,
    `發球 ${st.sv} 次${st.a ? `、直接得 ${st.a} 分` : ''}，${st.es ? `失誤 ${st.es} 次` : '沒有失誤'}，發球很穩。`,
    `接了 ${st.rc} 球${st.eb ? `、只失誤 ${st.eb} 次` : '、沒有失誤'}${st.fs ? `，還救回 ${st.fs} 顆場外球` : ''}，防守很可靠。`,
    `舉球 ${st.st} 次、助攻隊友得 ${st.as} 分，是球隊的指揮官。`,
    `整場失誤只有 ${st.e} 次，打得非常穩。`,
  ][top];
  const low = BARS.map(([k, n]) => [k, n, my[k] | 0]).sort((a, b) => a[2] - b[2])[0];
  const tip = low[2] >= 70 ? '四個面向都很平均，沒有明顯弱點。' : {
    c: '得分貢獻偏低：多找機會進攻、或把球舉給好位置的攻擊手，分數會明顯提高。',
    f: `效率偏低：這場失誤 ${st.e} 次，少一點冒險的球，評分會上升很多。`,
    p: '參與度偏低：碰球次數比隊友少，多跑位、主動去接球。',
    r: `位置表現偏低：你這場主要在${ROLE[my.m] || '打球'}，${{ st: '舉出好球讓攻擊手得分會加分', rc: '接球時注意時機、減少接飛', sp: '多看對面空檔、別硬扣進攔網', bt: '攔網時機再抓準一點' }[my.m] || '多參與自己位置的工作'}。`,
  }[low[0]];
  return `<p>${esc(open)}${isMvp ? '　<b>全場最佳 MVP！</b>' : ''}</p>${strong ? `<p>💪 ${esc(strong)}</p>` : ''}<p>📈 ${esc(tip)}</p>`;
}

// 開面板
export function showMatchResult({ won, final, my, isMvp, st, rate, mvp, teams, myTeam, me, nameOf, teamLabel }) {
  css();
  let d = document.getElementById('mr-panel');
  if (!d) { d = document.createElement('div'); d.id = 'mr-panel'; document.body.append(d); }
  const g = my.gr, col = GRADE_COL[g] || '#fff';
  const rows = (t) => (teams[t] || []).filter((id) => rate[id]).sort((a, b) => rate[b].rt - rate[a].rt).map((id) => `<div class="row${id === me ? ' me' : ''}"><span class="g" style="color:${GRADE_COL[rate[id].gr]}">${rate[id].gr}</span><span class="n">${esc(nameOf(id))}${id === mvp ? ' ⭐' : ''}</span><span class="s">${rate[id].rt}</span></div>`).join('');
  d.innerHTML = `<div class="mr-box" role="dialog" aria-modal="true" aria-labelledby="mr-t">
    <div class="mr-head"><div class="mr-grade" style="background:${col}">${g}</div>
      <div class="mr-ttl"><h3 id="mr-t">${won ? '🏆 贏了！' : '比賽結束'}${isMvp ? '<span class="mr-mvp">⭐ MVP</span>' : ''}</h3><p>${esc(final)}・這場主要負責：${ROLE[my.m] || '—'}</p></div>
      <div class="mr-score"><b>${my.rt}</b><small>整場評分（滿分 100）</small></div></div>
    <div class="mr-cols">
      <section class="mr-hex"><h4>戰力六角圖</h4>${hexSvg(my.hx || [])}</section>
      <section>
        <h4>評分組成</h4>
        ${BARS.map(([k, n, w]) => `<div class="mr-bar"><span>${n} <small>${w}%</small></span><i><span style="width:${my[k] | 0}%"></span></i><b>${my[k] | 0}</b></div>`).join('')}
        <div class="mr-stats">
          <div><b>${st.k}</b><small>扣球得分</small></div><div><b>${st.b}</b><small>攔網得分</small></div><div><b>${st.a}</b><small>發球得分</small></div><div><b>${st.as}</b><small>助攻</small></div>
          <div><b>${st.rc}</b><small>接球</small></div><div><b>${st.fs}</b><small>救球</small></div><div><b>${st.t}</b><small>碰球</small></div><div><b>${st.e}</b><small>失誤</small></div>
        </div>
        <div class="mr-say">${commentary(my, st, isMvp)}</div>
        <div class="mr-reward" data-reward><small>經驗值計算中…</small></div>
      </section>
    </div>
    <div class="mr-rank"><div><h5>${esc(teamLabel(myTeam))}（你們）</h5>${rows(myTeam)}</div><div><h5>${esc(teamLabel(1 - myTeam))}</h5>${rows(1 - myTeam)}</div></div>
    <div class="mr-btns"><button type="button" data-close>確定</button></div></div>`;
  d.hidden = false;
  d.querySelector('[data-close]').onclick = () => { d.hidden = true; };
}

// 經驗、金幣、等級條（record_match 回來後）
export function setMatchReward(r, prog, perLevel = 500) {
  const el = document.querySelector('#mr-panel [data-reward]'); if (!el) return;
  if (!r) { el.innerHTML = '<small>沒有登入帳號，這場不記經驗</small>'; return; }
  const exp = (prog && prog.exp) | 0, lv = Math.floor(exp / perLevel) + 1, inLv = exp % perLevel;
  el.innerHTML = `<b>+${r.exp} 經驗</b><b>+${r.coins} 金幣</b><div class="lv"><small>Lv${lv}${r.levelUp ? '　⬆ 升級了！' : ''}　${inLv} / ${perLevel}</small><i><span style="width:0%"></span></i></div>`;
  requestAnimationFrame(() => { const b = el.querySelector('.lv span'); if (b) b.style.width = `${(inLv / perLevel) * 100}%`; });
}
export function setMatchRewardError(msg) { const el = document.querySelector('#mr-panel [data-reward]'); if (el) el.innerHTML = `<small>${esc(msg)}</small>`; }
