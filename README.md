# Let's Play 排球（網頁遊戲）

電腦版瀏覽器 3D 排球遊戲。正式網站：https://volleycourts.vercel.app

- 想在新電腦上開發、或伺服器要搬家：看 [docs/開發環境.md](docs/開發環境.md)
- 接下來的大改版（伺服器當裁判）：看 [docs/架構-伺服器權威.md](docs/架構-伺服器權威.md)

## 資料夾

```
volleycourt/
├─ index.html            大廳（開始畫面、登入、房間列表）
├─ gym.html              球館（打球、練習、比賽）＝遊戲本體
├─ vbtv.html             球館 TV（嵌在 gym.html 裡播影片）
├─ character-creator.html  捏臉
├─ privacy.html          隱私權說明
├─ toy-preview.html      角色模型預覽（開發用）
├─ js/                   網頁用的程式（帳號、大廳、設定、捏臉、教學、比賽同步…）
├─ css/                  網頁樣式
├─ assets/               網頁素材：img 圖片／貼圖、models 角色與球館模型、sfx 音效、video 影片、data 球館資料
├─ api/                  Vercel 小程式（連線設定、Ably 通行證、球館資料）
├─ server/
│   ├─ rt/               台北伺服器（房間＋大廳），部署：bash server/rt/deploy.sh
│   ├─ shared/           網站和伺服器共用（驗證玩家登入）
│   └─ cloudflare-legacy/  舊的 Cloudflare 房間伺服器（已停用，留著備查）
├─ supabase/             資料庫設定（SQL，照編號順序在 Supabase 執行）
├─ tests/                自動檢查（node tools/run-tests.cjs 全部跑）
├─ tools/                開發工具（跑檢查、量 FPS、拍捏臉背景）
├─ art/                  美術原始檔：blender 建模腳本、球的貼圖產生器
│   ├─ models-src/       .blend 原始檔（太大，不進 git，只在本機）
│   └─ shots/            建模截圖（不進 git）
└─ docs/                 文件：架構、開發環境、工作單（codex工作單）、待辦（tickets.md）、歷次報告（報告/）
```

## 常用指令（在這個資料夾）

| 要做什麼 | 指令 |
|---|---|
| 本機開網站 | `python -m http.server 5180`，開 http://localhost:5180 |
| 本機不登入直接進練習房 | http://localhost:5180/gym.html?site=bs-shenjing&practice=1&dev（只有 localhost 有效） |
| 跑全部自動檢查 | `node tools/run-tests.cjs` |
| 更新台北伺服器 | `bash server/rt/deploy.sh` |
| 上線網站 | 推到 GitHub 的 `main`，Vercel 自動部署（開發在 `game-site` 分支） |
