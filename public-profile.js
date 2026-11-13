import { authMode, getAccountService } from './auth.js';
import { bindFriendAction } from './player-menu.js';

const grades = ['E','D','C','B','B+','A','A+','S','S+'];
const thresholds = [0,1,10,30,100,250,500,1000,3000];
function masteryPanel(stats) {
  const section = document.createElement('section');
  section.className = 'profile-mastery';
  section.innerHTML = '<h3>四項技能專精</h3><dl></dl><details><summary aria-label="查看技能專精評分說明">？ 評分說明</summary><p>開房比賽結算後，每次達成該項表現累積 1 次。四項分開升級，既有戰績也計入。遊玩時數、練習球數及成就點數不重複加分。</p></details>';
  const details = section.querySelector('details');
  const guide = document.createElement('p');
  guide.textContent = grades.map((g,i) => g + '：' + thresholds[i] + ' 次').join(' ／ ');
  details.append(guide);
  for (const [name,key,metric] of [['攻擊','kills','攻擊得分'],['舉球','assists','舉球助攻'],['攔網','blocks','攔網得分'],['接球','perfects','完美接球']]) {
    const label = document.createElement('dt'), value = document.createElement('dd');
    label.textContent = name;
    if (stats && Number.isFinite(stats[key])) {
      const count = stats[key], i = thresholds.findLastIndex(n => count >= n);
      value.textContent = `${grades[i]} · ${metric} ${count} 次${i < grades.length-1 ? '（距 '+grades[i+1]+' 差 '+(thresholds[i+1]-count)+' 次）' : '（最高級）'}`;
    } else value.textContent = '等待戰績資料';
    section.querySelector('dl').append(label,value);
  }
  return section;
}

export async function openPublicProfile(nickname) {
  const dialog = document.createElement('dialog'); dialog.className = 'public-profile';
  dialog.setAttribute('aria-label', '個人檔案');
  dialog.innerHTML = '<form method="dialog"><header><h2>個人檔案</h2><button aria-label="關閉">✕</button></header></form><p role="status">載入中…</p><div class="profile-body"></div><footer><button type="button" data-action hidden></button></footer>';
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
    info.append(masteryPanel(data.mastery),achievements); body.append(img, info); status.textContent = '';
    const action = dialog.querySelector('[data-action]'); action.hidden = false;
    if (nickname === globalThis.VBSettings?.values.nickname) action.hidden = true;
    else await bindFriendAction(action, nickname, () => dialog.close());
    try { await avatars.preloadAvatars(); if (dialog.open) character.preview(img, data.appearance || '', { jersey: data.team_jersey || null }); }
    catch { status.textContent = '角色預覽載入失敗'; }
  } catch (error) { status.textContent = error.message || '個人檔案載入失敗'; }
}
