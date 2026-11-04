// 首頁右側欄：最新動態 / 站點統計 / 站點信息 / 日曆＋活動熱力圖
// 資料來源：/api/data（法規、命令、會議、規定、草案）＋ /api/archive（立法歷程）
(function () {
  'use strict';

  const SECTIONS = ['laws', 'orders', 'meetings', 'regulations', 'drafts'];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 圖示（inline SVG，沿用站內線性風格）----
  const ICONS = {
    laws: '<path d="M5 19.5V5a2 2 0 0 1 2-2h8l5 5v11.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    orders: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/><path d="M8 13h7M8 17h4"/>',
    meetings: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    words: '<path d="M4 20V11M9 20V4M14 20v-6M19 20V8"/>',
    days: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    activity: '<path d="M3 12h4l2.5-6 3.5 12 2.5-6h5"/>'
  };
  const icon = name => '<span class="hw-ico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg></span>';

  // 全部板塊的法規項目（附所屬板塊）
  function allItems(data) {
    const out = [];
    SECTIONS.forEach(k => {
      const sec = data && data[k];
      if (!sec) return;
      (sec.categories || []).forEach(c => (c.laws || []).forEach(l => out.push(l)));
    });
    return out;
  }

  // 法規日期＝「最新修正的沿革」日期（現行版），無版本時才退回檔案修改時間
  const dateOf = l => {
    if (typeof window.lawLatestDate === 'function') return window.lawLatestDate(l);
    const vs = l.versions || [];
    const cur = vs.find(v => v.isCurrent) || vs[vs.length - 1];
    return String((cur && cur.date) || l.modified || '').slice(0, 10);
  };
  const pad2 = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  function daysAgo(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((new Date(isoOf(new Date()) + 'T00:00:00') - d) / 86400000);
  }
  const fmtNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ==================== 最新動態 ====================
  function renderActivity(rows) {
    const box = $('hw-activity');
    if (!box) return;
    if (!rows || rows.length === 0) {
      box.innerHTML = '<div class="hw-empty">還沒有發布動態</div>';
      return;
    }
    box.innerHTML = rows.slice(0, 3).map(r =>
      '<a class="hw-act-item" href="detail.html?lawId=' + encodeURIComponent(r.lawId) + '&tab=history">' +
        '<span class="hw-act-date">' + esc(r.md) + ' · ' + esc(r.cat) + '</span>' +
        '<span class="hw-act-title" title="' + esc(r.title) + '">' + esc(r.title) + '</span>' +
      '</a>').join('');
  }

  // ==================== 站點統計 ====================
  function renderStats(data) {
    const ul = $('hw-stats');
    if (!ul) return null;
    const items = allItems(data);
    const words = items.reduce((s, l) => s + (l.words || 0), 0);
    const dates = items.map(dateOf).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const first = dates[0] || '';
    const last = dates[dates.length - 1] || '';
    const runDays = daysAgo(first);
    const idleDays = daysAgo(last);
    const countOf = k => {
      const sec = data && data[k];
      if (!sec || !sec.categories) return 0;
      return sec.categories.reduce((n, c) => n + (c.laws || []).filter(l => !(c.abolished || l.abolished)).length, 0);
    };
    // 分類只計法規目錄的實質分類；「已廢止」是匯總分組，另立一行
    const catsOf = () => {
      const cats = (data && data.laws && data.laws.categories) || [];
      return cats.filter(c => !c.abolished && (c.laws || []).length > 0).length;
    };
    const abolOf = () => {
      const cats = (data && data.laws && data.laws.categories) || [];
      return cats.filter(c => c.abolished).reduce((n, c) => n + (c.laws || []).length, 0);
    };
    const tagsOf = () => SECTIONS.reduce((n, k) => {
      const sec = data && data[k];
      return n + ((sec && sec.tags) ? sec.tags.length : 0);
    }, 0);

    // 值為 0 的板塊（如本 vault 無會議／規定／草案）自動省略，僅核心項目固定顯示
    const rows = [
      { ico: 'laws', label: '法規', value: countOf('laws'), always: true },
      { ico: 'laws', label: '已廢止', value: abolOf() },
      { ico: 'orders', label: '命令', value: countOf('orders') },
      { ico: 'meetings', label: '會議', value: countOf('meetings') },
      { ico: 'laws', label: '分類', value: catsOf(), always: true },
      { ico: 'orders', label: '標籤', value: tagsOf() },
      { ico: 'words', label: '總字數', value: fmtNum(words), always: true },
      { ico: 'days', label: '運行時長', value: runDays === null ? '—' : fmtNum(runDays) + ' 天', always: true },
      { ico: 'activity', label: '最後活動', value: idleDays === null ? '—' : (idleDays <= 0 ? '今天' : idleDays + ' 天前'), always: true }
    ].filter(r => r.always || r.value);

    ul.innerHTML = rows.map(r =>
      '<li class="hw-row">' + icon(r.ico) +
        '<span class="hw-label">' + r.label + '</span>' +
        '<span class="hw-value">' + r.value + '</span>' +
      '</li>').join('');
    return { first: first, last: last };
  }

  // ==================== 站點信息 ====================
  function renderSiteInfo(sum) {
    const ul = $('hw-info');
    if (ul) {
      const rows = [
        { ico: 'laws', label: '構建平台', value: 'Local' },
        { ico: 'orders', label: '前端', value: '零依賴 HTML/CSS/JS' },
        { ico: 'activity', label: '資料來源', value: 'File 文書庫' }
      ];
      ul.innerHTML = rows.map(r =>
        '<li class="hw-row">' + icon(r.ico) +
          '<span class="hw-label">' + r.label + '</span>' +
          '<span class="hw-value">' + r.value + '</span>' +
        '</li>').join('');
    }

    const btn = $('hw-build-toggle'), box = $('hw-build'), txt = $('hw-build-toggle-text');
    if (btn && box) {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        box.hidden = open;
        if (txt) txt.textContent = open ? '展開構建信息' : '收合構建信息';
      });
      box.innerHTML =
        '法規資料：<code>TaiwanLgislationConfile\\LawCurrent</code><br>' +
        '台灣法規：<code>TaiwanLgislationConfile\\TaiwanLegislation</code><br>' +
        '服務端：<code>server.js</code>（Node.js 內建 http，預設埠 3000）<br>' +
        (sum && sum.last ? '最後異動：<code>' + esc(sum.last) + '</code>' : '');
    }
  }

  // ==================== 日曆 + 活動熱力圖 ====================
  let calY = 0, calM = 0;
  const actDays = {};   // 'YYYY-MM-DD' → 異動筆數

  function renderCalendar() {
    const grid = $('hw-cal-grid'), title = $('hw-cal-title');
    if (!grid) return;
    title.textContent = calY + '年' + (calM + 1) + '月';
    const firstDow = new Date(calY, calM, 1).getDay();
    const days = new Date(calY, calM + 1, 0).getDate();
    const today = isoOf(new Date());
    let html = ['日', '一', '二', '三', '四', '五', '六'].map(d => '<div class="hw-cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < firstDow; i++) html += '<div class="hw-cal-day is-blank"></div>';
    for (let d = 1; d <= days; d++) {
      const iso = calY + '-' + pad2(calM + 1) + '-' + pad2(d);
      const cls = 'hw-cal-day' + (actDays[iso] ? ' has-act' : '') + (iso === today ? ' is-today' : '');
      const tip = actDays[iso] ? ' title="' + iso + '：' + actDays[iso] + ' 筆異動"' : '';
      html += '<div class="' + cls + '"' + tip + '>' + d + '</div>';
    }
    grid.innerHTML = html;
  }

  // 12 個月 × 6 個時段（1-5、6-10、11-15、16-20、21-25、26-31）的異動密度
  function renderHeat(year) {
    const box = $('hw-heat');
    if (!box) return;
    const buckets = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0, 0]);
    Object.keys(actDays).forEach(iso => {
      const p = iso.split('-').map(Number);
      if (p[0] !== year) return;
      buckets[p[1] - 1][Math.min(5, Math.floor((p[2] - 1) / 5))] += actDays[iso];
    });
    const max = Math.max(1, ...buckets.reduce((a, b) => a.concat(b), []));
    const lv = n => {
      if (!n) return '';
      const r = n / max;
      return ' lv' + (r > .75 ? 4 : r > .5 ? 3 : r > .25 ? 2 : 1);
    };
    let cells = '';
    for (let bi = 0; bi < 6; bi++) {
      for (let m = 0; m < 12; m++) cells += '<div class="hw-heat-cell' + lv(buckets[m][bi]) + '"></div>';
    }
    box.innerHTML =
      '<div class="hw-heat-grid">' + cells + '</div>' +
      '<div class="hw-heat-months">' + Array.from({ length: 12 }, (_, i) => '<span>' + (i + 1) + '</span>').join('') + '</div>' +
      '<div class="hw-heat-legend">' + year + ' 年各月異動密度</div>';
  }

  // ==================== 初始化 ====================
  async function init() {
    if (!$('hw-stats')) return;   // 非首頁不執行

    let data = null, archive = null;
    try { const r = await fetch('/api/data'); if (r.ok) data = await r.json(); } catch (e) { /* 忽略 */ }
    try { const r = await fetch('/api/archive'); if (r.ok) archive = await r.json(); } catch (e) { /* 忽略 */ }

    allItems(data).forEach(l => {
      const iso = dateOf(l);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) actDays[iso] = (actDays[iso] || 0) + 1;
    });

    const now = new Date();
    calY = now.getFullYear();
    calM = now.getMonth();
    const years = Object.keys(actDays).map(d => Number(d.slice(0, 4)));
    const heatYear = years.length ? Math.max(...years) : calY;

    renderActivity(archive);
    const sum = renderStats(data);
    renderSiteInfo(sum);
    renderCalendar();
    renderHeat(heatYear);

    const prev = $('hw-cal-prev'), next = $('hw-cal-next');
    if (prev) prev.addEventListener('click', () => { calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar(); });
    if (next) next.addEventListener('click', () => { calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar(); });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
