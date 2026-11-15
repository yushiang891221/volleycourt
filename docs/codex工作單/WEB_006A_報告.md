# WEB-006A 進度報告

日期 2026-11-10。工作分支 `game-site`。

## 本次停下的位置

依使用者「用量接近 50% 就停下來寫進度」的要求，本次保守停在獨立框架與離線測試階段。工具未提供精確的本次用量百分比，因此沒有可核對的 50% 讀值。

**WEB-006A 尚未完成。遊戲內尚無教學入口，前三段尚不能在 gym.html 實際操作。**

## 本次檔案

- `volleycourt/tutorial.js` 新增獨立狀態機、前三段提示與判定、進度儲存、DOM 選單與面板。六段資料都有保留，後三段停用。
- `volleycourt/tools/verify-web006.cjs` 新增離線測試，檢查前三段逐步前進、略過、離開、重練、續接、進度複本、重設、壞資料、儲存封鎖及改鍵。
- `codex工作單/WEB_006A_報告.md` 為本報告，位於 volleycourt Git 儲存庫之外，留在指定位置。

`gym.html` 尚未修改。`blender/`、`models/` 無本次修改。既有 `models/hair_strands.png` 保持未追蹤。

## 已查清楚的現有流程

以下行號為本次未修改的 gym.html。

| 項目 | 查核結果 |
|---|---|
| 接球窗口 | `vbRecvStep` 第 9357 行開始。一般窗口 1300 ms、撲救 700 ms，逾時分支在第 9359 行。撲救結束也有清除 `walk.recv` 的分支，後續需避免漏報或重複失敗。 |
| 接球成功 | `vbRecvStep` 委派 `vbDoReceive`，`lastRecv` 在第 9431 行。成功事件應放在實際送球後，帶品質、dive 與 crouch。 |
| 舉球轉盤 | `setMenuPick` 第 9518 行呼叫 `vbSet(n, v)`；`vbSet` 第 9522 行，`vbSetStep` 第 9540 行。必須把 menu 來源隨 `walk.setQ` 傳到 `vbDoSet`，不能只靠 v 非空判定。 |
| 預設舉法 | `SET_DEF` 第 9487 行，1 是 high、2 是 quick、3 是 high。 |
| 舉球方向 | 1 前舉到 4 號位、2 中間快攻、3 後舉到 2 號位、4 後排中間、5 老三（右後排）、6 鍵傳入內部編號 7，後排 5 號位（左後排）。 |
| 快攻位置限制 | `vbDoSet` 會在離網超過 3 m 時把快攻改成前舉，教學舉球起點需要安排在網前。high3 也會改寫顯示編號，後續事件需區分原始選擇與實際舉法。 |
| 球的建立 | `newBallMesh` 第 6169 行；`releaseBall` 第 6251 行建立 `{m,v,rest}`，登記 userData、ballsGroup 與 balls。`vbLaunch` 第 8969 行；`vbPredict` 第 8962 行。 |
| 落點圈 | `vbAssist` 依對面來球、預測落點與 3.5 m 距離建立 VB.target，並非限定比賽。第 9799 行仍受個人 landing 設定控制。教學應強制顯示本次來球落點，遠處撲救的 3～4 m 球也要顯示，且只在教學啟用。 |
| 進場位置 | `startWalk` 第 5551 行開始，第 5561 行把玩家放在入口內側，不能假設在排球場。開始教學應檢查 `vbCourt()`，選有效排球場並用現有世界座標方式移到單側。 |
| 跳發事件 | `jumpServeHit` 第 6658 行，成功後委派 `serveLaunch` 第 6556 行。統一在 serveLaunch 發事件即可涵蓋四種發球且避免跳發重複。 |

## 事件接線狀態

本次尚未新增任何 `tutEv` 呼叫，下表是下一輪接線位置，不能視為已完成。

| 事件 | 預定接線位置 |
|---|---|
| recv | vbDoReceive，lastRecv 附近實際送出球之後 |
| recvMiss | vbRecvStep 窗口逾時及撲救未接到的結束路徑 |
| set | vbDoSet，第 9572 行開始，涵蓋陪練提前 return 路徑 |
| jump | vbJump，第 9196 行開始，walk.air 建立後 |
| atk | vbHitAttack，第 9290 行開始，實際打到並送出球後 |
| whiff | vbSwingStep，第 9268 行開始，0.62 秒揮空分支 |
| serve | serveLaunch，第 6556 行開始，場上球建立完成後 |
| block | vbBlockTest，第 9621 行開始，vbBlockApply 之後；mate 要檢查實際鄰近共同攔網者 |
| dive | vbDive，第 9346 行開始，撲救成功啟動後 |

## 框架 API 與接續契約

瀏覽器輸出 `window.VBTutorialFactory.create(options)`，Node 輸出 `{create, sections}`。之後 gym.html 在確認練習房後建立 `window.VBTutorial`，注入 TUT_COACH，呼叫 mount(document)。目前沒有建立實例或載入腳本。

實例提供設計指定的 open、start、stop、active、progress、reset、emit、frame，另有 mount、skip、view、sections。`progress()` 回傳深複本，儲存格式維持 `{v:1,done,at,updated}`。`at` 使用零起算的下一個待做步驟，完成時等於總步數。完成段落後再開始會從第 0 步重練，未完成段落可續接。

注入教練介面為 start(id)、step(id,index,snapshot)、frame(snapshot)、pause()、stop()、release()。step 回傳 `{x,z}` 目標圈中心。pause 暫停餵球，stop 清除教學物件與排程，release 放開滑鼠。這些方法目前都尚無 Three.js 實作。

框架額外接受 `feedMiss`，供教練判斷一顆球失敗時使用。接線時必須讓每次嘗試只累計一次失敗，避免 recvMiss 和 feedMiss 同時計數。成功與失敗後 2 秒再餵球的排程仍待實作。

## 目前做到條件

| 段落／步驟 | 獨立狀態機的實際條件 |
|---|---|
| 移動 1 | locked 為真 |
| 移動 2 | 距教練回傳的目標中心 ≤ 0.8 m |
| 移動 3 | yaw 最短角差的絕對值累積 > 1.5 rad，跨 ±π 有修正 |
| 移動 4 | sprint 為真且距目標 ≤ 0.8 m |
| 移動 5 | crouch 連續累計 ≥ 1 秒，中斷歸零，每格最多計 0.1 秒 |
| 移動 6 | 相鄰快照 tp 改變 |
| 接球 1 | incoming 非空，玩家距其落點 ≤ 0.8 m |
| 接球 2 | 收到 recv |
| 接球 3 | 收到 recv 且 crouch 為真 |
| 接球 4 | 先收到 dive，再收到帶 dive 的 recv；累計 3 次失敗後提示放寬，下一次 dive 即通過 |
| 舉球 1 | set 的 n 為 1 |
| 舉球 2 | set 的 n 為 2、3 都完成，順序不限，面板標示已完成項目 |
| 舉球 3 | set 的 n 為 4、5、7 任一個 |
| 舉球 4 | set 的 menu 為真、def 嚴格為 false |

成功顯示綠底並等 800 ms 後前進。略過同樣等 800 ms，文字顯示已略過。12 秒未完成時顯示提示。最後一步完成或略過後記段落完成，後三段維持即將推出。所有可改鍵提示，包括 p，都從 VBSettings 取得。

## 與完整設計仍有差距

- gym.html 載入、練習房專用入口、tutorial=1、自動開選單、事件、每格快照、體力停扣全部待做。
- TUT_COACH 尚未建立，目標圈 4 m／8 m、轉頭提示圈、過網拋球、蹲接較低較快的球、3～4 m 撲救球、網前高球尚待實作。
- 教學球的成功／失敗重試、清理、離開遊戲與進入比賽時停止教學尚待接線與測試。
- DOM 已實作但尚未掛到遊戲，入口 CSS 暫為右下角，應在整合時移到工作單指定的右上或房間資訊附近。
- 視覺、點擊事件隔離、鎖鼠、設定視窗與教學互動尚未做瀏覽器驗證。
- frame 目前只消費前三段需要的 x、z、yaw、sprint、crouch、locked、tp、incoming。整合時仍應送完整共用快照，方便 B 擴充。

## 自動檢查

執行所有 15 支 `tools/verify-*.cjs`，12 支通過、3 支失敗。

通過的腳本如下。

- verify-3v3-back-sets.cjs
- verify-ai-attack-routing.cjs
- verify-position-setters.cjs
- verify-web001c.cjs
- verify-web002-state.cjs
- verify-web003a.cjs
- verify-web003b.cjs
- verify-web004.cjs
- verify-web005c.cjs
- verify-web005e.cjs
- verify-web005f.cjs
- verify-web006.cjs

失敗項目如下。本次只新增獨立檔案，既有遊戲檔與舊測試皆無修改。

- verify-web001b.cjs 第 29 行，比對既有基準文字失敗，差異包括 drawScore 等現有內容。
- verify-web002.cjs，localhost:8787 連線遭拒，缺少測試依賴服務。
- verify-web002b.cjs 第 64 行，既有 VBIntro.entered 斷言失敗。

新測試通過只代表獨立狀態機，不代表 WEB-006A 整合驗收完成。

## 待 Claude 驗收

待程式接線完成後，在 `http://localhost:5190/gym.html?practice=1&tutorial=1&debug=1` 檢查入口、面板遮擋、重設／續接、改鍵、所有前三段動作、過網球路、落點圈、體力與退出清理。目前尚不具備實玩條件。

## 提交

只暫存本次新增的 tutorial.js 與 tools/verify-web006.cjs，`git diff --cached --check` 通過。本報告因位於儲存庫外，留在使用者指定路徑。

嘗試提交 `WEB-006A: add tutorial framework and offline step tests` 失敗，Git 回報無法附加寫入 `.git/logs/refs/heads/game-site`，Permission denied。依工作單要求，修改保留在工作目錄與暫存區，未更動權限。未推送、未部署。
