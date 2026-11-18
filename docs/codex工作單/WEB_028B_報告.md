# WEB-028B 大廳組隊報告

日期：2026-11-19。分支：game-site。

## 已完成

- 新增 `js/lobby-party.js`，沿用大廳 WebSocket 發送組隊訊息；登入進大廳與重新連線後，於 hello 之後送 party-sync。
- 收到 party 後以自己為第一筆，其餘維持伺服器順序交給 PlayOneLobby.setParty；顯示隊長、定級中與斷線中。
- 空位開啟在線好友／最近隊友／球隊成員清單，左側邀請直接送出。以完整在線名單對應連線 ID，排除自己、現有隊員、比賽與房間中的玩家；送出前重新確認在線狀態。
- 最近一起組隊的十位球友暱稱保存在 localStorage，讀寫及 JSON 解析均容錯；非十場比賽紀錄，本次不介入遊戲。
- 邀請彈窗包含接受、拒絕與依實際時間計算的 30 秒倒數，過期自動關閉；Esc 視為拒絕。
- 複製邀請連結；剪貼簿拒絕時顯示手動複製視窗。帶 party 參數的網址在登入進大廳後自動加入，送出成功後只移除 party 參數，保留其他參數與錨點。
- 隊長可請出隊友、切模式、使用開始配對回呼；隊員顯示「等隊長開始」，可離隊。模式以伺服器確認為準，避免遭拒後畫面切錯。
- 外觀變動送 party-look，恢復隊伍與以連結建立隊伍時補同步外觀。
- 手機沿用頭像卡片，隊伍操作與主要按鈕至少 44px，邀請視窗可捲動。

## 檔案與測試

- 修改：index.html、js/lobby.js、js/lobby-ranked.js、css/lobby-ranked.css。
- 新增：js/lobby-party.js、tests/verify-web028b.cjs。
- 保留 tests/verify-web028.cjs 全部既有伺服器案例，僅增加同步 self、rating null、外觀廣播斷言。
- tests/verify-web002-state.cjs 的瀏覽器替身補上 window、微任務與事件全域，保留全部原案例，新增 party-sync 斷言。
- WEB-027、WEB-028、WEB-028B、WEB-002 state 檢查通過；三個前端 JS 語法檢查通過。
- 修改前全套基準：46 項，38 通過、7 個既知舊失敗，以及 verify-controls-ui 的 CDP timeout: Page.enable（退出碼 1）。該失敗原本不在 run-tests 的 KNOWN 清單，本次未修改清單或隱藏失敗。
- 最終執行 `node tools/run-tests.cjs --quiet`：47 項，39 通過、7 個已知舊失敗、1 個清單外失敗，退出碼 1。唯一清單外失敗仍是修改前已有的 verify-controls-ui（CDP timeout: Page.enable）；相較修改前沒有新增失敗，但整體指令尚未達到退出碼 0。

## 尚未完成與限制

- 未進行雙帳號真人連線驗收與桌面／手機截圖；目前完成結構與事件檢查。
- 配對本體仍沿用原有「配對功能即將開放」回呼；本次只完成組隊與隊長操作權限。
- js/lobby-client.js 寫入遭環境 EPERM 拒絕，未修改該檔；改由可寫的 js/lobby.js 利用既有 onstate 回呼與微任務，在 hello 之後送同步訊息。
- 未修改 server、gym.html、src/gym、engine、自訂房間功能或既有訊息格式；未 git add、提交、推送或部署。
- 本次工具未提供帳號用量百分比，無法核實「50%」額度讀值；完成必要修改與驗證後即停止。

