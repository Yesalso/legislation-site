# 「九」法規查詢系統 —— 前端（公開版）

> 純 HTML / CSS / JavaScript，**無框架、無建置步驟、零依賴**。
> 線上展示：`https://<owner>.github.io/<repo>/`

這是法規查詢系統的**界面層**：12 個頁面、樣式與前端邏輯。

## 為什麼是「界面展示版」

原始系統是 Node.js 後端 + 純前端：`server.js` 提供 18 個 `/api/*` 端點，
資料來自三處機器派生目錄（命令文書 → 法規正文/版本 → 事件流）。
那些資料屬於私有內容，**不在此倉庫內**，後端引擎亦未包含。

因此線上站台只承載界面：目錄、搜尋結果、條文與版本內容為空屬**預期行為**，
頁面頂部會顯示提示條。`js/static-api.js` 的作用就是讓 `/api/*` 取數
落到空快照而**不是 404**，避免整站報錯。

## 目錄

| 路徑 | 說明 |
|---|---|
| `index.html` | 法規目錄（首頁） |
| `detail.html?lawId=` | 法規詳情：目錄、沿革時間軸 |
| `archive.html` | 立法歷程 |
| `drafts.html` / `orders.html` / `meetings.html` / `regulations.html` | 各板塊清單 |
| `tw.html` | 台灣法規 |
| `draft_detail.html` / `order_detail.html` / `amendment.html` | 文書全文與條文對比 |
| `css/` | `style.css`（版式）、`theme.css`（主題變量與深色模式） |
| `js/` | `app.js`（詳情頁）、`search.js`、`archive.js`、`section.js`、`home-widgets.js` 等 |
| `js/static-api.js` | **靜態站取數適配層**，只在導出產物中載入 |
| `tools/export-static.js` | 生成可部署的 `site/` |

## 建置與預覽

```bash
npm run export            # 產出 site/
cd site && python -m http.server 3900   # 打開 http://127.0.0.1:3900/
```

`export-static.js` 會：

1. 複製 11 個頁面（不含開發用頁面），並在 `<head>` 後注入 `js/static-api.js`；
2. 複製 `css/`、`js/`；
3. 寫出結構合法但為空的 `api/snapshot.json`；
4. 寫 `.nojekyll`（避免 Jekyll 忽略下劃線檔案、誤解析 JS 裡的 `{{ }}`）。

## 部署

推送到 `main` 後由 `.github/workflows/pages.yml` 自動建置並發佈。

> 首次使用前必須在 **Settings → Pages → Source** 選擇 **GitHub Actions**，
> 否則 `configure-pages` 會以 `Get Pages site failed` 失敗。

## 幾個實作上的注意點

- **所有資源引用都是相對路徑**（`css/style.css` 而非 `/css/style.css`），
  因為 Pages 站點位於 `/<repo>/` 子路徑下。
- **`/api/*` 是絕對路徑**，這是刻意保留的：本機由 Node 後端服務，
  線上由 `static-api.js` 在 `fetch` 層攔截，因此 12 個頁面、8 個 JS 檔
  一行都不用改。
- 法規日期採**熙明曆**：西元 = 熙明年 + 2013。
- 法規正文用細明體；標題用無襯線粗體。

## 首次部署必須做的一步

到 **Settings → Pages → Build and deployment → Source**，把下拉選單改成 **GitHub Actions**。

這一步無法由工作流代勞：預設的 `GITHUB_TOKEN` 沒有建立 Pages 站點的權限，
`configure-pages` 若帶 `enablement: true` 會以
`Resource not accessible by integration` 失敗。改完設定後，
到 **Actions → Deploy to GitHub Pages → Re-run all jobs**（或再 push 一次即可）。

成功後網址為 `https://<owner>.github.io/<repo>/`，也可在 Settings → Pages 頂部看到
`Your site is live at …`。

## 授權

僅覆蓋本倉庫內的程式碼。
