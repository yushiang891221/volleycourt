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
