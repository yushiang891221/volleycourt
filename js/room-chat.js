/* Register before game keyboard listeners, including capture listeners. */
(() => {
  'use strict';
  let api, panel, log, input, observer, visibilityObserver, opened = false, lastSent = -Infinity;
  const swallowed = new Set();
  const clean = value => typeof value === 'string' ? [...value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').trim()].slice(0, 60).join('') : '';
  function build() {
    panel = document.createElement('section'); panel.className = 'room-chat';
    panel.setAttribute('aria-label', '房間聊天');
    log = document.createElement('div'); log.className = 'room-chat-log'; log.setAttribute('role', 'log');
    input = document.createElement('input'); input.hidden = true;
    input.setAttribute('aria-label', '聊天訊息，最多 60 字'); input.placeholder = 'Enter 送出 · Esc 取消 · 最多 60 字';
    input.autocomplete = 'off';
    input.addEventListener('input', e => { if (!e.isComposing) input.value = [...input.value].slice(0, 60).join(''); });
    panel.append(log, input); api.mount().append(panel);
    if (window.ResizeObserver) {
      observer = new ResizeObserver(layout);
      for (const el of [api.mount(), document.getElementById('vm-hud'), document.getElementById('wk-keys'), document.getElementById('zcard')]) if (el) observer.observe(el);
    }
    if (window.MutationObserver) {
      visibilityObserver = new MutationObserver(layout);
      for (const id of ['vm-hud', 'wk-keys', 'zcard']) {
        const el = document.getElementById(id);
        if (el) visibilityObserver.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
      }
    }
    layout();
  }
  function layout() {
    if (!panel || !api.mount().getBoundingClientRect) return;
    const stage = api.mount().getBoundingClientRect();
    const hud = document.getElementById('vm-hud'), keys = document.getElementById('wk-keys'), card = document.getElementById('zcard');
    let bottom = 72;
    for (const el of [keys, card]) {
      if (el && !el.hidden && !el.classList.contains('out')) {
        const rect = el.getBoundingClientRect();
        if (rect.height) bottom = Math.max(bottom, stage.bottom - rect.top + 8);
      }
    }
    const top = hud && !hud.hidden ? hud.getBoundingClientRect().bottom - stage.top + 8 : 100;
    panel.style.bottom = `${bottom}px`;
    log.style.maxHeight = `${Math.max(0, Math.min(200, stage.height - bottom - top - 44))}px`;
  }
  function close() {
    if (!opened) return;
    opened = false; input.value = ''; input.hidden = true; input.blur();
    panel.classList.remove('typing'); api.release();
  }
  function receive(data, from) {
    if (!api?.online() || !data || typeof from !== 'string') return;
    const text = clean(data.t), name = clean(data.n) || '玩家';
    if (!text) return;
    if (!panel) build();
    const row = document.createElement('div'); row.className = 'room-chat-line';
    if (from === api.identity().id) row.classList.add('self');
    row.textContent = `${name}：${text}`; log.append(row);
    while (log.children.length > 6) log.firstElementChild.remove();
    layout(); log.scrollTop = log.scrollHeight;
    setTimeout(() => row.classList.add('expired'), 8000);
    api.bubble(from, text);
  }
  function send() {
    const text = clean(input.value), now = performance.now();
    if (!text || !api.online() || now - lastSent < 1000) return;
    const data = { ...api.identity(), t: text };
    try { api.publish(data); } catch (_) { api.notice('聊天送出失敗，請稍後再試'); return; }
    lastSent = now; receive(data, data.id);
  }
  addEventListener('keydown', e => {
    const enter = e.key === 'Enter', token = e.code || e.key;
    if (!opened) {
      if (!enter || !api?.online() || !api.available() || e.target?.closest?.('input,textarea,select,[contenteditable="true"],dialog')) return;
      e.preventDefault(); e.stopImmediatePropagation(); swallowed.add(token);
      if (e.repeat || e.isComposing || e.keyCode === 229) return;
      if (!panel) build();
      opened = true; api.hold(); panel.classList.add('typing'); input.hidden = false; layout(); input.focus();
      return;
    }
    e.stopImmediatePropagation(); swallowed.add(token);
    if (e.isComposing || e.keyCode === 229) return;
    if (enter || e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (enter) send();
      close();
    }
  }, true);
  addEventListener('keyup', e => {
    const token = e.code || e.key;
    if (opened || swallowed.has(token)) { e.stopImmediatePropagation(); swallowed.delete(token); }
  }, true);
  window.RoomChat = {
    configure(options) { api = options; }, receive, close,
    reset() { close(); observer?.disconnect(); visibilityObserver?.disconnect(); panel?.remove(); panel = log = input = null; },
    get isOpen() { return opened; }
  };
})();
