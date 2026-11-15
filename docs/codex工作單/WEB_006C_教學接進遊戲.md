# 工作單 WEB-006C：把新手教學接進 gym.html（六段都能實際玩）

建立：2026-11-10。在 `volleycourt` 的 `game-site` 分支做。只做電腦版。
先讀 `WEB_006_新手教學設計.md`、`WEB_006A_報告.md`、`WEB_006B_報告.md`。`tutorial.js` 與 `tools/verify-web006.cjs` 已經提交（463bfbe），狀態機和六段判定都做好了；**這張要做的是 A、B 報告裡「尚未完成」的所有 gym.html 接線與教練動作**。

## 關於用量（重要）
上兩輪各只用了 6～9 萬 token 就「保守停下」，結果遊戲裡什麼都還不能玩。使用者說的「不超過 50%」是 Codex **帳號額度**，不是這一輪的上下文。**這張請做完整張**，只有 Codex 自己出現額度不足的警告時才停，停的時候把進度寫進報告。

## 要做的事
1. 載入與入口：練習房（網址有 `practice`）才載入 `tutorial.js`、建立 `window.VBTutorial`、`mount(document)`；練習房畫面上有「📘 新手教學」按鈕；網址 `tutorial=1` 進來自動開選單。按鈕與面板位置不要擋準星、房間資訊框、右側操作說明。點面板按鈕時不要觸發遊戲的點擊（攻擊、鎖滑鼠）。
2. `tutEv` 事件：照 A 報告「事件接線狀態」表全部接上（recv、recvMiss、set、jump、atk、whiff、serve、block、dive），data 照設計文件。`set` 要能分辨是不是轉盤選的、是不是預設舉法（A 報告說要把 menu 來源跟著 `walk.setQ` 傳）。`serve` 只在 `serveLaunch` 發一次。`block` 放在 `vbBlockApply` 之後，`mate` 是真的有教學隊友在旁邊一起跳。
3. 每格快照：`updateWalk` 結尾附近呼叫 `VBTutorial.frame(...)`，欄位照設計文件（含 `incoming` 落點、`nearNet`、`blkAim`、`tp`）。教學沒開時零成本。
4. `TUT_COACH`（照 A 報告的介面 start/step/frame/pause/stop/release）：
   - 開始教學：玩家不在排球場就帶到排球場自己那一側；面向網。
   - 移動：地上畫黃色目標圈（step 回傳的圈心）。
   - 接球：從對面拋球過網到玩家附近（第 3 步低一點快一點、第 4 步落在 3～4 m 外）；落點圈教學中一定顯示；接到或落地後 2 秒再拋。
   - 舉球：教練在玩家前方把球拋高給玩家，玩家要在網前（快攻離網 3 m 內才算快攻）。
   - 攻擊：陪練舉球或教練直接舉到攻擊點，選穩定的；教學結束收掉陪練。
   - 發球：帶到底線後、給球、發完 1.5 秒再給。
   - 攔網：網前畫圈，玩家在圈裡才扣；用 B 報告試算的固定球路（用現有 `vbLaunch`，不另寫物理），實際跑跑看調到攔得到。
   - 雙人攔網：教學隊友用 `makeAvatar` 做獨立角色（不要用 `vmMkAi`，避免污染比賽名單），玩家起跳攔網時隊友同步跳；只在這一步出現。
   - 離開教學、換段、換步、回選單：所有教練、陪練、隊友、球、圈都要清乾淨。
5. 教學中不扣體力（`staGame()` 教學中回 false）。不影響非教學的練習和比賽。
6. `tools/verify-web006.cjs` 補上 gym.html 接線檢查（各 tutEv 存在、只在練習房載入、staGame 教學判斷等）。

## 自己先實際跑
用 `http://localhost:5190/gym.html?practice=1&tutorial=1&debug=1`（已經有伺服器在跑；沙盒連不到就用 node 檢查）。`window.__gym` 有 `walk`、`balls`、`step(dt)` 等可以拿來模擬。能跑的話，每段至少用程式模擬走完一次，寫進報告；不能跑就寫「待 Claude 驗收」。

## 不要做
- 不改玩法、物理、數值、擊球判定、AI、連線、比賽規則。不做手機版。不改 `blender/`、`models/`。不推送、不部署。
- 一行程式中間的註解用 `/* */`。

## 報告
`codex工作單/WEB_006C_報告.md`（繁體中文）：改了哪些行、每個教練動作怎麼做、自己跑的結果、自動檢查結果（全部 `tools/verify-*.cjs`，已知 web001b、web002、web002b 原本就失敗，列出來就好）。
提交到 `game-site`；沙盒寫不進 `.git` 就把修改留在工作目錄，報告寫清楚，Claude 會提交。
