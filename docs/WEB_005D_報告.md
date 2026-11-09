# WEB-005D 進度報告

日期為 2026-11-09，工作分支為 `game-site`，開工時 HEAD 為 `158600b`。

## 本輪狀態

本輪完成背景與鏡頭相關程式草稿、可重拍工具及自動檢查，尚未完成工作單驗收。執行環境未提供精確用量百分比，依使用者接近 50% 即停止的要求保守收尾。

**尚無 `assets/creator-bg.jpg`，也尚無驗收截圖。現階段執行捏臉畫面會因照片缺少而走簡單球場回退。** 場館取景、角色貼地與影子效果仍須在可載入 Three.js 的瀏覽器實測後調整。

開工檢查確認工作範圍乾淨，僅 `blender/`、`models/` 有既存未追蹤內容。該兩個目錄由另一工作程序使用，本輪未修改或加入提交。

## 已寫入的程式

- `gym.html` 增加開發參數 `?site=bs-shenjing&shot=creator`。沿用 `generateFromSite` 產生遊戲球館，在球場局部座標 `(-6, 6.7)`、高度 1.1 公尺取景，看向場中，垂直視角 32 度。
- 拍照分支不進入 `setMode('walk')`，一般遊戲逐幀更新於該模式提早返回。隱藏介面及場館標籤、開啟建築結構與最高畫質後製，完成編譯與繪製後設定 `window.__creatorShot.ready`。
- `tools/shoot-creator-bg.cjs` 使用 Node 22+ 內建 WebSocket/CDP、獨立 headless Chrome 或 Edge 設定檔與暫時的本機靜態伺服器，等待照片就緒後輸出 2560×1440、JPEG 品質 88 的檔案。結束時清理本輪建立的瀏覽器與暫存目錄。
- `openCreator` 接受 `background`，預設 `assets/creator-bg.jpg`。主畫布啟用透明背景，照片以 CSS 鋪底，只有照片載入失敗才呼叫 `buildCourt`。
- 角色腳下加入 `ShadowMaterial` 平面，主舞台光色及曝光參照球館的暖白主光、冷色補光。
- 全身鏡頭高度改為 1.1 公尺、距離 4.2 公尺。主舞台使用固定拍照透視，再同步裁切照片和相機投影以拉近部位，背面鏡頭改為轉動角色。此為本輪採用的實作選擇，待視覺驗收確認。
- 關閉時解除照片事件並釋放新增的陰影平面。格子控制流程、角色模型與外觀代碼保持原有實作。

## 拍圖阻塞與重拍方式

已嘗試本機 headless Chrome 與 Edge。Chrome 初次的 Page.enable 曾逾時，加入 headless 環境參數後可連接 CDP，但外部依賴持續回傳 `net::ERR_NETWORK_ACCESS_DENIED`，最後等待 `window.__creatorShot.ready` 逾時。Three.js 等 CDN 依賴因此無法載入，未能渲染球館。

另以瀏覽器工具檢查可用連線，回傳 `The browser access host is unavailable`，無可用瀏覽器分頁連線。

在可正常載入網站 CDN 的環境，以 PowerShell 執行以下命令。

```powershell
Set-Location 'D:\開排球場\volleycourt'
node tools/shoot-creator-bg.cjs
```

工具預設尋找 Windows Chrome，其次為 Edge。可用 `$env:CHROME_PATH` 指定執行檔。腳本目前含 `--no-sandbox` 以配合本輪隔離環境的 headless 啟動，並使用獨立暫存設定檔。一般環境可先移除此旗標測試。

拍圖成功後先檢查 `assets/creator-bg.jpg`，確認網子、場線、看台與乾淨站位均入鏡，必要時調整 `prepareCreatorShot` 內的場內座標再重拍。鏡頭俯角須與 `creator.js` 的全身鏡頭一致。此工具提供靜態檔案服務，若球館依賴共用配置 API，需確認該次載入的是預期配置。

## 自動檢查結果

| 檢查 | 本輪結果 |
| --- | --- |
| verify-3v3-back-sets | 通過 |
| verify-ai-attack-routing | 通過 |
| verify-position-setters | 通過 |
| verify-web001b | 失敗，前輪已記錄歷史全文比對與舊外觀假設不符 |
| verify-web001c | 通過，9 項 |
| verify-web002-state | 通過，4 項 |
| verify-web002 | 失敗，本機 8787 連線遭拒 |
| verify-web002b | 失敗，前輪已記錄開場流程斷言尚未更新 |
| verify-web003a | 通過，9 項 |
| verify-web003b | 通過，9 項 |
| verify-web005c | 通過，另於最後修改後再次執行通過 |
| creator.js 與拍圖工具語法 | 通過 |
| git diff --check | 通過 |

共 8 個既有檢查腳本通過、3 個失敗，與上一輪報告列出的結果一致。本輪未修改這些測試，也未更動物理、擊球、AI 或連線程式。

## 尚待完成

1. 產出並檢查真實球館背景照片，加入 Git。
2. 在 `character-creator.html` 實測全身、拉近頭、拉近腳、背面、拖曳與視窗尺寸變化。確認裁切同步、角色貼地、陰影與光色。
3. 以實際 `index.html` 流程清除 `vb.settings.look` 後按開始遊戲，確認照片背景與角色儲存進大廳流程。
4. 刻意指定不存在的 `background` 或攔截照片請求，確認回退球場能渲染及操作。
5. 將全身、拉近頭、拉近腳截圖存至 `D:\開排球場\codex工作單\WEB_005D_截圖\`，並補記實際遊戲入口截圖。
6. 處理前輪留下的三項檢查失敗，再執行全部回歸檢查。

## 報告與提交範圍

本報告原件位於使用者指定的 `D:\開排球場\codex工作單\WEB_005D_報告.md`。該路徑在儲存庫之外，沿用前輪方式將同內容複本存入 `volleycourt/docs/WEB_005D_報告.md`，供 Git 提交。

本輪提交僅列出 `creator.js`、`gym.html`、`tools/shoot-creator-bg.cjs` 與報告複本。未推送、未部署。提交結果於下節記錄。

## 提交結果

已執行逐檔 `git add`，並嘗試以 `feat: 球館背景拍攝與捏臉背景接線（WEB-005D 進度）` 提交。Git 回傳以下錯誤。

```text
fatal: cannot update the ref 'refs/heads/game-site': unable to append to '.git/logs/refs/heads/game-site': Permission denied
```

提交未成功，修改及報告留在工作目錄與暫存區。HEAD 仍為 `158600b`。目前環境無法寫入分支 reflog，後續須在具正常 Git 寫入權限的環境提交。本輪未修改 Git 權限或分支參照。
