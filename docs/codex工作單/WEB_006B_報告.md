# WEB-006B 進度報告

日期：2026-11-10。工作分支：`game-site`。

## 本次停下的位置

依「用量接近 50% 就停下來寫進度」要求，保守停在後三段獨立狀態機與離線測試完成處。工具沒有可核對的用量百分比，不能宣稱已精確到 50%。

**WEB-006B 尚未完成。A 留下的 gym.html 載入、入口、tutEv、TUT_COACH、frame 接線全部尚未實作；本輪也尚未接線，六段目前均不能在遊戲內實玩。**

## 本次檔案

- `volleycourt/tutorial.js`：啟用後三段框架選單，新增攻擊、發球、攔網提示和判定；沿用六段全完成恭喜訊息。停止時清除快照，避免重開攔網教學沿用前次離網距離。
- `volleycourt/tools/verify-web006.cjs`：增加後三段正反案例、臨界值、改鍵、續接、六段完成和重設檢查。
- `codex工作單/WEB_006B_報告.md`：本報告，位於 volleycourt 儲存庫外。

`gym.html`、`blender/`、`models/` 未修改。既有未追蹤 `models/hair_strands.png` 未動。進場時 tutorial.js 與 verify-web006.cjs 已是 A 留下的暫存新增檔，本次沿用並修改這兩個檔案。

## 已查清楚的現有流程

行號對應本輪未修改的 gym.html。

| 項目 | 查核結果 |
|---|---|
| 發球類型 | `serveLaunch` 第 6556 行直接接收 std、float、jump、jfloat。`updateServe` 把站發映成 std／float；`jumpServeHit` 第 6658 行把 float 映成 jfloat，其餘映成 jump，再呼叫 serveLaunch。未來在 serveLaunch 場上球建立後發出一次 serve 事件即可，勿在 jumpServeHit 重複發事件。zone 可用 C && C.zone。 |
| 攻擊蓄力 | `vbHitAttack` 第 9290 行；空中非吊球才建立 C。傳入 chg 為 null 時現有玩法用 0.55 作預設，所以事件應保留原始 chg，不能用預設值冒充玩家蓄力。 |
| 起跳 | `vbJump` 第 9196 行；hs 由 walk.vel 計算並上限 4.2，block 對應 kind === 'block'。事件應在 walk.air 建立後發出。攔網初速 4.1，JUMP_G = 8.4。 |
| 真人攔網 | `vbBlockTest` 第 9621 行要求 walk.air.block、玩家離網 ≤ 1.3 m。球必須朝自己半場穿過 sg × 0.12 的平面；左右偏差 ≤ 0.62 + BALL_R；高度介於 camera.y + 0.2 與 camera.y + 0.95 + BALL_R。通過才呼叫 vbBlockOutcome 與 vbBlockApply。block 事件應放在 vbBlockApply 後，不可在只起跳時發出。 |
| AI 攔網 | `vmAiBlock` 第 10430 行依比賽威脅決定站位和起跳，使用 aiJump、pose 9、blk.jumped。`vmBlockTest` 第 10484 行限定 VM.on／host／rally／VM.ball，使用同一個 vbBlockOutcome、vbBlockApply。不能直接在練習房呼叫就期待生效，也不應為教學打開比賽或另寫碰球物理。 |
| 隊友外觀 | `vmMkAi` 第 10064 行會寫入 VM.ai、VM.names、VM.chars。後續教學宜用 makeAvatar 做獨立角色，避免污染比賽名單；以既有姿勢／跳躍參數同步動畫，真正碰球仍交給真人原有判定。 |
| 按鍵 | settings.js 的跳躍動作名稱是單一空白字元 `' '`，攔網是 `'b'`；提示已使用設定提供的 keyName，沒有寫死空白鍵或 B。 |

## 教練扣球軌跡試算（尚未實作）

用 Node 計算候選固定球路，球場局部座標以自己半場正 x 為例：從 x = -2、y = 3.3、z = 0 出球，vx = 8、vy = -0.5、vz = 0，沿用重力 9.8；後續應透過現有 vbLaunch 發射，不另建物理。

- 過網中心 x = 0：球的物理時間 0.25 秒，高度 2.86875 m。
- 到真人攔網平面 x = 0.12：物理時間 0.265 秒，高度 2.8233975 m。
- 預設 VB.ts = 0.7 時，到碰手平面的實際時間約 0.37857 秒。
- 若玩家出球同時以 4.1 起跳，依連續公式估算，此時 camera.y 約 2.57021 m；原判定允許球高約 2.77021～3.62521 m，候選球高在範圍內，左右對準時亦符合橫向範圍。

這只是候選軌跡的數學檢查，沒有跑遊戲的離散積分、網碰撞及攝影機更新；不同速度設定、網高、起跳延遲仍需調整與驗收，不能視為教練扣球已完成。

## 框架 API 與本次做到條件

沿用 A 的 VBTutorialFactory.create、open/start/stop/active/progress/reset/emit/frame 等 API，儲存格式不變。未新增教練 API 實作。

| 段落／步驟 | 判定 |
|---|---|
| 攻擊 1 | jump，block 嚴格為 false，speed ≥ 2 |
| 攻擊 2 | atk，air 為真，chg 為有限數字（0 有效；null、缺值不算） |
| 攻擊 3 | atk，zone === 'sweet' |
| 攻擊 4 | atk，tip 為真 |
| 發球 1～3 | serve.type 依序 std、float、jump；jfloat 不代替跳發 |
| 攔網 1 | jump.block 為真，最新 frame.nearNet 為 0～1 m 的有限數值 |
| 攔網 2 | frame.air、airBlock 均為真，絕對 blkAim ≥ 0.2 |
| 攔網 3 | block 事件任何結果；stuff 在成功面板附上「攔網成功！」 |
| 攔網 4 | block 且 mate 嚴格為 true；距離與同時在空中的真實條件仍必須由未完成的遊戲接線確認 |

仍沿用成功後 800 ms 前進、略過記進度、完成呼叫 coach.stop 的機制。六段完成的恭喜文字沿用 A 的 DOM 邏輯，新增測試驗證 allDone、重載及重設。

## 與完整工作單仍有差距

1. 補齊 A 的練習房入口、載入、tutorial=1、全部事件、完整每格快照、體力停扣與退出清理。
2. TUT_COACH 攻擊舉球尚未實作；尚未選定並實測穩定的直接舉球或陪練方案。
3. 底線後定位、grabBall、每發完 1.5 秒補球及拋球揮空的補球流程尚未實作。
4. 攔網圈、玩家進圈才扣球、教練角色、固定球路、失敗重試尚未實作。
5. 雙人攔網隊友建立、跳躍同步、mate 真實判斷及離開／換步／換段清除尚未實作。
6. 面板位置、按鈕事件隔離、鎖鼠互動、瀏覽器畫面與實玩尚未驗收。

## 自動檢查

執行全部 15 支 tools/verify-*.cjs：12 通過、3 失敗，與 A 報告一致。

通過：verify-3v3-back-sets、verify-ai-attack-routing、verify-position-setters、verify-web001c、verify-web002-state、verify-web003a、verify-web003b、verify-web004、verify-web005c、verify-web005e、verify-web005f、verify-web006（皆為 .cjs）。

失敗：
- verify-web001b.cjs：既有基準文字斷言失敗；前面的語法檢查通過，本次未改它檢查的遊戲檔。
- verify-web002.cjs：localhost:8787 連線遭拒（ECONNREFUSED）。
- verify-web002b.cjs：第 64 行 VBIntro.entered 斷言失敗。

本次新增測試涵蓋三段每一步、錯誤動作不前進、蓄力 0／null／缺值、速度與離網／移手臨界值、跳飄不誤算跳發、單人碰手不誤算雙人、清理呼叫、改鍵、續接及全部完成狀態。git diff --check 通過。這不代表場景整合完成。

## 待 Claude 驗收

待接線完成後，在 `http://localhost:5190/gym.html?practice=1&tutorial=1&debug=1` 實玩後三段，檢查餵球、補球、碰手、雙人攔網、所有退出清理及六段恭喜畫面。目前尚不具備實玩條件。

## 提交

準備只提交本次修改的 tutorial.js 與 tools/verify-web006.cjs。兩檔在本輪開始前已是 A 的暫存新增檔，若提交成功會包含其既有框架及本次擴充，不納入其他檔案。本報告留在指定的儲存庫外路徑。未推送、未部署。

已執行 git add、git diff --cached --check（通過），並嘗試以 `WEB-006B: extend offline tutorial steps and verification` 提交指定兩檔。提交失敗：`unable to append to '.git/logs/refs/heads/game-site': Permission denied`。沒有變更權限或繞過限制；修改保留在工作目錄與暫存區，提交要求尚未完成。
