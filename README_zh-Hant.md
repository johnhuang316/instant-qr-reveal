# 即時揭曉QR抽獎系統

一個基於Cloudflare生態系統的無伺服器、即時QR碼抽獎系統。此專案允許參與者生成QR碼，通過HTTP輪詢接收即時更新並獲取抽獎結果，而操作員則掃描QR碼以觸發抽獎過程。

## 概述

即時揭曉QR抽獎系統採用前端與後端分離的架構設計，以實現高可用性和可擴展性。它包含一個統一的前端應用程式（參與者、操作員和管理員介面通過不同路徑訪問）以及一個處理API請求和排程任務的後端Cloudflare Worker。前端和後端都部署到單一的Cloudflare Worker，以實現簡潔性。

## 檔案結構

```
.
├── frontend/                   # 統一前端（用於Cloudflare部署）
│   ├── public/                 # 部署用的靜態檔案目錄
│   │   ├── index.html          # 參與者介面的主要HTML（操作員通過/operator路徑訪問，管理員通過/admin路徑訪問）
│   │   ├── style.css           # 所有介面的共享樣式
│   │   ├── app.js              # 參與者介面的主要JavaScript（QR碼生成、輪詢、UI更新）
│   │   ├── operator.js         # 操作員介面的JavaScript（QR碼掃描）
│   │   ├── admin.js            # 管理員介面的JavaScript（R2圖片管理）
│   │   └── participant.js      # (可選，如果需要單獨的參與者邏輯)
│
├── worker/                     # 後端Cloudflare Worker
│   ├── src/
│   │   └── index.js            # Worker腳本（HTTP API邏輯、排程任務，也提供靜態檔案服務）
│   │   └── index-backup.js     # 包含WebSocket邏輯的原始Worker腳本（供參考）
│
├── .gitignore                  # 指定Git中忽略的檔案
├── README.md                   # 專案描述和部署指南（英文版）
├── README_zh-Hant.md          # 專案描述和部署指南（繁體中文版）
├── TODO.md                     # 專案開發路線圖和清單
└── Technical Specification.md  # 詳細技術文件
```

## 技術棧

- **前端託管**：Cloudflare Workers（與後端一起部署時）
- **後端邏輯與輪詢**：Cloudflare Workers
- **狀態與資料儲存**：Cloudflare D1（用於會話狀態）
- **圖片儲存**：Cloudflare R2（用於儲存抽獎結果圖片）
- **QR碼生成（前端）**：JavaScript庫（`qr-code-styling.js`）
- **QR碼掃描（操作員端）**：JavaScript庫（`jsQR`）

## 部署說明

本節提供將即時揭曉QR抽獎系統部署到單一Cloudflare Worker的基本步驟。

### 前提條件

1. **Cloudflare帳戶**：如果您還沒有帳戶，請在[Cloudflare](https://www.cloudflare.com/)註冊。
2. **Wrangler CLI**：安裝用於管理Cloudflare Workers的Wrangler CLI工具。請遵循[Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)的說明。
3. **Node.js和npm**：運行部署腳本所需。

### 步驟

D1資料庫和R2儲存桶的參數直接在Cloudflare上配置，然後在您的`worker/wrangler.toml`檔案中引用。

1.  **創建Cloudflare資源**：
    -   **D1資料庫**：在Cloudflare儀表板中，前往「Workers」>「D1」。創建一個資料庫（例如`instareveal-sessions`）。記下其**ID**。此 D1 資料庫將用於會話資料。
    -   **R2儲存桶（可選，用於獎品圖片）**：前往Cloudflare儀表板中的「R2」。創建一個儲存桶（例如`prize-images`）。記下其**名稱**。此儲存桶將儲存您的獎品圖片。

2.  **更新Worker配置（`worker/wrangler.toml`）**：
    -   創建或更新`worker/wrangler.toml`，包含您的Worker設定和資源綁定。此檔案告訴Wrangler如何將您的Worker連接到您創建的Cloudflare資源。
    -   確保`[assets]`部分指向您的前端公共目錄。
        ```toml
        name = "instareveal-qr-draw"
        main = "src/index.js"
        compatibility_date = "2023-10-01"

        # 使用從Cloudflare儀表板獲取的ID綁定您的D1資料庫
        [[d1_databases]]
        binding = "SESSIONS_DB" # 這是您的Worker腳本中使用的變數名稱（例如，env.SESSIONS_DB）
        database_name = "instareveal-sessions"
        database_id = "YOUR_D1_DATABASE_ID"  # 替換為從Cloudflare儀表板獲取的實際ID

        # 使用從Cloudflare儀表板獲取的名稱綁定您的R2儲存桶
        [[r2_buckets]]
        binding = "PRIZE_IMAGE_BUCKET" # 這是您的Worker腳本中使用的變數名稱（例如，env.PRIZE_IMAGE_BUCKET）
        bucket_name = "prize-images" # 替換為從Cloudflare儀表板獲取的實際名稱

        # 指定靜態資產（前端檔案）的目錄
        [assets]
        directory = "../frontend/public"

        # 用於R2公共端點派生的環境變數
        [vars]
        CLOUDFLARE_ACCOUNT_ID = "YOUR_CLOUDFLARE_ACCOUNT_ID" # 替換為您的實際Cloudflare帳戶ID
        PRIZE_IMAGE_BUCKET_NAME = "prize-images" # 確保這與上面的bucket_name匹配

        # 排程清理觸發器（例如，每天UTC午夜運行）
        [triggers]
        crons = ["0 0 * * *"]
        ```
    -   **重要**：將`YOUR_D1_DATABASE_ID`和`YOUR_CLOUDFLARE_ACCOUNT_ID`替換為您從Cloudflare儀表板獲取的實際ID。綁定名稱（`SESSIONS_DB`，`PRIZE_IMAGE_BUCKET`）是您在`worker/src/index.js`腳本中訪問這些資源時使用的名稱（例如，`env.SESSIONS_DB`）。

3.  **部署Worker**：
    -   打開終端機並`cd`進入`worker`目錄。
    -   驗證Wrangler：`wrangler login`
    -   部署Worker與資產：`npx wrangler deploy --assets ../frontend/public`

### 通過管理面板配置和管理獎品圖片

部署 Worker 後，您可以使用新的管理面板管理您的獎品圖片並配置 R2 公共端點。

1.  **訪問管理面板**：導航到 `your-worker-domain.workers.dev/admin`（將 `your-worker-domain.workers.dev` 替換為您部署的 Worker 的 URL）。

2.  **配置 R2 公共端點（KV 設定）**：
    -   在「獎品圖片設定 (KV)」部分，輸入您的 R2 儲存桶的 **R2 公共端點**（例如 `https://pub-YOUR_ACCOUNT_ID.r2.dev/your-bucket-name`）。此 URL 由 Worker 用於建構圖片路徑。
    -   點擊「儲存設定到 KV」。此值將儲存在您的 Workers KV 命名空間中。

3.  **上傳和管理 R2 中的圖片**：
    -   在「管理 R2 圖片」部分：
        -   **上傳圖片**：點擊「選擇檔案」從您的電腦中選擇一個或多個圖片檔案。然後，點擊「上傳選定的圖片到 R2」將它們直接上傳到您配置的 R2 儲存桶。
        -   **列出圖片**：R2 中的「當前圖片」部分將自動顯示在您的 R2 儲存桶中找到的圖片。
        -   **刪除圖片**：對於每個列出的圖片，您將看到一個「刪除」按鈕。點擊它以從您的 R2 儲存桶中刪除圖片。
    -   **重要**：如果您希望圖片通過其公共 URL 直接訪問，請確保您的 R2 儲存桶已配置為公開訪問。

4.  **更新獎品圖片檔案名稱（KV 設定）**：
    -   在 R2 中上傳或管理圖片後，更新「獎品圖片檔案名稱（逗號分隔）」欄位，位於「獎品圖片設定 (KV)」部分。輸入您希望用於抽獎的圖片的確切檔案名稱，用逗號分隔（例如 `prizeA.png, prizeB.png, prizeC.png`）。這些檔案名稱必須與您已上傳到 R2 的圖片的鍵相符。
    -   點擊「儲存設定到 KV」。這些檔案名稱將儲存在您的 Workers KV 命名空間中，並在 Worker 選擇獎品時使用。

### 測試部署

1.  **參與者介面**：訪問部署的Worker URL（例如`your-worker-domain.workers.dev`）。
2.  **操作員介面**：通過`your-worker-domain.workers.dev/operator`訪問操作員介面。
3.  **驗證功能**：測試QR碼生成、掃描和即時抽獎結果。獎品圖片現在應該根據管理面板中配置的設定從您的 R2 儲存桶中獲取。

## 故障排除

-   **輪詢問題**：檢查Cloudflare Worker日誌（`wrangler tail`）。
-   **API錯誤**：確保Worker腳本驗證輸入並處理錯誤。

## 安全考量

-   使用HTTPS/WSS（Cloudflare預設啟用）。
-   確保會話ID是隨機且難以猜測的。

## 可擴展性注意事項

-   監控D1和輪詢並發連接限制。

## 未來增強功能

-   支持多種獎品類型。
-   用於事件配置的管理員儀表板。

有關更多技術細節，請參閱專案根目錄中的`Technical Specification.md`文件。
