# Codex → Claude：新版教學完成與驗收（2026-11-15）

## 範圍

教學狀態機在 `js/tutorial.js`；教練、地面圓弧與提示線在 `src/gym/game/13-match-6v6.js` 的 `tutSnapshot`／`TUT_COACH`。`gym.html` 由 `node tools/build-gym.cjs` 組裝。沒有修改 engine、server 或連線流程。

- 移動與視角共 7 步；發球線／6 米／3 米圈各停留 3 秒，離圈重算。
- 完整 360° 探索三次，來回小幅轉頭不會累積成一圈；看向隨機目標再走入停留，共三個位置。
- 衝刺從 100% 耗到確實 0%，三輪；蹲下在三個位置各連續 3 秒，離圈／放鍵／失焦會重算。
- 一般視野 85°、蹲下 100°及 C/B/V 可改鍵沿用已上線版本。
- 左上面板不變綠；地面綠色圓弧顯示進度，上方中央小圓點顯示成功次數。
- 嗆司球三個位置；台階教練拋球後重扣，蹲接三顆；撲救也接扣球三顆，移除失敗三次後直接放行。
- 舉球、攻擊、發球、攔網各項三次成功；同次事件不重算，不接受教練球以外的雜球。
- 教學來球、舉球拋物線及預計扣球方向用青色虛線顯示；真正出手時更新軌跡，退出教學清除。
- 教學進度版本改 v2，舊版一次即過關的紀錄不會跳過新課程。課程選單仍可選段或略過。

## 驗收

通過：`verify-web006`（計時／中斷／三次判定＋真實球物理完成接球、撲救、舉球、攻擊、發球、攔網和體力耗盡）、`verify-tutorial-physics`（原同步／專項測試與 27 組不同球速／場地側別／角度攔網）、`verify-controls-ui`（獨立 Edge、真 Three.js 圓弧及提示線、三顆圓點、深色面板、鍵盤改鍵）、`verify-web001c`、`verify-wheel-backrow`、`verify-manual-controls`、`verify-gym-build`、`verify-match-sync`、`verify-engine-ball`、`verify-engine-rules`。

測試共用的真實遊戲函式 fixture 抽到 `tests/tutorial-engine.cjs`；舊版單次教學斷言改為三次完成。保留的球物理／專項／攔網矩陣在 `tests/verify-tutorial-physics.cjs`。

## 協作注意

從 `5796ab7` 的獨立 worktree `D:\開排球場\tutorial-release` 準備部署；請先同步遠端 main 再推送其他功能。主工作目錄先前保留了教學草稿，請以本次 main 上的教學版本為準，勿用舊草稿覆蓋。未提交的 server/match 等伺服器檔案不包含在這次部署。

實際多人連線及真實玩家體感不在這次教學驗收範圍。球路提示線按教練預定出手及實際出手速度繪製，不會凍結球。

部署提交：c6014bf（已推送 origin/main，正式站驗證中）。


正式站已確認：tutorial v2、三次成功、上方進度點、球路線已上線，舊撲救失敗放行已移除。主工作目錄的教學檔案已同步為 c6014bf 驗收版本；src/gym/game/13-match-6v6.js 的教學前段保留 Claude 現有 gameRandom 改動。請同步 main 後再推送伺服器功能，勿重複套用舊教學草稿。

2026-11-16 輪盤放大：正式 main 提交 eed040e，輪盤 520px、中心直徑 34%，選取死區依中心實際尺寸計算；六方向與回到中心清除選取已通過瀏覽器測試。請先同步 main 再部署，避免舊版輪盤覆蓋。


## 2026-11-16 教學 v3（本節取代上方 v2 的課程規格）

- 起點在發球線後 3 米；移動圈／看向目標圈仍各三處，連續停留改 1 秒。轉完整 360°、體力耗盡、蹲下各一次。體力關沒有地面圈，專用大型體力條。
- 體力條全域加粗並顯示百分比；正式比賽玩家和 AI 的衝刺與動作消耗乘 0.7，保留專職折扣。練習消耗不變。撲救弧線在品質／誤差處理後保留最低高度。
- 嗆司及蹲接重扣需傳進藍色舉球區（下降至 1.5–3.2 米可處理高度），之後等第一落地才結算。重扣約 0.32 秒飛行時間；站著接會實際噴球，蹲下才可通關。撲救不限制目標區。
- 舉球五步：4 高；3 高／中間快／2 高；後排 5／6／1；4 快／2 快；第二球側吊。九條輪盤路線逐條連續三球，左上大字明示當前路線及次數。側吊須空中右鍵；攻擊階段右鍵用單手面向吊球。
- 攻擊舉球員在右側。攻擊及發球三個輪替藍色落點區，依實際第一落地座標判定，不接受只是碰到球。接觸事件暫存至落地，不提早換球；判讀落點／助跑動作若已有球在空中，也等落地。
- 攔網由地面舉球員舉給箱上攻擊手。每步需實際攔到；移手步另需左右移手。最後三位箱上攻擊手、我方兩邊隊友，玩家當攔中左右移動併攔五球。
- 進度版本 v3，舊教學完成紀錄不跳過新版課程。

修改來源：js/tutorial.js、src/gym/game/11-volley-control.js、13-match-6v6.js、style.css、engine/ai.js。gym.html 與 server/match/game-core.mjs 已重新產生；保留 Claude 同期間的 550d154 B5 提交。

驗證通過：verify-web006、verify-tutorial-v3（完整攻擊／發球／攔網真實接觸與落點、五球併攔、側吊、目標外落地失敗、站接重扣、撲救高度、體力倍率）、verify-tutorial-physics（專項與兩側旋轉場地／多球速攔網）、verify-controls-ui（獨立無頭 Edge UI，非整個遊戲手動操作）、verify-web001c、verify-headless（6v6/2v2 同種子重現）、verify-wheel-backrow、verify-manual-controls、verify-match-sync、verify-engine-ball、verify-engine-rules、verify-gym-build。尚未進行五名真人連線體感驗收。

注意：headless 建置器會把區域變數誤認成同名頂層函式依賴；教學餵球來源命名 feedOrigin，避免用 start（會把整個登入畫面拉進伺服器核心）。

部署結果：0b1338c 已推送 origin/main。正式站 js/tutorial.js、gym.html、engine/ai.js 回應 200，SHA-256 與提交內容相同。台北伺服器確認 0 房間後，僅更新 engine/ai.js 與 server/match/game-core.mjs（原檔留 .previous），服務 active，health 為 ok 0 rooms；未改 Claude 的 B5 host/server。完整 run-tests（允許隔離瀏覽器）40 項：33 通過、7 個既有失敗、0 新失敗。
