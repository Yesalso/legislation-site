// Fuwari 式分页组件（算法与观感完全照 fuwariAAA 的 src/components/control/Pagination.astro）
(function() {
  'use strict';

  const HIDDEN = -1;          // 省略号占位
  const ADJ_DIST = 2;         // 当前页前后各显示 2 页
  const VISIBLE = ADJ_DIST * 2 + 1; // 窗口内最多 5 页

  // 页码窗口算法（照搬 fuwari Pagination.astro 的 while 扩展逻辑）
  function buildPages(current, last) {
    let count = 1;
    let l = current;
    let r = current;
    while (0 < l - 1 && r + 1 <= last && count + 2 <= VISIBLE) {
      count += 2;
      l--;
      r++;
    }
    while (0 < l - 1 && count < VISIBLE) {
      count++;
      l--;
    }
    while (r + 1 <= last && count < VISIBLE) {
      count++;
      r++;
    }

    const pages = [];
    if (l > 1) pages.push(1);
    if (l === 3) pages.push(2);
    if (l > 3) pages.push(HIDDEN);
    for (let i = l; i <= r; i++) pages.push(i);
    if (r < last - 2) pages.push(HIDDEN);
    if (r === last - 2) pages.push(last - 1);
    if (r < last) pages.push(last);
    return pages;
  }

  // 渲染分页条
  // opts: { current, last, onPage }
  function render(container, opts) {
    if (!container) return;
    const current = opts.current;
    const last = opts.last;
    const onPage = opts.onPage;

    if (!last || last <= 1) {
      container.innerHTML = '';
      return;
    }

    const pages = buildPages(current, last);

    const chevronLeft =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
    const chevronRight =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    function pageBtn(label, page, disabled, extra) {
      return '<button type="button" class="fw-page-btn ' + (extra || '') + (disabled ? ' disabled' : '') + '"' +
             (disabled ? ' disabled' : '') +
             (page ? ' data-page="' + page + '"' : '') +
             '>' + label + '</button>';
    }

    let html = '<div class="fw-pagination">';
    html += pageBtn(chevronLeft, current > 1 ? current - 1 : 0, current <= 1, 'fw-page-nav');
    html += '<div class="fw-page-nums">';
    pages.forEach(function(p) {
      if (p === HIDDEN) {
        html += '<span class="fw-page-ellipsis">…</span>';
        return;
      }
      if (p === current) {
        html += '<span class="fw-page-btn fw-page-active">' + p + '</span>';
        return;
      }
      html += pageBtn(String(p), p, false, '');
    });
    html += '</div>';
    html += pageBtn(chevronRight, current < last ? current + 1 : 0, current >= last, 'fw-page-nav');
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.fw-page-btn[data-page]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const p = parseInt(btn.dataset.page, 10);
        if (p && p !== current && typeof onPage === 'function') onPage(p);
      });
    });
  }

  window.FWPagination = {
    buildPages: buildPages,
    render: render,
    HIDDEN: HIDDEN
  };
})();
