import { getAccountService } from './auth.js';
import { loadProgress } from './progress.js';
let dialog, busy = false;
export async function openFeedback() {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'feedback-panel';
    dialog.setAttribute('aria-labelledby','feedback-title');
    dialog.innerHTML = `<form>
      <span class="eyebrow">YOUR VOICE MATTERS</span>
      <h2 id="feedback-title">匿名建議信箱</h2>
      <p>有想改善的玩法、遇到的問題，或想對我們說的話嗎？</p>
      <p><b>成功送出可獲得 500 金幣，每個帳號每週限一次。</b><br>台灣時間每週一 00:00 重置。</p>
      <p class="muted">建議會寄給開發者，信中不附姓名、帳號或 Email。系統另記本週是否領獎。若想保持匿名，請勿在內容留下個人資料。</p>
      <label for="feedback-body">你的建議（10～2000 字）</label>
      <textarea id="feedback-body" rows="7" maxlength="4000" required placeholder="例如：希望練習模式可以調整球速，讓剛加入的玩家更容易熟悉接球……" style="display:block;box-sizing:border-box;width:100%;resize:vertical;padding:12px;font:inherit;color:inherit;background:rgba(0,0,0,.2);border:1px solid #748778;border-radius:10px"></textarea>
      <p data-count class="muted">0 / 2000 字</p>
      <p data-status role="status" aria-live="polite"></p>
      <div class="buttons"><button type="button" data-close>關閉</button><button class="orange" data-submit disabled>送出建議，領取 500 金幣</button></div>
    </form>`;
    document.body.append(dialog);
    const input = dialog.querySelector('textarea');
    input.addEventListener('input',()=>{input.setCustomValidity('');dialog.querySelector('[data-count]').textContent=`${[...input.value.trim()].length} / 2000 字`;});
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.querySelector('form').addEventListener('submit',submit);
  }
  if (dialog.open) return;
  dialog.showModal();
  const status = dialog.querySelector('[data-status]'), button = dialog.querySelector('[data-submit]');
  button.disabled=true;status.textContent='正在確認本週資格…';
  try {
    const service = await getAccountService(), state = await service.feedbackStatus();
    status.textContent=state.submitted ? '本週已送出建議並領取獎勵，下週一再來分享！' : '本週尚未送出建議，成功送出即可領取 500 金幣。';
    button.disabled=state.submitted;
    dialog.querySelector('textarea').disabled=state.submitted;
  } catch(error) { status.textContent=error.message; }
}
async function submit(event) {
  event.preventDefault();
  if(busy)return;
  const input=dialog.querySelector('textarea'), status=dialog.querySelector('[data-status]');
  const button=dialog.querySelector('[data-submit]'), close=dialog.querySelector('[data-close]');
  const body=input.value.trim(), length=[...body].length;
  if(length<10 || length>2000){input.setCustomValidity('請填寫 10～2000 字的建議。');input.reportValidity();return;}
  busy=true;button.disabled=true;close.disabled=true;input.disabled=true;status.textContent='正在送出，請稍候…';
  let accepted=false;
  try {
    const service=await getAccountService();
    const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await service.accessToken()}`},body:JSON.stringify({body}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || '送出失敗，請稍後再試。');
    if(!result.submitted && !result.alreadySubmitted)throw new Error('無法確認結果，請重新開啟面板查詢。');
    accepted=true;
    status.textContent=result.alreadySubmitted ? '本週已送出並領取過獎勵，不會重複扣除資格或發獎。' : '謝謝你的建議！已成功收件，500 金幣已入帳。';
    input.value='';dialog.querySelector('[data-count]').textContent='0 / 2000 字';
    await loadProgress();
  } catch(error) { status.textContent=error.name==='TimeoutError' ? '連線逾時，請重新開啟面板確認本週是否已送出。重試不會重複發獎。' : error.message; }
  finally { busy=false;close.disabled=false;button.disabled=accepted;input.disabled=accepted; }
}
