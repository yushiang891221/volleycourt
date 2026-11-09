# WEB-005E 進度與驗證報告

日期：2026-11-09。分支：`game-site`。開工 HEAD：`aec523b`。

## 狀態

已完成 Blender 模型接線與本輪離線自動檢查，尚未完整驗收。CDN 請求被沙盒拒絕，視覺、實際蒙皮渲染及 12 人 FPS **待 Claude 驗收**。前兩輪既有的三項測試失敗仍未解決，不能宣稱「舊檢查全部通過」。

依使用者接近 50% 用量即停止的限制，本輪在完成接線與離線檢查後收尾。環境未提供可查詢的精確用量百分比，沒有宣稱實際量到 50%。

已讀 WEB-005E 工作單及 WEB-005C、WEB-005D 報告。未修改 `blender/`、`models/`；既存未追蹤 `models/hair_strands.png` 保留原狀。沒有推送、部署或切換其他分支。

## 已完成

- `avatar-toy.js` 匯出 `preloadAvatars()`，模組載入即預載。讀取球衣排版、兩份模型 metadata，以 GLTFLoader 解析兩份 GLB。請求有 15 秒時限，重複呼叫共用 Promise；個別性別失敗時回退原程序角色。舊角色程式保留，對外函式介面與回傳關節欄位保持相容。
- 由 GLTFLoader parser 的節點關聯建立原始零件名稱對照，處理 `head` 與骨頭重名、鞋子多 primitive。缺少零件會警告；缺少可選 collar 不報錯；缺少必要 body/head 則該性別回退。
- 以 JSON 關節建立原有群組層級，將 Blender 座標轉為 `(x,z,-y)`。保留 root 零位移及 `hipH=0.62`、`L1=0.29`、`L2=0.33`，維持既有貼地公式。
- 每個關節掛零位移 Bone；使用 SkeletonUtils.clone 共用幾何，每個角色重建獨立骨架。以 GLB 的實際骨頭順序重綁，保留 skinIndex 對應，不使用 JSON 陣列順序代替。匯出器額外的 `neutral_bone` 也有對應。
- 前臂／手掌的相對位置先消去 A 字角度；綁定時右臂 `-armA`、左臂 `+armA`，建立反矩陣後回到 0。所有蒙皮網格 `frustumCulled=false`。
- 頭部載入時產生球面 UV，正前方 u=0.25、背面 u=0.75。拆開接縫頂點，跨接縫三角形調整 u+1，臉貼圖使用 RepeatWrapping。
- 身體、頭、髮型、球衣、褲子、護膝、鞋身／白色鞋底、襪子、頭帶依外觀與隊伍指定材質。頭髮保留 vertexColors 並採工作單指定亮面參數。臉貼圖已有膚色，材質底色不重複乘膚色。
- 依 `jersey_layout.json` 畫 1024×1024 球衣，包含側條、白鑲邊、插肩線與前後背號。字型沿用舊 jerseyTexture 的 Bahnschrift／Arial Narrow 字型串列；貼圖依隊伍與號碼快取，材質依參數快取。
- `setExpression` 的 GLB 路徑改換快取材質，避免共用臉材質時一人換表情影響其他人。
- `creator.js` 保留同步回傳 close()，內部等待載入完成再建立主角色與縮圖，期間顯示「角色載入中…」並停用面板；提前關閉不再重建。
- `toy-preview.html` 等待預載；`gym.html` 在初始化遊戲前等待預載，讓自己、遠端與 AI 的首次建立使用完成載入的模型。沒有改 avDrive、玩法、物理、擊球、AI 或連線協定。

## 自動檢查

修改前後各跑一輪所有既有 verify 腳本，結果一致。

| 檢查 | 修改前 | 修改後 |
| --- | --- | --- |
| verify-3v3-back-sets | 通過 | 通過 |
| verify-ai-attack-routing | 通過 | 通過 |
| verify-position-setters | 通過 | 通過 |
| verify-web001b | 失敗 | 失敗 |
| verify-web001c | 通過 | 通過 |
| verify-web002-state | 通過 | 通過 |
| verify-web002 | 失敗 | 失敗 |
| verify-web002b | 失敗 | 失敗 |
| verify-web003a | 通過 | 通過 |
| verify-web003b | 通過 | 通過 |
| verify-web005c | 通過 | 通過 |
| verify-web005e（新增） | — | 通過 |
| git diff --check | — | 通過 |

既有失敗原因：

1. `verify-web001b`：歷史遊戲區塊全文比對已與目前版本不符，包括記分板與前輪外觀接線；本輪未放寬或刪掉其斷言。
2. `verify-web002`：本機 `localhost:8787` 沒有服務，`ECONNREFUSED`。此前語法與 Room/v1/gameplay transports 檢查通過。
3. `verify-web002b`：舊開場流程的 `assert(context.VBIntro.entered)` 失敗。前輪已改為非同步建立角色，舊測試尚未跟進。

新增 `tools/verify-web005e.cjs` 驗證：192 組髮型／球衣／褲子／護膝顯示規則、選配 collar、球面投影方向與中心、接縫處理、兩性關節的 A 字世界座標、左右索引與垂手位置、實際 GLB 的 16 個骨頭及蒙皮／頭髮色彩／球衣 UV 屬性、GLB 404、共用載入 Promise、按性別回退、模組語法與三個 await 入口。

此測試用小型 Vector3／Group 替身做 CPU 座標驗證並讀取實際 GLB JSON，**沒有執行真正 Three.js Skeleton／GLTFLoader 渲染**，不能代替貼皮變形和畫面驗收。

## 效能資料

`avatar_0.glb`：3,133,192 bytes；`avatar_1.glb`：3,134,592 bytes，均低於 8 MB。

全變體合計三角面數：男 89,662、女 89,660。實際只加入所選零件，並非每個角色同時繪製全部變體。供 Claude 後續減面參考：

| 零件 | 男 | 女 |
| --- | ---: | ---: |
| body | 6,000 | 6,000 |
| head | 3,000 | 3,000 |
| hair_0、1、2、4、5、6、7（各） | 7,000 | 7,000 |
| hair_3 | 6,999 | 6,999 |
| headband_3 | 1,728 | 1,728 |
| knee_0、knee_1（各） | 800 | 800 |
| pants_0、pants_1（各） | 2,500 | 2,500 |
| shoeL、shoeR（各，含鞋底） | 768 | 768 |
| socks | 800 | 800 |
| top_0 | 3,500 | 3,500 |
| top_1 | 3,499 | 3,499 |
| top_2、top_3（各） | 3,500 | 3,499 |

修改前／修改後 12 人 FPS：**未量測，待 Claude 驗收**。本輪 Node fetch 請求網站使用的 Three.js 0.160.0 CDN，得到 `fetch failed EACCES`。沒有產生或虛構瀏覽器截圖、FPS 或「衣服不撕裂」結論。

## 待 Claude 驗收與後續事項

1. `toy-preview.html` 的 8 髮型、4 球衣、2 褲子、護膝、所有膚色／髮色／鞋色、橘黑與藍白隊服；逐一截圖檢查 PREVIEW_POSES，特別是肩、腋下、手肘的方向及接縫。
2. 頭部五官、耳鼻的球面 UV、前後背號與球衣線條、鞋底兩 primitive 的材質；缺 collar 為目前素材已知狀態。
3. 捏臉主畫面與全部縮圖為 GLB，載入中與提前關閉的行為、換表情不影響別人。
4. 進房雙方隊伍、背號、遠端角色及 AI；實際瀏覽器攔截 GLB 請求，確認舊角色回退可操作。
5. 使用 `?debug`，在相同硬體、畫質、尺寸、視角下比較原 HEAD 與本輪的 12 人 FPS；必要時依上表減面。所有視覺與效能項目均為「待 Claude 驗收」。
6. 修復上述三項既有檢查或準備其本機服務，再達成工作單的全套舊測試通過。不要為了通過而移除物理／AI／連線保護。

## 報告與提交

使用者指定原件：`D:\開排球場\codex工作單\WEB_005E_報告.md`。該位置在儲存庫之外，另將同內容放入 `volleycourt/docs/WEB_005E_報告.md` 隨 Git 提交。

提交只包含 `avatar-toy.js`、`creator.js`、`gym.html`、`toy-preview.html`、`tools/verify-web005e.cjs`、本報告複本；不加入 `blender/` 或 `models/`。

已逐檔暫存並嘗試提交 `feat: 接入 Blender 蒙皮角色與載入回退（WEB-005E）`，但 Git 回傳：

```text
fatal: cannot update the ref 'refs/heads/game-site': unable to append to '.git/logs/refs/heads/game-site': Permission denied
```

因此提交未成功。HEAD 仍為 `aec523b`，本輪六個檔案保留在工作目錄與暫存區，報告已同步回指定原件位置。未修改 Git 權限、分支參照，未推送或部署。需在可正常寫入 reflog 的環境完成提交。
