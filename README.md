# 「九」法規查詢系統 —— 靜態站（真實資料）

> 純 HTML / CSS / JavaScript，**無框架、無建置依賴**。
> 線上：`https://yesalso.github.io/legislation-site/`

本站是法規查詢系統的**唯讀快照版**：法規目錄、條文正文、歷史版本、
命令與草案、台灣法規、立法歷程全部可瀏覽，資料由本機的 Node 服務離線導出後固化進倉庫。

- 資料規模：法規 **220** 部｜台灣法規 **173** 部｜命令與草案 **654** 份｜歷程 **431** 條
- 正文分片 **1351** 項｜原子層（逐版快照）**55** 部
- 唯讀：修正同步、點擊計數等寫操作在線上不可用（會回傳明確提示），請在本機版操作

## 為什麼是「快照」而不是「服務」

原始系統是 Node 後端（`server.js`，18 個 `/api/*` 端點）＋ 前端。
資料來自三處機器派生目錄，都在開發機的硬盤上，雲端構建時並不存在。
所以資料必須**先在本地固化**，再由靜態站讀取——`js/static-api.js` 在瀏覽器端
接管 `/api/*`，把請求解析成快照檔案，因此 12 個頁面、8 個 JS 檔一行都不用改。

```
本機：File 文書庫 → derive → derived/ → LawCurrent/ + atomic/
                 └─ tools/export-snapshot.js → static-data/
本倉庫：static-data/ + 頁面 + css/js ──Actions──> GitHub Pages
```

## 目錄

| 路徑 | 說明 |
|---|---|
| `static-data/` | **真實資料快照**：`snapshot.json` 索引 + `text/` 正文分片 + `atomic/` 逐版快照 + `amend/` 同步狀態 |
| `js/static-api.js` | 取數適配層：把 `/api/*` 映射到 `api/` 下的快照分片 |
| `tools/export-static.js` | 把頁面 + `static-data/` 拼成可部署的 `site/` |
| `css/`、`js/` | 前端樣式與邏輯 |
| `*.html` | 11 個頁面（目錄、詳情、歷程、草案、命令、會議、重要規定、台灣法規、文書全文、條文比較） |

## 建置與本機預覽

```bash
npm run export                            # 產出 site/（約 21 MB）
cd site && python -m http.server 3900     # http://127.0.0.1:3900/
```

`export-static.js` 做的事：

1. 複製 11 個頁面，並在 `<head>` 後注入 `js/static-api.js`；
2. 複製 `css/`、`js/`；
3. 複製 `static-data/` 的分片到 `api/`，並**清空 `amend/*.json` 裡的 `doc_dir`**（本機絕對路徑不上公網）；
4. 寫 `.nojekyll`（避免 Jekyll 忽略下劃線檔案、誤解析 JS 裡的 `{{ }}`）。

## 更新資料

資料變動後，在**私有倉庫**（本機完整版）重新導出，再把快照搬過來：

```bash
# 私有倉庫內
node tools/export-snapshot.js           # → static-data/
cp -r static-data/. <本倉庫>/static-data/
git add static-data && git commit -m "data: 更新法規快照" && git push
```

推送後 Actions 自動重建並發布，約 1–2 分鐘生效。

## 部署

推送到 `main` 由 `.github/workflows/pages.yml` 自動建置。

> 首次使用前須在 **Settings → Pages → Source** 選擇 **GitHub Actions**。
> 這步無法由工作流代勞：預設 `GITHUB_TOKEN` 沒有建立 Pages 站點的權限，
> 帶 `enablement: true` 會以 `Resource not accessible by integration` 失敗。

若某次部署卡在 `deploy` 超過 10 分鐘（`Timeout reached, aborting!`），
到 Actions 頁 **Cancel workflow** 後重跑即可，不必改設定。

## 已知限制

- **唯讀**：`POST /api/amend`（修正同步）、`POST /api/click`（熱度計數）在線上只回提示。
- **不提供版本差異**：`/api/atomic/laws/<id>/diff` 需要服務端計算，靜態站回「不提供」。
- **資料非即時**：站點內容等於 `static-data/` 最後一次提交的狀態，不隨本機改動自動更新。

## 授權

僅覆蓋本倉庫內的程式碼與頁面；法規文本的權利狀態另計。
