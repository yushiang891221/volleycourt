import { getAccountService } from './auth.js';

let timer = null;
export function startLastSeen() {
  if (timer !== null) return;
  const touch = async () => {
    try {
      const service = await getAccountService();
      if (service && await service.signedIn()) await service.rpc('touch_seen');
    } catch { /* 尚未執行 013 或網路中斷，不影響頁面。 */ }
  };
  touch();
  timer = setInterval(touch, 5 * 60 * 1000);
}
