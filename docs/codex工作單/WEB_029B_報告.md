# WEB-029B 網頁端報告

日期：2026-11-19。分支：`game-site`。

## 狀態

網頁端可寫入的部分已完成，但**尚未完成可開賽驗收**：`js/room-settings.js` 寫入遭 EPERM 拒絕，`startPlanned` 仍待 Claude 套用下方程式。未修改權限、未繞過限制，未修改 server 檔案，未暫存、提交、推送或部署。

## 已修改

- `js/lobby-party.js`：接上 mm-start、mm-cancel、mm-ai-now，開始與 AI 按鈕仍限制隊長；任何隊員可取消。
- `js/lobby.js`：接收 mm-status／mm-error／mm-found，保存 `{room, mode, me, plan}` 到 sessionStorage `vb.ranked`，使用 VBLobby.carry 帶參數跳轉，只有指定房主帶 host=1。儲存失敗會提示而不跳到缺少計畫的房間。
- `js/lobby-ranked.js`：隊員配對中可取消；AI 按鈕依伺服器 canAI；返回 `#lobby` 時選大廳分頁。
- `src/gym/game/07-net.js`：ranked=1 使用網址 me，嚴格限制 1～40 個英數、底線、連字號；房主確認身分後等真人到齊，或最多 15 秒，未到座位改 null，取第一個 type=vb 球場呼叫 startPlanned；關閉連線時清除計時器。若方法尚未部署，顯示錯誤而不拋例外。
- `js/room-flow-ui.js`：ranked 房隱藏準備、開始、選位與房主設定；顯示到場人數及雙方名單／AI 等級，開賽後顯示比賽中。此版本沒有邀請連結按鈕，另已取消 ranked 進房時的邀請提示。
- `js/match-result.js`：ranked 結算按確定或顯示後 20 秒回 VBLobby.home()，清除本場計畫、選大廳分頁；不送 party-leave，沿用伺服器保留的隊伍與原本 party-sync。
- `gym.html`：已執行 build-gym 更新。
- `tests/verify-web029b.cjs`：原本不存在，新增大廳訊息、儲存、網址、carry、隊員取消及 startPlanned／receive 往返與錯誤資料拒絕測試。

沒有改動玩法、碰撞判定、AI 或手感。新增遊戲行為均以 ranked=1 限定。

## Claude 必須補上的方法

檔案：`js/room-settings.js`。位置：回傳物件內 `toggleReady`／`pick` 之後、現有 `begin(){` 之前。插入以下程式（保留原本 begin 與 receive）：

```js
      startPlanned({picks,court,count:n,lv:level,to:points,bestOf:best}={}){
        if(!settled||host()!==id||flow.phase!=='waiting'||!Number.isInteger(n)||n<1||n>6||!validLv(level)||!validTo(points)||!validBest(best)||typeof court!=='string'||!court||!Array.isArray(picks)||picks.length!==n*2)return false;
        const ready=picks.filter(x=>x!==null);
        if(new Set(ready).size!==ready.length||!ready.every(x=>typeof x==='string'&&order.includes(x)))return false;
        count=n;lv=level;to=points;bestOf=best;
        flow={phase:'playing',ready,picks:[...picks],court,deadline:0,round:flow.round+1};commit();return true;
      },
```

此方法僅允許已確認房主在 waiting 階段使用。真人不得重複且須存在 order；ready 從 picks 產生，因此可通過既有 receive 的真人、座位長度與 ready 檢查；不需放寬 receive。

## 建置與測試

- `node tools/build-gym.cjs`：成功。
- `node tools/build-headless.cjs`：已執行，但寫入 `server/match/game-core.mjs` 遭 EPERM 拒絕，請 Claude 重跑。
- `node tests/verify-web029b.cjs`：大廳訊息、隊員取消、sessionStorage、網址及 carry 通過；startPlanned 尚未寫入，所以該檢查失敗，沒有略過或假裝通過。
- 全套測試結果待執行完成後補入。
- `git diff --check`：通過。

## 尚未完成

1. Claude 套用上述 startPlanned，再重跑 build-headless 及兩個指定測試命令。
2. 實際雙分頁／伺服器端到端驗收與截圖未執行；目前方法缺失使完整開賽流程不能驗收。需驗證單排 AI、兩人組隊同隊、6v6、15 秒缺席補位、結算後隊伍保留及一般房／練習不變。
3. 無法從此環境讀取 Codex 剩餘用量百分比；採有限範圍實作與一次全套檢查，交接後停止。
