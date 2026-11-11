import { authMode, getAccountService } from './auth.js';
import { bindFriendAction } from './player-menu.js';

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
    info.append(achievements); body.append(img, info); status.textContent = '';
    const action = dialog.querySelector('[data-action]'); action.hidden = false;
    await bindFriendAction(action, nickname, () => dialog.close());
    try { await avatars.preloadAvatars(); if (dialog.open) character.preview(img, data.appearance || '', { jersey: data.team_jersey || null }); }
    catch { status.textContent = '角色預覽載入失敗'; }
  } catch (error) { status.textContent = error.message || '個人檔案載入失敗'; }
}
