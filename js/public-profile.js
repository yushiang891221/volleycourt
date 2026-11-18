import { authMode, getAccountService } from './auth.js';
import { bindFriendAction } from './player-menu.js';

const grades = ['E','D','C','B','B+','A','A+','S','S+'];
// 門檻拉開（2026-11-19 使用者反映原本 0/1/10/30/100… 太快達成）；攔網本來就少，另用一組較低的門檻
const thresholds = [0, 1, 30, 150, 400, 1000, 2500, 5000, 10000];
const blockThresholds = [0, 1, 10, 40, 100, 250, 600, 1200, 2500];
// 四項技能專精：照「分級表」排（2026-11-18 使用者要求）——每項一張卡，E～S+ 九級一級一行，寫這一級要累積幾次和代表什麼程度；
//   已經達到的級數正常顯示、現在這一級標亮並附進度條、還沒到的變淡。上面是四個段位的顏色說明（評分說明 2026-11-18 使用者要求拿掉）
const tierOf = (g) => /^S/.test(g) ? 's' : /^A/.test(g) ? 'a' : /^B/.test(g) ? 'b' : 'ce';
const SKILLS = [
  ['攻擊', 'kills', '攻擊得分', ['還沒有攻擊得分，先練助跑和起跳時機', '拿下第一記攻擊得分', '舉到位的球能扣進場內', '攻擊成為隊上穩定的得分來源', '好球能打出威脅，偶爾打穿攔網', '會看攔網選線、變化落點', '高球、後排攻擊也能得分', '多數舉球都能轉成有威脅的攻擊', '關鍵分交給你的王牌攻擊手']],
  ['舉球', 'assists', '舉球助攻', ['還沒有助攻，先把球穩穩送高', '舉出第一次助攻', '能把球送到攻擊手打得到的位置', '隊友常靠你的舉球得分', '能配合不同攻擊手的習慣', '快攻、長攻都舉得出來', '球質穩定，助攻成為日常', '掌握進攻節奏的場上指揮', '讓每個攻擊手都變強的傳說舉球員']],
  ['攔網', 'blocks', '攔網得分', ['還沒攔到分，先抓起跳時機', '拿下第一次攔網得分', '能在對的時間跳起來封網', '攔網開始讓對手頭痛', '會跟隊友併步、一起攔', '會看舉球位置選擇攔哪條線', '預判攻擊方向，常常直接攔死', '網前的一道牆', '對手不敢正面硬打的攔網傳說']],
  ['接球', 'perfects', '完美接球', ['還沒有完美接球，先練好站位', '第一次完美接球', '一般發球大多能接到位', '強攻也碰得起來', '防守觀念成形，常常接到位', '重扣也能穩定接到位', '救球範圍大，能幫隊友補位', '後場的鐵壁', '什麼球都撈得起來的防守傳說']],
];
function masteryPanel(stats) {
  const section = document.createElement('section');
  section.className = 'profile-mastery';
  section.innerHTML = '<h3>四項技能專精</h3><div class="pm-legend"><span class="pm-t-ce">C–E<small>入門</small></span><span class="pm-t-b">B<small>穩定</small></span><span class="pm-t-a">A<small>進階</small></span><span class="pm-t-s">S<small>頂尖</small></span></div><div class="pm-grid"></div>';
  const grid = section.querySelector('.pm-grid');
  for (const [name, key, metric, lines] of SKILLS) {
    const card = document.createElement('article'); card.className = 'pm-card';
    const steps = key === 'blocks' ? blockThresholds : thresholds;
    const has = stats && Number.isFinite(stats[key]), count = has ? stats[key] : 0, cur = has ? steps.findLastIndex((n) => count >= n) : -1;
    const head = document.createElement('header');
    head.innerHTML = `<b>${name}</b><span>${has ? `${grades[cur]}・${metric} ${count} 次` : '等待戰績資料'}</span>`;
    card.append(head);
    const list = document.createElement('ol');
    grades.forEach((g, i) => {
      const li = document.createElement('li'); li.className = `pm-t-${tierOf(g)}` + (i === cur ? ' now' : i > cur ? ' todo' : '');
      li.innerHTML = `<i>${g}</i><span>${lines[i]}</span><em>${steps[i]} 次</em>`;
      if (i === cur) {
        const next = steps[i + 1], prev = steps[i], bar = document.createElement('div'); bar.className = 'pm-bar';
        bar.innerHTML = next ? `<s style="width:${Math.min(100, ((count - prev) / (next - prev)) * 100).toFixed(1)}%"></s><small>距 ${grades[i + 1]} 差 ${next - count} 次</small>` : '<s style="width:100%"></s><small>已經是最高級</small>';
        li.append(bar);
      }
      list.append(li);
    });
    card.append(list); grid.append(card);
  }
  return section;
}

export async function openPublicProfile(nickname) {
  // 加好友按鈕放右上角、關閉鈕旁邊（2026-11-18 使用者要求；原本在最下面要捲到底才看得到）
  const dialog = document.createElement('dialog'); dialog.className = 'public-profile';
  dialog.setAttribute('aria-label', '個人檔案');
  dialog.innerHTML = '<form method="dialog"><header><h2>個人檔案</h2><div class="pp-acts"><button type="button" data-action hidden></button><button aria-label="關閉">✕</button></div></header></form><p role="status">載入中…</p><div class="profile-body"></div>';
  document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
  const status = dialog.querySelector('[role=status]');
  try {
    if (authMode() !== 'account') { status.textContent = '要登入才能看個人檔案'; return; }
    const service = await getAccountService();
    if (!service || !(await service.signedIn())) { status.textContent = '要登入才能看個人檔案'; return; }
    const data = await service.rpc('public_profile', { p_nickname: nickname });
    if (!dialog.open) return;
    if (!data) { status.textContent = '找不到這個暱稱'; return; }
    const [P, character, avatars] = await Promise.all([import('./progress.js'), import('./character-panel.js'), import('./avatar-toy.js')]);
    if (!dialog.open) return;
    const body = dialog.querySelector('.profile-body');
    const img = document.createElement('img'); img.alt = `${data.nickname} 的角色`; img.width = 240; img.height = 300;
    const info = document.createElement('section');
    const unlocked = [...new Set(data.achievements || [])].filter(id => P.ACHIEVEMENTS[id]);
    for (const text of [data.nickname, `Lv${P.levelOf(data.exp)}`, `稱號　${P.ACHIEVEMENTS[data.title]?.title || '未套用'}`, `球隊　${data.team_name || '未加入'}`, `勝場 ${data.wins || 0} ／ 敗場 ${data.losses || 0}`, `成就 ${unlocked.length} ／ ${Object.keys(P.ACHIEVEMENTS).length}`]) {
      const line = document.createElement('p'); line.textContent = text; info.append(line);
    }
    const achievements = document.createElement('ul'); achievements.className = 'profile-achievements';
    for (const id of unlocked) {
      const item = document.createElement('li'); item.textContent = `${P.ACH_SERIES.find(series => series.tiers.includes(id))?.icon || '🏆'} ${P.ACHIEVEMENTS[id].name}`; achievements.append(item);
    }
    info.append(achievements); body.append(img, info, masteryPanel(data.mastery)); status.textContent = '';
    const action = dialog.querySelector('[data-action]'); action.hidden = false;
    if (nickname === globalThis.VBSettings?.values.nickname) action.hidden = true;
    else await bindFriendAction(action, nickname, () => dialog.close());
    try { await avatars.preloadAvatars(); if (dialog.open) character.preview(img, data.appearance || '', { jersey: data.team_jersey || null }); }
    catch { status.textContent = '角色預覽載入失敗'; }
  } catch (error) { status.textContent = error.message || '個人檔案載入失敗'; }
}
