# WEB-005F 報告：顯示球員名牌開關

日期：2026-11-10。分支：game-site。

## 完成內容
- settings.js 新增 nameTags 布林設定，預設 true；「畫面」分頁在顯示 FPS 後加入「顯示球員名牌」。
- 沿用 clean/defaults 遷移：舊 vb.settings 缺少欄位、舊獨立儲存鍵及無效值均預設顯示；明確 false 會保存並於重新載入後保留。
- gym.html 新增 applyNameTags()，載入時及既有 vb-settings-change 流程即時切換 body.hide-nametags；CSS 自動涵蓋現有及之後加入的名牌。
- 掃描全部 CSS2DObject 建立處：球員名牌共五處，涵蓋遠端玩家、球拍運動 AI、陪練、遠端玩家的 AI 對手及排球 AI。原約 10054 行實際是 vmMkAi，並非另一處遠端玩家。自己目前沒有獨立姓名名牌；未新增任何名牌。
- 黃色標籤是 vmShout(t) 的喊球提示（例如「快！」），1200 毫秒後移除，不是姓名名牌。增加 mp-shout 分類排除，保留原外觀與提示行為。
- 使用 visibility: hidden，避開 CSS2DRenderer 行內 display 的覆寫；未修改原名牌樣式。此環境 CDN 無法連線，未在此重新取得 renderer 原始碼作實際驗證。

## 驗證結果
新增 tools/verify-web005f.cjs 已通過：預設值、布林驗證、儲存/重新載入、舊設定遷移、不影響其他設定、儲存失敗仍即時套用、class 開關、事件接線及喊話排除。

全部 14 支 tools/verify-*.cjs 執行結果：11 支通過、3 支未通過。

通過：verify-3v3-back-sets、verify-ai-attack-routing、verify-position-setters、verify-web001c、verify-web002-state、verify-web003a、verify-web003b、verify-web004、verify-web005c、verify-web005e、verify-web005f。

未通過：
- verify-web001b：與歷史版本 4613d8a 的玩法片段比對失敗。以 Git HEAD 的 gym.html 在記憶體替換重跑，同樣失敗，確認非本次新增造成；未改動既有測試或玩法來消除差異。
- verify-web002b：舊入場測試的 VBIntro.entered 斷言失敗；以 HEAD 的 gym.html 重跑亦相同，涉及本次未修改的入場流程。
- verify-web002：要求本機 wrangler dev 在 8787 運行，本次因 ECONNREFUSED 未完成服務整合驗證。

gym.html 模組語法檢查通過，git diff --check 通過。自動測試是離線驗證，不能取代實際畫面驗收。

## 待 Claude 驗收
CDN 探測 fetch failed；本環境亦無可直接載入的 Playwright 套件，未完成 Three.js/WebGL 視覺驗收。
1. 電腦版設定 → 畫面取消勾選，確認玩家、AI、陪練名牌即時消失，重新勾選即時出現。
2. 關閉後重新整理、加入新玩家或生成新 AI，確認維持隱藏。
3. 確認黃色喊球提示仍顯示。
4. 啟動本機測試服務後補跑 verify-web002；既有失敗另行處理。

## 範圍與交付
- 不改玩法、物理、擊球、AI 邏輯或連線協定；未推送、未部署，未切換 main/planning-site。
- 未修改 blender/、models/，也未納入原有 avatar-toy.js、tools/measure-fps.cjs 或其他工作目錄修改。
- 指定報告：D:\開排球場\codex工作單\WEB_005F_報告.md。
- 指定路徑位於 volleycourt Git 倉庫外，因此另存完全相同的 docs/WEB_005F_報告.md 隨程式提交。
- 程式與離線檢查已收尾；為遵守用量接近 50% 即停止的要求，不擴大排查既有問題。此環境未提供精確用量百分比，故不宣稱已量測到 50%。剩餘驗收如上。

## 提交失敗（實際結果）
已嘗試 git commit，但 Git 回報：cannot update the ref refs/heads/game-site；無法附加寫入 .git/logs/refs/heads/game-site（Permission denied）。因此未完成分支提交，四個本次交付檔案保留在工作目錄及暫存區，未推送或部署。未變更權限或繞過限制。
