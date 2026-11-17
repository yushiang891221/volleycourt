// 加到主畫面（安裝成 App）用的最小 Service Worker：只處理「打開頁面」這一種請求，一律走網路（不快取，更新馬上生效）；
// 網路斷掉時給一個簡單的提示頁。其他請求（圖片、程式、連線）完全不碰。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111B2B;color:#fff;font:700 20px sans-serif">沒有網路：連上網路後再打開 Play One</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
