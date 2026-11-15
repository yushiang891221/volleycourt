# 工作單 WEB-005C：捏臉畫面、角色資訊接進遊戲（含 WEB-005A 第 3 節「接進遊戲」）

建立：2026-11-09。在 `volleycourt` 的 `game-site` 分支做；開工前先確認工作目錄乾淨（`avatar-toy.js`、`creator.js`、`toy-preview.html`、`character-creator.html`、`blender/`、`models/` 是 Claude 新增的，一起提交）。
只做電腦版。**不改玩法、物理、擊球判定、AI 判斷、連線協定和送訊息頻率。**

## 背景
- 角色模型目前是程式生成版 `avatar-toy.js`；**Claude 正在用 Blender 重做模型，之後會換成 .glb，但對外的函式不變**。所以遊戲只能透過下面這些函式用角色，不要直接碰模型內部：
  - `makeToyAvatar(look, team)`：team 傳 `'orange'`（橘黑隊）或 `'blue'`（藍白隊），回傳結構跟 gym.html 的 `makeAvatar` 一樣（`g, body, root, spine, head, arms, elbows, hands, legs, knees, feet, L1, L2, hipH, chibi`），`avDrive()` 可以直接驅動。
  - `encodeLook` / `decodeLook`（外觀代碼 `t2…`，13 字）、`randomLook(seed)`、`setExpression(av, key)`、`EXPRESSIONS`。
  - `openCreator({ look, mode: 'create' | 'edit', onDone(look), onCancel })`（`creator.js`），回傳 `close()`。
- **不要改 `avatar-toy.js`、`creator.js` 的造型和畫面**；接的時候需要改函式介面，寫進報告問 Claude。
- 單獨測試頁：`character-creator.html`（捏臉畫面）、`toy-preview.html`（模型預覽）。

## 要做的事

### 1. 角色換成新模型（原 WEB-005A 第 3 節）
- `makeAvatar(color, ch)` 改成 `makeToyAvatar(decodeLook(ch), team)`。隊伍對應：**一邊固定橘黑、另一邊固定藍白**，開賽時依隊伍自動分配，玩家不能選。觀眾、大廳、練習模式用橘黑。
- 自己的外觀存在 `vb.settings.look`（外觀代碼）。進房時照現在的方式透過 `ch` 傳給其他人。
- AI 球員用 `randomLook(AI 編號)`。舊的角色代碼一律當成無效 → 預設外觀。
- 先查清楚哪些邏輯會讀 `hands` 的位置（球拍掛在 `hands[0]`），確定換模型不影響判定，寫進報告。
- 量 12 人上場的 FPS，跟換之前比，寫進報告。

### 2. 第一次進遊戲先捏角色
- 帳號（WEB-004）還沒做，先用「本機沒有 `vb.settings.look`」代表第一次。
- 流程：開始畫面 → 按「開始遊戲」→ **沒有外觀就先開 `openCreator({ mode: 'create' })`** → 按「完成，開始遊戲」存外觀 → 進大廳。已經有外觀就直接進大廳。
- 捏臉畫面開著的時候，遊戲主畫面暫停繪製（省效能），關掉後恢復；關掉時要釋放捏臉畫面的資源。

### 3. 角色資訊面板＋「調整外觀」
- 大廳底部功能列的「角色資訊」打開面板：
  - 左邊：自己角色的小預覽（可以用 `creator.js` 裡縮圖的做法，或放一個小 3D 預覽）。
  - 右邊：暱稱；等級、場數、勝率、遊玩時數先顯示「—」（等官方伺服器）。
  - 一個「調整外觀」按鈕 → `openCreator({ mode: 'edit', look: 目前外觀 })`，存檔後更新 `vb.settings.look`，大廳和下次進房都用新外觀；取消就不變。
- 面板樣式照大廳現有面板（深色實心、橘色主色）。
- 比賽中不能打開調整外觀。

### 4. 捏臉畫面的背景（可選，做不到就寫進報告）
使用者希望背景是「我們的排球場」。`creator.js` 目前用自己畫的簡單球場。如果能把遊戲已經載入的球館場景（`gym.html?site=bs-shenjing`）當背景、又不影響效能，就改；不行就維持現狀，在報告說明原因。

## 不要做
- 不做帳號登入（WEB-004）、不做排位和成就。
- 不改 `avatar-toy.js`、`creator.js` 的造型；不改物理、擊球、AI 判斷、連線協定。
- 不推送、不部署，不動 `main`、`planning-site`。

## 驗收
1. 清掉 `vb.settings.look` 後重新整理：開始遊戲 → 先進捏臉畫面 → 完成後進大廳。再整理一次就直接進大廳。
2. 角色資訊 → 調整外觀 → 改髮型、背號 → 儲存 → 大廳預覽和進房後的角色都變了；按取消不變。
3. 兩個分頁進同一房：雙方看得到對方的外觀；兩隊球衣分別是橘黑和藍白。
4. 比賽中打不開調整外觀。
5. 12 人上場 FPS（寫數字）。
6. 舊的自動檢查都還要過；新寫 `tools/verify-web005c.cjs`（至少測：外觀代碼存取、第一次進遊戲流程的判斷、隊伍對應到隊服）。

## 報告
`codex工作單/WEB_005C_報告.md`（繁體中文），在 `game-site` 提交，不推送。
寫不進檔案或提交失敗時，把修改留在工作目錄並在報告寫清楚。接近 50% 用量就停下寫進度。
