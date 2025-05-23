# 即時揭曉QR抽獎系統

一個基於Cloudflare生態系統的無伺服器、即時QR碼抽獎系統。此專案允許參與者生成QR碼，通過WebSocket進行即時更新並接收抽獎結果，而操作員則掃描QR碼以觸發抽獎過程。

## 概述

即時揭曉QR抽獎系統採用前端與後端分離的架構設計，以實現高可用性和可擴展性。它包含一個統一的前端應用程式（參與者和操作員介面通過不同路徑訪問）以及一個處理API請求和WebSocket通訊的後端Cloudflare Worker。前端和後端都部署到單一的Cloudflare Worker，以實現簡潔性。

## 檔案結構

```
.
├── frontend/                   # 統一前端（用於Cloudflare部署）
│   ├── public/                 # 部署用的靜態檔案目錄
│   │   ├── index.html          # 兩個介面的主要HTML（預設為參與者介面，通過/operator路徑訪問操作員介面）
│   │   ├── style.css           # 兩個介面的共享樣式
│   │   └── app.js              # 用於QR碼生成、掃描和WebSocket的JavaScript，包含路由邏輯
│
├── worker/                     # 後端Cloudflare Worker
│   ├── src/
│   │   └── index.js            # Worker腳本（HTTP API和WebSocket邏輯，現在也處理靜態檔案服務）
│
├── .gitignore                  # （可選）指定Git中忽略的檔案
├── README.md                   # 專案描述和部署指南（英文版）
├── README_zh-Hant.md          # 專案描述和部署指南（繁體中文版）
└── Technical Specification.md  # 詳細技術文件
```

## 技術棧

- **前端託管**：Cloudflare Workers（與後端一起部署時）
- **後端邏輯與WebSocket**：Cloudflare Workers
- **狀態與資料儲存**：Cloudflare Workers KV（用於會話狀態和少量獎品資訊）
- **圖片儲存**：Cloudflare R2（用於儲存抽獎結果圖片）
- **QR碼生成（前端）**：JavaScript庫（例如`qrcode.js`）
- **QR碼掃描（操作員端）**：HTML5 QR碼掃描庫（例如`jsQR`）

## 部署說明

本節提供將即時揭曉QR抽獎系統部署到單一Cloudflare Worker的基本步驟。

### 前提條件

1. **Cloudflare帳戶**：如果您還沒有帳戶，請在[Cloudflare](https://www.cloudflare.com/)註冊。
2. **Wrangler CLI**：安裝用於管理Cloudflare Workers的Wrangler CLI工具。請遵循[Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)的說明。
3. **Node.js和npm**：運行部署腳本所需。

### 步驟

KV命名空間和R2儲存桶的參數直接在Cloudflare上配置，然後在您的`worker/wrangler.toml`檔案中引用。

1.  **創建Cloudflare資源**：
    -   **Workers KV命名空間**：在Cloudflare儀表板中，前往「Workers」>「KV」。創建一個命名空間（例如`INSTAREVEAL_SESSIONS`）。記下其**ID**。此 KV 命名空間將用於會話資料和儲存獎品圖片設定。
    -   **R2儲存桶（可選，用於獎品圖片）**：前往Cloudflare儀表板中的「R2」。創建一個儲存桶（例如`prize-images`）。記下其**名稱**。此儲存桶將儲存您的獎品圖片。

2.  **更新Worker配置（`worker/wrangler.toml`）**：
    -   創建或更新`worker/wrangler.toml`，包含您的Worker設定和資源綁定。此檔案告訴Wrangler如何將您的Worker連接到您創建的Cloudflare資源。
    -   確保`[assets]`部分指向您的前端公共目錄。
        ```toml
        name = "instareveal-qr-draw"
        main = "src/index.js"
        compatibility_date = "2023-10-01"

        # 使用從Cloudflare儀表板獲取的ID綁定您的KV命名空間
        [[kv_namespaces]]
        binding = "YOUR_KV_NAMESPACE" # 這是您的Worker腳本中使用的變數名稱（例如，env.YOUR_KV_NAMESPACE）
        id = "YOUR_KV_NAMESPACE_ID"  # 替換為從Cloudflare儀表板獲取的實際ID

        # 使用從Cloudflare儀表板獲取的名稱綁定您的R2儲存桶
        [[r2_buckets]]
        binding = "PRIZE_IMAGE_BUCKET" # 這是您的Worker腳本中使用的變數名稱（例如，env.PRIZE_IMAGE_BUCKET）
        bucket_name = "prize-images" # 替換為從Cloudflare儀表板獲取的實際名稱

        # 指定靜態資產（前端檔案）的目錄
        [assets]
        directory = "../frontend/public"
        ```
    -   **重要**：將`YOUR_KV_NAMESPACE_ID`和`prize-images`替換為您從Cloudflare儀表板獲取的實際ID和名稱。綁定名稱（`YOUR_KV_NAMESPACE`，`PRIZE_IMAGE_BUCKET`）是您在`worker/src/index.js`腳本中訪問這些資源時使用的名稱（例如，`env.YOUR_KV_NAMESPACE`）。

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

-   **WebSocket連接問題**：檢查Cloudflare Worker日誌（`wrangler tail`）。
-   **API錯誤**：確保Worker腳本驗證輸入並處理錯誤。

## 安全考量

-   使用HTTPS/WSS（Cloudflare預設啟用）。
-   確保會話ID是隨機且難以猜測的。

## 可擴展性注意事項

-   監控Workers KV和WebSocket並發連接限制。

## 未來增強功能

-   支持多種獎品類型。
-   用於事件配置的管理員儀表板。

有關更多技術細節，請參閱專案根目錄中的`Technical Specification.md`文件。
