# 工作單 WEB-004：Google 登入（Supabase）、暱稱與外觀存進帳號

建立：2026-11-10。在 `volleycourt` 的 `game-site` 分支做。只做電腦版。
**不改玩法、物理、擊球、AI、連線協定。**
參考（只讀）：Godot 版帳號設計 `volley-game/docs/WORKORDER_010.md`（資料表、安全規定沿用，登入流程改成網頁版）。

## 現況
- 使用者**還沒建 Supabase 專案和 Google 登入憑證**。這張先把程式和 SQL 做好，設定值留空；使用者建好後只要填兩個值就能用。
- 外觀現在存在本機 `localStorage['vb.settings.look']`（`appearance.js`）；暱稱是大廳的取暱稱視窗、存本機。
- 第一次進遊戲先捏角色（WEB-005C 做的流程）；角色資訊面板有「調整外觀」。

## 要做的事

### 1. 設定檔 `auth-config.js`
```js
export const SUPABASE_URL = '';        // 例：https://xxxx.supabase.co
export const SUPABASE_ANON_KEY = '';   // anon public key（本來就公開，可以放在網頁裡）
```
- **兩個都空 → 訪客模式**：完全照現在的行為（本機存外觀和暱稱），不顯示登入。
- 填好 → **登入模式**：要登入才能進大廳。
- 程式裡**絕對不能出現 service_role key**；token 不能印到主控台、畫面、報告。

### 2. 資料表 SQL：`server/supabase/001_profiles.sql`（使用者貼到 Supabase 的 SQL Editor 執行）
- `profiles`：`id uuid primary key references auth.users on delete cascade`、`nickname text unique`（2～12 字，檢查約束）、`appearance text`（外觀代碼 `t2…`，格式檢查）、`created_at`、`updated_at`。
- 開 RLS：所有登入者可以讀所有人的 `id, nickname, appearance`（進房要顯示別人的外觀和暱稱）；**只能新增／修改自己那一列**，而且只能改 `nickname`、`appearance`。
- 新帳號第一次登入自動建一列空的 `profiles`（觸發器），暱稱先空。
- 附一段「用另一個帳號改別人資料要失敗」的測試說明（給使用者照著在 SQL Editor 驗證）。

### 3. 登入流程（`auth.js`，用 `@supabase/supabase-js@2`，從 esm.sh 或 jsdelivr 載入、鎖定確切版本）
1. 開始畫面按「開始遊戲」→ 沒登入就顯示登入畫面：遊戲名稱、「使用 Google 登入」按鈕、說明一行「登入後可以保存角色外觀與暱稱」。樣式照大廳（深色實心面板、橘色主色）。
2. 按下 → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 目前網址 } })`，回來後自動完成登入（PKCE），session 由 supabase-js 保存、自動續期。
3. 登入後讀 `profiles`：
   - 暱稱空 → 先取暱稱（沿用大廳的取暱稱視窗；過濾前後空白、控制字元、換行，2～12 字；重複就提示換一個）。
   - 外觀空 → 開捏臉畫面（`openCreator({ mode: 'create' })`），完成後存進 `profiles.appearance`。
   - 都有 → 直接進大廳。
4. 原本存本機的外觀和暱稱：第一次登入時如果帳號是空的，**自動帶入本機的**（使用者不用重捏），存進帳號。
5. 角色資訊面板的「調整外觀」、改暱稱 → 存進帳號；同時更新本機快取（離線時也能顯示）。
6. 角色資訊面板加「登出」按鈕 → 登出後回到登入畫面。
7. 錯誤處理：登入被取消、網路斷線、Supabase 掛了，都要在畫面上用中文說清楚，並提供「重試」，不能卡住白畫面。

### 4. 進房顯示
進房時傳的暱稱和外觀代碼用帳號裡的（連線協定不變，照現在的欄位傳）。

### 5. 部署注意（寫進報告給使用者）
- Supabase 要設定：Authentication → Providers → Google（填 Google 的 Client ID / Secret）；URL Configuration 的 Site URL 和 Redirect URLs 要加 `https://volleycourts.vercel.app`、本機測試用的 `http://localhost:5190`。
- Google Cloud Console 的 OAuth 用戶端：授權的重新導向 URI 填 Supabase 顯示的回呼網址（`https://xxxx.supabase.co/auth/v1/callback`）。
- 用一步一步的中文清單寫在報告最後，使用者看得懂、照著做。

## 不要做
- 不做 Apple、Discord 登入（之後再說）。不做等級、統計、排位（之後由官方伺服器寫）。
- 不推送、不部署，不動 `main`、`planning-site`、`blender/`、`models/`。

## 驗收
1. 設定留空：行為跟現在完全一樣（訪客模式），舊的自動檢查都過。
2. 新寫 `tools/verify-web004.cjs`：訪客／登入模式判斷、暱稱過濾、本機資料帶入帳號的邏輯、「空暱稱→取暱稱、空外觀→捏臉、都有→大廳」的流程判斷（用假的 supabase 物件測）。
3. SQL 檔語法正確（至少人工檢查並在報告說明每條 RLS 規則）。
4. 沙盒連不到外網的部分（實際登入）寫進報告「待使用者建好 Supabase 後由 Claude 驗收」。

## 報告
`codex工作單/WEB_004_報告.md`（繁體中文），在 `game-site` 提交，不推送。提交失敗就把修改留在工作目錄並寫清楚。用量接近 50% 就停下寫進度。
