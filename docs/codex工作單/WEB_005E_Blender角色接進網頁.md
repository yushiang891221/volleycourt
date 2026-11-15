# 工作單 WEB-005E：Blender 做的角色模型（.glb）接進網頁，取代程式拼的角色

建立：2026-11-09。在 `volleycourt` 的 `game-site` 分支做。只做電腦版。
**不改玩法、物理、擊球判定、AI、連線協定。** 對外函式介面不變（`makeToyAvatar`、`setExpression`、`encodeLook`…），遊戲其他地方不用改。

## 素材（Claude 用 Blender 做好的，不要改）
- `models/avatar_0.glb`（男）、`models/avatar_1.glb`（女）：一副骨架＋所有零件（蒙皮網格）。
- `models/avatar_0.json`、`models/avatar_1.json`：零件清單 `parts`、骨頭 `bones`、關節位置 `joints`（**Blender 座標：Z 朝上、面向 -Y**；換成網頁座標是 `(x, y, z)_blender → (x, z, -y)`）、`armA`（A 字姿勢角度）、`headC`、`headR`。
- `models/jersey_layout.json`：球衣貼圖排版。
- Blender 腳本在 `blender/`（不要改，有問題寫進報告）。

### 零件名稱
| 零件 | 什麼時候顯示 |
|---|---|
| `body`、`head`（含耳朵鼻子）、`socks`、`shoeR`、`shoeL` | 一直顯示 |
| `top_0`～`top_3`＋`collar_0`～`collar_3` | 外觀 `top`（0 無袖 1 短袖 2 長袖 3 短版），collar 跟著 top |
| `pants_0`（排球短褲）、`pants_1`（運動長褲） | 外觀 `pants` |
| `knee_0`（黑）、`knee_1`（白） | 外觀 `knee`；`knee == 2` 或穿長褲時都不顯示 |
| `hair_0`～`hair_7`、`headband_3` | 外觀 `hair`；`headband_3` 只在 hair 3 |
**目前 glb 裡沒有 `collar_*`（領口滾邊條還沒做出來），找不到就略過，不能報錯。**實際名稱以 json 的 `parts` 為準（glTF 匯出可能改名，寫一個名稱對照，找不到的零件要在主控台警告）。

## 要做的事（都在 `avatar-toy.js`）

### 1. 預先載入
- 匯出 `preloadAvatars()`：用 `GLTFLoader` 載入兩個 glb 和兩個 json，回傳 Promise；模組一載入就開始載。
- 載入完成前 `makeToyAvatar` 先用現在程式拼的角色（保留舊程式當備用）；載入完成後新建的角色都用 glb。
- `creator.js`、`toy-preview.html`、遊戲進房前都要 `await preloadAvatars()`（捏臉畫面載入中顯示「角色載入中…」）。可以改 `creator.js` 這一小段。

### 2. 把 glb 的骨頭重新綁到我們的關節群組
遊戲的動作是 `avDrive()` 直接轉關節群組（`root、spine、head、legs[]、knees[]、feet[]、arms[]、elbows[]、hands[]`），所以：
- 照現在 `makeToyAvatar` 建一樣的群組結構，關節位置用 json 的 `joints`（轉成網頁座標，相對位置和舊版一致：`hipH 0.62`、`L1 0.29`、`L2 0.33`）。
- 骨頭對應：`root→root`、`spine→spine`、`head→head`、`thigh.R→legs[0]`、`shin.R→knees[0]`、`foot.R→feet[0]`、`upperarm.R→arms[0]`、`forearm.R→elbows[0]`、`hand.R→hands[0]`，`.L` 對應索引 1（**`R` 是角色右邊、在 -X 那側，跟現在 `[0]` 是右手一致**）。
- 每根骨頭建一個 `THREE.Bone` 掛在對應群組底下（位置 0），用這些 Bone 建新的 `Skeleton`，把需要的零件（`SkeletonUtils.clone` 複製，幾何共用）重新 `bind`。
- **A 字姿勢補回來**：模型的手臂是往外張 `armA` 弧度建的。綁定那一刻先把 `arms[0].rotation.z = -armA`、`arms[1].rotation.z = +armA`（讓群組姿勢跟模型一致），算完 `boneInverses` 後再把手臂轉回 0。這樣站著時手自然垂下，`avDrive` 照常驅動。綁完用 `toy-preview.html` 每個姿勢截圖確認手臂方向正確。
- `frustumCulled = false`（蒙皮網格的包圍盒會過時）。

### 3. 材質（依外觀與隊伍）
| 零件 | 材質 |
|---|---|
| `body`、`head` | 膚色 `OPTIONS.skin[look.skin]`，軟膠亮面：`MeshPhysicalMaterial` roughness 0.35、clearcoat 0.25 |
| `head` | 另外貼臉部貼圖（現在的 `faceTexture`）：head 沒有 UV，**載入時用球面投影算 UV**，中心 `headC`，對應 `SphereGeometry` 的慣例（正前方 u＝0.25）；跨背後接縫的面 u 要 +1、貼圖用 RepeatWrapping |
| `hair_*` | 髮色 `OPTIONS.hairColor`，`vertexColors: true`（頂點顏色是 Blender 烘好的陰影和天使環，要乘上去），roughness 0.24、clearcoat 0.7 |
| `top_*` | **用 canvas 畫隊服貼圖**，排版照 `jersey_layout.json`（下面說明），隊伍 `KITS.orange`／`KITS.blue` |
| `collar_*` | 隊伍滾邊色 `kit.trim` |
| `pants_*` | `kit.shorts` |
| `knee_0`／`knee_1` | 黑 `#24262C`／白 `#F2F2EE` |
| `socks` | `#F6F6F2`；`shoeR/L` 鞋身 `OPTIONS.shoe[look.shoe]`、鞋底白色（glb 裡鞋子有兩個材質，第二個是鞋底） |
| `headband_3` | `kit.accent` |

#### 球衣貼圖排版（`jersey_layout.json`，1024×1024，v 從下往上）
- 身體：v＝0.3（下擺）～1.0（領口）；u 繞身體一圈，**0.25 正前方、0.75 正後方、0／1 和 0.5 是兩側**。
- 袖子：v＝0～0.28；右袖 u＝0～0.5、左袖 u＝0.5～1。
- 要畫：底色 `kit.body`；兩側直條（u＝0、0.5、1 為中心，半寬 0.046，`kit.trim`）外加白色鑲邊（半寬 0.056）；插肩細線（白色，從 (0.25±0.075, v=1.0) 斜到 (0.25±0.2, v≈0.73)，背面以 0.75 為中心同樣畫）；背號：前面在 u＝0.25、身體高度約 70% 處，背後在 u＝0.75、約 60% 處、比較大。字體、顏色照現在 `jerseyTexture`（`kit.num`、`kit.numEdge`）。
- 可以參考 `blender/jersey.py` 的 `kit_image`（Blender 預覽用，同一套排版）。
- 貼圖依「隊伍＋背號」快取，不要每個角色各畫一張重複的。

### 4. 效能
- 一場最多 20 人＋AI。幾何共用、材質和貼圖依參數快取。
- 用 `?debug` 量 12 人上場 FPS，跟換之前比，寫進報告。glb 檔太大（超過 8 MB）或 FPS 掉很多，在報告寫出各零件面數，讓 Claude 在 Blender 減面。

### 5. 表情
`setExpression(av, key)` 照舊，換臉部貼圖。

## 不要做
- 不改 `blender/`、`models/` 裡的檔案；不改遊戲玩法、物理、AI、連線。
- 不推送、不部署，不動 `main`、`planning-site`。

## 驗收
1. `toy-preview.html`：8 種髮型、4 種球衣、2 種褲子、護膝、膚色、髮色、兩隊隊服都正確；每個 `PREVIEW_POSES` 姿勢手臂方向正確、衣服不撕裂。
2. 捏臉畫面縮圖和主畫面都是新模型。
3. 實際遊戲：進房後雙方隊服分別是橘黑和藍白、背號正確。
4. 載入失敗（glb 不存在）時退回舊角色，不會壞掉。
5. 舊的自動檢查都還要過；新寫 `tools/verify-web005e.cjs`（零件顯示規則、骨頭對應、UV 投影函式）。
6. 你的沙盒如果連不到 CDN 而無法實際看畫面，就把能自動檢查的做完，視覺部分寫進報告「待 Claude 驗收」。

## 報告
`codex工作單/WEB_005E_報告.md`（繁體中文），在 `game-site` 提交，不推送。提交失敗就把修改留在工作目錄並寫清楚。接近 50% 用量就停下寫進度。
