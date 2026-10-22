# 新竹排球館企劃網站：部署到 Vercel

這個資料夾就是整個網站（純靜態檔案，不需要 build）。

## 流程
1. 首頁：中間一顆排球，按「開始企劃」→ 火柴人扣球動畫 → 台灣地圖飛到新竹。
2. 地圖：候選場地是大圖釘，點了看挑高、坪數、租金、現在用途，按「進入球館」。
3. 3D 球館：依場地大小自動生成排球場，每面球場邊都會架攝影機；點物件看評估，點攝影機看比賽辨識 Demo。

## 方法 A：GitHub＋Vercel（建議，之後每天自動更新候選場地）
1. 在 GitHub 建一個空的 repo（例如 `hsinchu-volleyball`），把這個資料夾的內容上傳（或請 Claude 幫你推上去）。
2. 到 https://vercel.com/new → Import 那個 repo → Framework 選「Other」→ 直接按 Deploy。
3. 之後 repo 裡的 `data/sites.json` 一更新，Vercel 會自動重新上線。

## 方法 B：Vercel CLI（不用 GitHub）
在這個資料夾打開終端機：
```
npx vercel --prod
```
第一次會要你登入 Vercel，照提示按 Enter 就好。

## 資料檔
- `data/sites.json`：候選場地（每天自動更新的就是這個檔）。
- `data/criteria.json`：自動搜尋的條件（地區、最小坪數、最小挑高、月租上限）。
- `data/map.json`：縣市界、現有球館位置。
