# WEB-005C 進度報告

日期為 2026-11-09。分支為 `game-site`。

## 本輪狀態

本輪完成程式接線與部分自動驗證，尚未完成全部驗收。依使用者「用量接近 50% 就停」要求保守收尾。工具未提供精確用量百分比，因此此處不宣稱已量到 50%。

報告原件位於 `D:\開排球場\codex工作單\WEB_005C_報告.md`。這個位置在 Git 儲存庫之外，另將相同內容放入 `volleycourt/docs/WEB_005C_報告.md` 隨本輪提交。

## 已做項目

- 開工前已讀工作單、`avatar-toy.js` 與 `creator.js`，確認公開函式及角色骨架回傳內容。
- `appearance.js` 統一讀寫本機 `localStorage['vb.settings.look']`。此處採用獨立儲存鍵，沒有將外觀混入 `vb.settings` JSON。舊代碼經 `decodeLook` 轉為預設外觀。
- `makeAvatar` 改用 `makeToyAvatar`。排球隊伍 0 使用橘黑、隊伍 1 使用藍白，觀眾與練習預設橘黑。自己第三人稱與遠端角色會在隊伍改變後重建。
- 玩家外觀沿既有 `st.ch` 欄位傳送，接收端正規化後重建角色，搬移名牌與球拍。沒有增加訊息種類或更改傳送頻率。
- 排球 AI 以 AI 識別碼產生穩定數字種子，再呼叫 `randomLook`。相同識別碼在各端可重現相同外觀。
- 首次按開始會開建立角色畫面，完成儲存後進大廳。有儲存外觀則直接進大廳。跳過、Esc、`#lobby` 入口均經同一判斷。重複點擊不會重複開建立畫面。
- 建立角色前會停止開場動畫，建立畫面期間大廳維持 inert。角色編輯只載入於大廳，球館頁沒有編輯入口。
- 新增角色資訊面板，顯示一次性 3D 截圖、暱稱與四項「—」統計欄。編輯存檔更新預覽，取消沿用原儲存值，儲存失敗顯示錯誤。
- 新增 `tools/verify-web005c.cjs`，並在 `verify-web001c.cjs` 精確排除本次三處外觀接線差異，保留其他物理、AI 與連線基準比對。

## hands 使用調查

- `av.hands` 在 `avGroundPts` 中提供撲倒時手掌／手指的地面取樣點。模型比例改變會影響視覺上的貼地修正，仍需在瀏覽器檢查撲救姿勢。
- `av.hands[0]` 是遠端角色、球拍運動角色與示範角色的球拍掛點。更換外觀時將既有球拍搬到新掛點。
- 第一人稱的 `hands` 是另外建立、掛在 camera 下的群組。其 `localToWorld`、`worldToLocal`、拿球、互動等邏輯未修改。
- 程式搜尋沒有找到直接以第三人稱 `av.hands` 世界座標作為排球擊球判定的程式。既有物理、AI、輪轉回歸檢查通過，但尚未進行真人操作與球拍位置的視覺驗證，不能將這部分列為完整驗收通過。

## 自動檢查

修改前已先執行現有檢查。結果如下。

| 檢查 | 修改前 | 修改後 |
| --- | --- | --- |
| verify-3v3-back-sets | 通過 | 通過 |
| verify-ai-attack-routing | 通過 | 通過 |
| verify-position-setters | 通過 | 通過 |
| verify-web001b | 失敗 | 仍失敗 |
| verify-web001c | 通過 | 更新外觀差異比對後通過，9 項 |
| verify-web002-state | 通過 | 通過 |
| verify-web002 | 失敗 | 仍失敗 |
| verify-web002b | 失敗 | 仍失敗，需更新首次進入流程測試 |
| verify-web003a | 通過 | 通過 |
| verify-web003b | 通過 | 通過 |
| verify-web005c | 尚無 | 通過 |

`verify-web001b` 的歷史全文比對在修改前就失敗，且仍要求 `myChar`、`vmPickChar` 回傳 null，與本工作單目標衝突。`verify-web002` 需要本機 8787 服務，目前回傳 ECONNREFUSED。`verify-web002b` 修改前已失敗，修改後還需配合新的非同步建立角色流程更新舊開場測試。這些項目尚未處理完，因此「舊檢查全部通過」尚未達成。

新測試執行了實際編解碼及存取函式、首次進入判斷、舊碼回退、AI 種子、隊服映射、實際 intro 控制流程（以替身模組模擬建立畫面完成）、重複點擊、一般與 hash 入口、模組語法和遊戲入口接線檢查。這些測試沒有渲染 WebGL。

`git diff --check` 通過。

## 待完成與 Claude 介面確認

1. 瀏覽器實測首次建立、重新整理、編輯髮型和背號、取消不存檔、進房後新外觀與比賽中無法編輯。
2. 雙分頁同房，確認各自外觀、兩隊隊服與旁觀者外觀。回放與其他球拍運動模式的隊服也需補查。
3. 12 人上場 FPS 尚未量測。修改前 FPS 與修改後 FPS 均無數據，必須在相同視角、畫質、視窗尺寸與硬體下補測，不能以自動測試代替。
4. `creator.js` 的 `close()` 會停止動畫、斷開 ResizeObserver、呼叫 renderer.dispose、移除 DOM。其 `Thumbs.dispose()` 目前為空，場景幾何／材質／貼圖與 `window.__cc` 參考的完整釋放尚未完成。請 Claude 提供可重複呼叫、能處理初始化失敗及共用快取的公開清理介面，接線端再使用。此輪沒有修改其造型或畫面，也沒有直接處理角色內部快取。
5. 資訊面板的截圖 renderer 已於 finally 釋放並失去 WebGL context，模型共用快取仍交由模型模組管理。反覆開關的記憶體穩定性待測。
6. 建立畫面初始化途中若 WebGL 拋錯，creator 自身尚無公開的失敗清理介面，需連同上項處理。
7. 可選的真實球館背景保留現有版本。現有 `openCreator` 未接受球館場景／背景參數，且使用者要求保留 creator 畫面，需由 Claude 提供公開介面後再評估效能。
8. 補齊前述舊檢查與實測，再提交後續完成版。

## 提交範圍

沿用工作單將 `avatar-toy.js`、`creator.js`、`character-creator.html`、`toy-preview.html` 納入提交，接線程式沒有編輯這四個檔案。使用者最新指示優先於工作單，因此 `blender/`、`models/` 全部排除，也未修改其中任何檔案。提交採逐一列出檔案路徑，沒有使用全目錄加入。

已嘗試以 `feat: 接入角色建立與外觀同步（WEB-005C 進度）` 提交，Git 回傳 `fatal: cannot update the ref 'refs/heads/game-site': unable to append to '.git/logs/refs/heads/game-site': Permission denied`。因此本輪提交失敗。HEAD 仍為 `4a2fd6a`，本輪 14 個檔案已保留於工作目錄與暫存區，`blender/` 和 `models/` 沒有加入暫存區。受目前檔案權限限制，沒有繼續修改 Git 權限或分支參照。後續需在可寫入 Git reflog 的環境提交，並繼續上述未完成項目。
