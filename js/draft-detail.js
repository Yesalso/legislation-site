// 草案詳情頁（草稿庫 /api/drafts + /api/draft-content）
// 與 React DraftDetail 同款：breadcrumb、標題/日期/標籤、tabIndent Markdown 正文渲染、TOC
(function() {
  'use strict';

  async function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id) {
      document.body.innerHTML = '<h1 style="text-align:center;padding:2rem">參數錯誤：缺少草案ID</h1>';
      return;
    }

    // 列表元信息（標題/日期/標籤/類型/狀態）
    let item = null;
    try {
      const listRes = await fetch('/api/drafts');
      if (listRes.ok) {
        const listData = await listRes.json();
        const cats = (listData.laws && listData.laws.categories) || [];
        item = cats.flatMap(function(c) { return c.laws || []; }).find(function(l) { return l.id === id; }) || null;
      }
    } catch (e) { /* 列表加載失敗不阻塞正文 */ }

    // 草案正文
    try {
      const res = await fetch('/api/draft-content/' + encodeURIComponent(id));
      if (!res.ok) throw new Error('無法載入草案內容');
      const text = await res.text();

      const meta = item || { id };
      const isCmd = (item && item.commandNo) || /主任委員令/.test(meta.title || '');
      renderHeader(meta, isCmd);
      renderSyncLink(meta, isCmd);
      const contentEl = document.getElementById('draft-content');
      contentEl.innerHTML = parseMarkdown(text, { tabIndent: true });
    } catch (e) {
      document.getElementById('draft-content').innerHTML =
        '<div style="color:#dc3545;padding:2rem"><h3>加載失敗</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
  }

  function badgeTag(text) {
    return '<span class="fw-badge">' + escapeHtml(text) + '</span>';
  }

  // 命令文書 → 相應法規的「修正同步」頁入口（新建文書後據此找到法規並同步）。
  // target 由 /api/drafts 以 derive-laws 的 scan() 權威解析附帶（名稱已正規化）；
  // 法規尚未進入 LawCurrent 時，詳情頁會進入「待同步」過渡態，同步後自動恢復完整頁面。
  function renderSyncLink(meta, isCmd) {
    const host = document.getElementById('draft-sync-link');
    if (!host) return;
    const target = isCmd && meta && meta.target;
    if (!target) { host.innerHTML = ''; return; }
    host.innerHTML =
      '<a class="amend-btn" href="detail.html?lawId=' + encodeURIComponent(target) + '&tab=amend">' +
      '前往相應法規「' + escapeHtml(target) + '」的修正同步 →</a>';
  }

  function renderHeader(meta, isCmd) {
    const titleText = meta.title || ('草案 ' + meta.id);
    const dateText = meta.date || meta.modified || '';

    const breadcrumb = document.getElementById('draft-name-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = titleText;
    const titleEl = document.getElementById('draft-title-top');
    if (titleEl) titleEl.textContent = titleText;
    document.title = '法規查詢系統 - ' + titleText;

    const metaEl = document.getElementById('draft-detail-meta');
    if (!metaEl) return;
    let html = '';
    if (dateText) html += '<span>' + escapeHtml(dateText) + '</span>';
    html += badgeTag(isCmd ? '主任委員令' : '草案');
    html += '<span class="draft-detail-id">#' + escapeHtml(meta.id) + '</span>';
    if (meta.type && !isCmd) html += '<span class="fw-badge">' + escapeHtml(meta.type) + '</span>';
    if (meta.status) html += '<span class="fw-badge">' + escapeHtml(meta.status) + '</span>';
    (meta.tags || []).slice(0, 5).forEach(function(t) {
      html += '<span class="with-divider fw-badge tag">' + escapeHtml(t) + '</span>';
    });
    metaEl.innerHTML = html;
  }

  window.addEventListener('DOMContentLoaded', init);
})();