// 立法歷程歸檔頁（仿 Fuwari ArchivePanel：年份分組 + 虛線時間軸）
(function() {
  'use strict';

  let rows = [];
  let lawRows = [];
  let orderRows = [];
  const PAGE_SIZE = 8; // 每页行数（照 fuwari PAGE_SIZE）
  let lawPage = 1;
  let orderPage = 1;

  // 面板开关（搜索 / 菜单）已统一由 features.js 的 setupPanels 处理，此处不再重复。

  // ==================== 渲染 ====================
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function detailUrl(lawId) {
    return 'detail.html?lawId=' + encodeURIComponent(lawId) + '&tab=history';
  }

  // 渲染单个区块（法規 / 命令）：按年份分組 + 各自分页
  function renderSection(sourceRows, listId, pageState) {
    const wrap = document.getElementById(listId);
    if (!wrap) return;

    const totalPages = Math.max(1, Math.ceil(sourceRows.length / PAGE_SIZE));
    if (pageState.current > totalPages) pageState.current = totalPages;
    const pageRows = sourceRows.slice((pageState.current - 1) * PAGE_SIZE, pageState.current * PAGE_SIZE);

    // 按年份分組（sourceRows 已按時間從後往前排序，保持組間順序）
    const groups = [];
    const byLabel = {};
    pageRows.forEach(r => {
      if (!byLabel[r.yearLabel]) {
        byLabel[r.yearLabel] = { yearLabel: r.yearLabel, items: [] };
        groups.push(byLabel[r.yearLabel]);
      }
      byLabel[r.yearLabel].items.push(r);
    });

    let html = '';
    groups.forEach(g => {
      // 子行（如「主任委員…令修正公布…」）併入前一主行，作為右側第二段，不再單獨成行
      const merged = [];
      g.items.forEach(r => {
        if (r.sub && merged.length > 0) {
          merged[merged.length - 1].extraBodies.push(r.body || '');
        } else {
          merged.push(Object.assign({}, r, { extraBodies: [] }));
        }
      });

      html += '<div class="ar-group">' +
              '<div class="ar-group-header">' +
              '<div class="ar-year">' + escapeHtml(g.yearLabel) + '</div>' +
              '<div class="ar-header-dot"></div>' +
              '<div class="ar-count">' + merged.length + ' 則紀錄</div>' +
              '</div>';

      merged.forEach(r => {
        const titleHtml = escapeHtml(r.title) +
          (r.abolished ? ' <span class="fw-badge abolished">已廢止</span>' : '') +
          (r.dateInferred ? ' <span class="fw-badge inferred" title="日期來自發文字號編碼推定，非權威記載">日期推定</span>' : '');
        let bodyHtml = r.body
          ? '<span class="ar-event">' + escapeHtml(r.body) + '</span>'
          : '<span class="ar-event ar-noevent">暫無詳細沿革紀錄</span>';
        r.extraBodies.forEach(eb => {
          if (eb) bodyHtml += '<span class="ar-event ar-event-sub">' + escapeHtml(eb) + '</span>';
        });
        html += '<a class="ar-row" href="' + detailUrl(r.lawId) + '" aria-label="' + escapeHtml(r.title) + '">' +
                '<div class="ar-date">' + r.md + '</div>' +
                '<div class="ar-line"><div class="ar-dot"></div></div>' +
                '<div class="ar-main">' +
                '<div class="ar-title">' + titleHtml + '</div>' +
                '<div class="ar-body">' + bodyHtml + '</div>' +
                '</div>' +
                '<div class="ar-cat">' + escapeHtml(r.cat) + '</div>' +
                '</a>';
      });

      html += '</div>';
    });

    wrap.innerHTML = html;
    renderPagination(sourceRows, listId, pageState);
  }

  // 同一法規僅保留「最新修正的沿革」那一則（sortKey 最大者；並列時保留先出現者）。
  // 立法歷程的「法規」區＝每部法規一列，以其最近一次制定／修正為準。
  function latestPerLaw(list) {
    const best = new Map();
    list.forEach(r => {
      const cur = best.get(r.lawId);
      if (!cur || (r.sortKey || 0) > (cur.sortKey || 0)) best.set(r.lawId, r);
    });
    return [...best.values()].sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0) || a.seq - b.seq);
  }

  function render() {
    if (!rows || rows.length === 0) {
      document.getElementById('empty-state').style.display = 'block';
      return;
    }

    // 法規與命令分開排列：命令 = 「行政命令」分類（相關命令板塊來源）
    lawRows = latestPerLaw(rows.filter(r => r.cat !== '行政命令'));
    // 命令：按「命令序號」由大到小（越新越靠前）；缺序號者退回沿革日期新→舊。
    // 不以日期為主鍵——同日多道令（如令384／385）單靠日期會次序不定。
    orderRows = rows.filter(r => r.cat === '行政命令').slice().sort((a, b) => {
      const d = (b.commandNo || 0) - (a.commandNo || 0);
      return d !== 0 ? d : (b.sortKey || 0) - (a.sortKey || 0) || a.seq - b.seq;
    });

    // 統計與列表一致：年份取實際列出的年份；法規數＝法規區列數；事件數＝全部沿革紀錄
    const shown = lawRows.concat(orderRows);
    document.getElementById('stat-years').textContent = new Set(shown.map(r => r.yearLabel)).size;
    document.getElementById('stat-events').textContent = rows.length;
    document.getElementById('stat-laws').textContent = lawRows.length;

    renderSection(lawRows, 'archive-list-laws', { current: lawPage });
    renderSection(orderRows, 'archive-list-orders', { current: orderPage });
  }

  // Fuwari 式分页条渲染（每区块独立分页）
  function renderPagination(sourceRows, listId, pageState) {
    const paginationId = listId === 'archive-list-laws' ? 'fw-pagination-laws' : 'fw-pagination-orders';
    const wrap = document.getElementById(paginationId);
    if (!wrap) return;
    const totalPages = Math.max(1, Math.ceil(sourceRows.length / PAGE_SIZE));
    if (!window.FWPagination || totalPages <= 1) {
      wrap.innerHTML = '';
      return;
    }
    FWPagination.render(wrap, {
      current: pageState.current,
      last: totalPages,
      onPage: function(p) {
        pageState.current = p;
        if (listId === 'archive-list-laws') lawPage = p;
        else orderPage = p;
        renderSection(sourceRows, listId, pageState);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // ==================== 初始化 ====================
  async function init() {
    // 高亮当前栏目
    document.querySelectorAll('.fw-nav-links a, .fw-mobile-menu a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === 'archive.html');
    });

    try {
      const res = await fetch('/api/archive');
      if (!res.ok) throw new Error('Failed to load');
      rows = await res.json();
      render();
    } catch (e) {
      document.getElementById('error-state').style.display = 'block';
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
