# InstaReveal QR Draw System - TODO List

## 🔄 架構重構 (從 WebSocket 改為輪詢)

### 後端改動
- [x] 移除所有 WebSocket 相關程式碼
  - [x] 移除 `webSocketConnections` Map
  - [x] 移除 `/ws` endpoint
  - [x] 移除 WebSocket message handlers
- [x] 從 KV 遷移到 D1
  - [x] 在 wrangler.toml 中配置 D1 database binding
  - [x] 創建 D1 database schema
    ```sql
    CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        drawn_at DATETIME,
        result_image_url TEXT,
        client_ip TEXT
    );
    CREATE INDEX idx_status ON sessions(status);
    CREATE INDEX idx_created_at ON sessions(created_at);
    ```
  - [x] 修改所有 KV 操作改為 D1 SQL 查詢
  - [x] 實作資料清理機制（刪除超過 24 小時的 sessions）

### 前端改動
- [x] 移除所有 WebSocket 連線程式碼
- [x] 實作輪詢機制
  - [x] 每 500ms 查詢一次狀態
  - [x] 加入隨機抖動 (±50ms) 避免同時請求
  - [x] 收到結果後立即停止輪詢
- [ ] 移除 QRCodeStyling 相關程式碼（如果決定不顯示 QR Code）

## ⚡ 效能優化

### 前端優化
- [x] **減少回應大小**
  - [x] API 只返回必要欄位 (status, imageUrl)
  - [x] 使用更短的欄位名稱
  - [x] 考慮使用數字狀態碼代替字串

- [x] **智能輪詢策略**
  ```javascript
  // 實作指數退避策略
  // 開始: 500ms
  // 5秒後: 1000ms  
  // 30秒後: 2000ms
  // 1分鐘後: 3000ms
  ```
  - [x] 加入隨機抖動 (±50ms) 避免同時請求

- [x] **請求優化**
  - [x] 使用 `AbortController` 取消進行中的請求
  - [x] 實作請求去重（防止重複發送）
  - [x] 加入請求超時處理（3秒）

### 後端優化
- [x] **HTTP 快取**
  - [x] 為未改變的狀態加入 `Cache-Control` header
  - [x] 使用 `ETag` 或 `Last-Modified`
  - [x] 返回 304 Not Modified 當狀態未變更

- [x] **D1 查詢優化**
  - [x] 使用 prepared statements
  - [x] 只查詢需要的欄位
  - [ ] 考慮批次查詢（如果有多個 session）

## 🎨 用戶體驗優化

### 等待體驗
- [x] **視覺回饋**
  - [ ] 實作脈動動畫效果
  - [x] 加入進度指示器（假進度條）
  - [x] 顯示「掃描中...」的動態文字
  - [ ] 實作骨架屏（Skeleton Screen）

- [x] **互動回饋**
  - [x] 結果出現時的震動提醒（使用 Vibration API）
  - [ ] 音效提示（可選開關）
  - [ ] 成功動畫（如彩帶效果）

### 錯誤處理
- [x] **網路錯誤**
  - [x] 顯示友善的錯誤訊息
  - [x] 自動重試機制（最多 3 次）
  - [ ] 提供手動重試按鈕

- [x] **超時處理**
  - [x] 5 分鐘無結果自動停止輪詢
  - [ ] 顯示「請聯繫工作人員」訊息
  - [ ] 記錄超時事件供除錯

## 📱 前端體驗細節

### 效能優化
- [x] **資源管理**
  - [x] 頁面隱藏時暫停輪詢（Page Visibility API）
  - [x] 頁面返回時恢復輪詢
  - [x] 清理未使用的定時器

- [x] **載入優化**
  - [x] 預載入可能的獎品圖片
  - [ ] 使用 WebP 格式減少圖片大小
  - [ ] 實作圖片懶載入

### 相容性
- [x] **瀏覽器支援**
  - [ ] 測試主流瀏覽器
  - [ ] 加入 polyfills（如需要）
  - [ ] 優雅降級處理

- [x] **裝置適配**
  - [ ] 響應式設計優化
  - [ ] 觸控手勢支援
  - [ ] 橫豎屏切換處理

## 🔍 監控與除錯

### 日誌記錄
- [ ] **前端日誌**
  - [ ] 記錄輪詢開始/結束時間
  - [ ] 記錄網路錯誤
  - [ ] 記錄效能指標

- [ ] **後端日誌**
  - [ ] 記錄每個 session 的生命週期
  - [ ] 記錄 D1 查詢效能
  - [ ] 記錄錯誤和異常

### 監控指標
- [ ] **效能監控**
  - [ ] API 回應時間
  - [ ] D1 查詢時間
  - [ ] 前端輪詢成功率

- [ ] **使用分析**
  - [ ] 同時在線人數
  - [ ] 平均等待時間
  - [ ] 錯誤率統計

## 🚀 部署相關

### 配置更新
- [ ] 更新 wrangler.toml
  - [ ] 移除 KV namespace binding
  - [ ] 加入 D1 database binding
  - [ ] 更新環境變數

### 測試
- [ ] **單元測試**
  - [ ] 測試輪詢邏輯
  - [ ] 測試錯誤處理
  - [ ] 測試 D1 查詢

- [ ] **整合測試**
  - [ ] 模擬多人同時使用
  - [ ] 測試網路中斷情況
  - [ ] 測試超時場景

- [ ] **壓力測試**
  - [ ] 測試 1000+ 同時輪詢
  - [ ] 監控資源使用
  - [ ] 找出效能瓶頸

## 📝 文件更新

- [ ] 更新 README.md
  - [ ] 說明新的輪詢架構
  - [ ] 更新部署步驟
  - [ ] 加入效能數據

## 🎯 優先順序建議

1. **第一階段**（核心功能）
   - 實作 D1 遷移
   - 實作基本輪詢機制
   - 移除 WebSocket 程式碼

2. **第二階段**（體驗優化）
   - 加入載入動畫
   - 實作錯誤處理
   - 優化輪詢策略

3. **第三階段**（效能優化）
   - HTTP 快取實作
   - 請求優化
   - 監控系統

---

更新日期：2024-01-XX
最後修改：[Your Name]
