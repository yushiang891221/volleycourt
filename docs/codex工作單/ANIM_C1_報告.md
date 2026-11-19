# ANIM_C1：E 上手接球與 V 高球懲罰

工作日期：2026-11-19。工作目錄：`D:\開排球場\volleycourt-c1`；分支：`anim-c1-overhead`。

## 修改內容

- `js/settings.js`：控制版本升為 5；前排動作 `1/2/3` 預設未綁定，新增 `oh`＝E。舊版仍使用 Q/E/R 的前排鍵清空；保留自訂鍵，E 衝突時依現有候選鍵方式找空鍵。未綁定項目可儲存、重載及重新配置。
- `src/gym/game/09-replay.js`：E 呼叫上手接球；觀戰者與重複 keydown 均不觸發。
- `src/gym/game/11-volley-control.js`：新增上手時機純函式、最近軌跡預測、等待觸球佇列、取消及出球流程。抽出 `vbReceiveTarget`，共用原本接球目標、第二球修正、第三球過網與網前 0.9 m 修正。V 與撲救的原有目標規則保留。
- 出球維持球當下位置，不吸到手上；使用既有 `set` 觸球、特效與紀錄，新增 `recvOverhead` 教學事件與偵錯用 `window.__gym.lastOverhead`。此偵錯物件仍由既有 `?debug` 模式提供。
- 體力使用 `staPay('overhead')`，在 `staCost` 對應既有 `bump` 費用，連同房主自訂費用及專職折扣一致，不新增連線設定欄位。
- 等球使用 `setReady`，碰球使用 `setPush`、flash 0.45；`myPoseCode` 在上手佇列期間回傳既有代碼 2。離開模式、教學清理、表情、V 接球等情況取消佇列。
- 更新遊戲鍵盤面板、來球提示、toast、設定說明及接球教學。前排 C 輪盤、後排 1/2/3；E 不再顯示成舉快攻或背面舉球。
- `gym.html` 為組裝檔，已同步來源並用 `node tools/build-gym.cjs` 重建。
- 未修改 `server/`、連線訊息格式與發送頻率、3D 編輯器自由移動 Q/E、avDrive、avTouch、touchPass、AVP、DIVE_KF；扣球、攔網、發球及輪盤球路邏輯未變。

## 時機與品質數值

H＝玩家前方 0.25 m、camera.position.y + 0.25 m。軌跡沿用 `vbNext` 的重力公式，以 0.005 個物理秒採樣，搜尋過去 0.5 秒至未來 2 秒；再依 `VB.ts` 換算成實際秒，避免慢速模式改變按鍵容許時間。

| 條件 | 結果 |
| --- | --- |
| 最近距離 > 0.6 m | 沒接到 |
| 目前球低於 H 0.7 m | 提示改用 V |
| 早超過 0.25 秒 | 沒接到，提示上手太早 |
| 一般球早 0～0.25 秒 | 等到預測時刻觸球，時機品質 1 |
| 一般球晚 0～0.06 秒 | 時機品質 1 |
| 晚 0.06～0.2 秒 | 品質線性降至 0.35，目標往背後最多 3 m、高度最多 +1.5 m |
| 晚超過 0.2 秒 | 時機品質 0.2，往背後 2～5 m 接噴 |
| 球速 > 16 m/s | 完美窗縮為 ±0.03 秒；仍可提前 0.25 秒舉手，但窗外不算完美 |

重球額外溜手抽樣：球速 >12～16 m/s 為 10%，>16 m/s 為 20%；抽中時至少扣除 0.15×0.65 的時機品質，並往後上方偏移。超過晚按窗時必定溜手。額外機率的基準值為本次實作選定值，仍需實機確認手感。

品質再乘距離係數：0.25 m 內不扣，0.6 m 時乘 0.5；面向扣分沿用既有舉球區角度係數。第二球、第三球及網前修正仍優先遵循既有規則。

V：1.25～1.45 m 品質乘 0.75；高於 1.45 m，50% 接噴並設為 0.2，否則乘 0.55。撲救完全跳過這項高度懲罰。

## 驗證

- 抽出 `gym.html` 的 `<script type="module">` 執行 `node --check`：通過。
- `node --check js/settings.js`、`node tools/build-gym.cjs --check`、`git diff --check`：通過。
- 新增 `tests/overhead-timing.test.mjs`，8 組測試通過：指定的 6 個時機案例及邊界、軌跡前後時間、版本遷移與 E 衝突、等球與立即觸球、距離/高度/觀戰/失效球、慢速模式與重球機率、實際出球/事件/不挪球，以及 V 高度分段與撲救豁免。
- 更新 3 支舊按鍵測試對未綁定鍵的預期，以及 `tests/tutorial-engine.cjs` 載入共用目標函式。現有 38 支測試通過，包含接球教學、撲救物理、輪盤、後排舉球、比賽同步及球物理；加上新增測試檔共 39 支通過。

### 無法執行或自行略過

| 測試 | 原因 |
| --- | --- |
| feedback-db.cjs | 缺少 `@electric-sql/pglite` |
| feedback-ui.cjs | 缺少 `playwright` |
| verify-headless.cjs | 缺少 `acorn`（server 開發相依） |
| verify-srv-host.cjs | 缺少 `three` |
| verify-web002.cjs | 缺少 `rt-worker/node_modules/ws` |
| verify-lobby-feed.cjs、verify-team-db.cjs、verify-web030-db.cjs、verify-web031-db.cjs | 測試自行報告缺少測試資料庫而略過，未算通過 |
| verify-controls-ui.cjs | 腳本會輸出到工作區外 `../tools`，依只改本資料夾的要求未執行 |

`supabase-db.cjs` 是輔助模組，可載入，但不列為實際通過的測試。

### 修改前就存在的失敗

下列 6 支測試已使用 `git show HEAD:<檔案>` 將原始 gym/settings/tutorial 內容載入測試程序重跑，不切分支、不覆寫工作檔，確認同樣失敗。因此本次並未達成「全部既有測試全過」，沒有將這些結果隱藏或算成通過。

| 測試 | 既有失敗 |
| --- | --- |
| verify-position-setters.cjs | 測試環境缺少 `balls` |
| verify-web001b.cjs | 與歷史提交 `4613d8a` 的整段程式相等斷言已不符 |
| verify-web002b.cjs | 大廳背景連線數預期 1，實際為 0 |
| verify-web011.cjs | 測試環境缺少 `vbManualSetCancel` |
| verify-web016.cjs | 舊的大廳分頁字串斷言已不符 |
| verify-web020.cjs | 測試仍從舊位置搜尋 `class Vector`，找不到 |

## 尚未驗證

未操作真實瀏覽器驗證視覺姿勢、鍵盤面板排版與實際多人對打手感；網路與姿勢沿用既有 set 流程，未新增封包。旋轉/飄球預測採既有簡化重力軌跡；等待期間若球路改變或玩家離開觸球位置會取消，不追球補接。

## 提交

**尚未提交：被檔案系統權限阻擋。** 執行 `git add` 時 Git 回報：

```text
fatal: Unable to create 'D:/開排球場/volleycourt/.git/worktrees/volleycourt-c1/index.lock': Permission denied
```

此工作區的 Git 索引位於原儲存庫的共用 worktree 中繼資料，目前沙箱只允許讀取，且不允許提升權限。未繞過限制、未修改原儲存庫工作檔、不推送、不切分支。所有實作與報告保留於 `volleycourt-c1`；暫存工具與測試輸出已清除。原先未追蹤的工作單與啟動腳本保留不動。

待可寫入 Git 中繼資料的環境使用以下提交訊息完成提交（只加入本次修改及新測試、報告）：

```text
新增 E 上手接球並調整 V 高球懲罰

Co-Authored-By: Codex
```
