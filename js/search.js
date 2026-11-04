/**
 * Fuwari 风格全站搜索栏（全新实现，不依赖任何既有搜索代码）
 *
 * 功能：
 *  - 导航栏内嵌搜索框，输入即搜（防抖 220ms）
 *  - 跨 /api/data（法規/命令/會議/規定/草案）+ /api/tw-data（台灣法規）索引
 *  - 候选卡片：加粗标题（<mark> 关键词高亮）+ 右侧 chevron ›（hover 位移变亮）
 *    + 分类徽章 + excerpt 预览（正文命中片段高亮）+ hover 背景变色
 *  - 下拉浮层从搜索栏正下方右侧展开（top: calc(100% + .5rem); right: 0），圆角阴影悬浮
 *  - 键盘支持：Enter 打开第一个结果、Esc 关闭；点击外部关闭
 */
(function () {
  'use strict';

  const MAX_RESULTS = 8;
  const DEBOUNCE_MS = 220;
  const EXCERPT_LEN = 72;
  const CONTENT_TIMEOUT_MS = 1500;

  const SECTION_LABEL = {
    laws: '法規',
    orders: '命令',
    meetings: '會議',
    regulations: '規定',
    drafts: '草案',
    tw: '台灣法規'
  };

  // 各板块在 /api/data 中的字段名
  const SECTIONS = ['laws', 'orders', 'meetings', 'regulations', 'drafts'];

  const state = {
    index: null,          // 扁平化搜索索引
    contentCache: new Map(), // lawId -> 正文（仅拉取一次）
    timer: null,          // 防抖定时器
    seq: 0                // 请求序号，丢弃过期响应
  };

  // ---------- HTML 转义 / 关键词高亮 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 文本转义后，把命中的关键词包上 <mark>（支持空格分隔的多词）
  function highlight(text, tokens) {
    let html = esc(text);
    for (const t of tokens) {
      if (!t) continue;
      const pattern = esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        html = html.replace(new RegExp(pattern, 'gi'), function (m) {
          return '<mark>' + m + '</mark>';
        });
      } catch (e) { /* 忽略非法正则 */ }
    }
    return html;
  }

  // ---------- 数据加载：合并两套数据为扁平索引 ----------
  function loadIndex() {
    if (state.index) return Promise.resolve(state.index);
    return Promise.all([
      fetch('/api/data').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('/api/tw-data').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (results) {
      const index = [];
      const push = function (section, catName, law, abolished) {
        const vs = law.versions || [];
        const cur = vs.filter(function (v) { return v && v.isCurrent; })[0] || vs[vs.length - 1] || null;
        const d = String((cur && cur.date) || law.modified || '').slice(0, 10);
        index.push({
          id: law.id,
          title: law.title || '',
          alias: law.alias || '',
          excerpt: law.excerpt || '',
          tags: law.tags || [],
          cat: catName || '',
          section: section,
          date: d,
          abolished: !!abolished
        });
      };

      const data = results[0];
      if (data) {
        SECTIONS.forEach(function (sec) {
          const cats = (data[sec] && data[sec].categories) || [];
          cats.forEach(function (cat) {
            const catName = String(cat.name || '').replace(/（已廢止）$/, '');
            (cat.laws || []).forEach(function (law) {
              // 已廢止法規集中到「已廢止」組；搜尋結果仍顯示原分類
              push(sec, law.originCat || catName, law, cat.abolished || law.abolished);
            });
          });
        });
      }

      const tw = results[1];
      if (tw && tw.laws) {
        ((tw.laws.categories) || []).forEach(function (cat) {
          (cat.laws || []).forEach(function (law) {
            push('tw', cat.name || '', law);
          });
        });
      }

      state.index = index;
      return index;
    });
  }

  // 拉取正文（带缓存），用于生成 excerpt
  function getContent(id) {
    if (state.contentCache.has(id)) {
      return Promise.resolve(state.contentCache.get(id));
    }
    const p = fetch('/api/content/' + encodeURIComponent(id))
      .then(function (r) {
        if (!r.ok) throw new Error('content not found');
        return r.text();
      })
      .then(function (text) {
        state.contentCache.set(id, text);
        return text;
      });
    // 超时保护：正文拉取失败不影响卡片展示
    const timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('content timeout')); }, CONTENT_TIMEOUT_MS);
    });
    return Promise.race([p, timeout]).catch(function (err) {
      state.contentCache.set(id, '');
      throw err;
    });
  }

  // ---------- 匹配与排序 ----------
  function matchScore(item, q) {
    const lower = q.toLowerCase();
    let score = 0;
    if (item.title.toLowerCase().indexOf(lower) !== -1) score += 100;
    if (item.alias && item.alias.toLowerCase().indexOf(lower) !== -1) score += 60;
    if ((item.tags || []).some(function (t) { return t.toLowerCase().indexOf(lower) !== -1; })) score += 30;
    if (item.cat && item.cat.toLowerCase().indexOf(lower) !== -1) score += 25;
    if (SECTION_LABEL[item.section] && SECTION_LABEL[item.section].toLowerCase().indexOf(lower) !== -1) score += 20;
    return score;
  }

  // ---------- 渲染 ----------
  function renderStatus(seq, count, loading) {
    if (seq !== state.seq || !el.status) return;
    if (loading) {
      el.status.textContent = '搜尋中…';
    } else if (count > 0) {
      el.status.textContent = '共 ' + count + ' 筆結果（點擊查看全文）';
    } else {
      el.status.textContent = '';
    }
  }

  function renderList(seq, items, tokens) {
    if (seq !== state.seq || !el.results) return;
    el.results.innerHTML = '';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fw-search-empty';
      empty.innerHTML = '未找到「<mark>' + esc(tokens.join(' ')) + '</mark>」相關的內容';
      el.results.appendChild(empty);
      return;
    }

    items.forEach(function (entry) {
      const item = entry.item;
      const row = document.createElement('a');
      row.className = 'fw-search-result';
      row.href = 'detail.html?lawId=' + encodeURIComponent(item.id);

      const badgeSection = SECTION_LABEL[item.section] || item.section;
      const head = document.createElement('div');
      head.className = 'fw-search-result-head';
      head.innerHTML =
        '<span class="fw-search-title">' + highlight(item.title, tokens) + '</span>' +
        '<span class="fw-search-chevron" aria-hidden="true">›</span>';

      const meta = document.createElement('div');
      meta.className = 'fw-search-meta';
      meta.innerHTML =
        '<span class="fw-search-badge">' + esc(badgeSection) + '</span>' +
        (item.cat ? '<span class="fw-search-badge cat">' + esc(item.cat) + '</span>' : '') +
        (item.abolished ? '<span class="fw-search-badge abolished">已廢止</span>' : '');

      const excerpt = document.createElement('div');
      excerpt.className = 'fw-search-excerpt';
      excerpt.textContent = '載入中…';

      row.appendChild(head);
      row.appendChild(meta);
      row.appendChild(excerpt);
      el.results.appendChild(row);

      fillExcerpt(row, item, tokens);
    });
  }

  // 异步填充 excerpt：优先取正文中第一个命中关键词的片段；否则回退 alias/标签
  function fillExcerpt(row, item, tokens) {
    const target = row.querySelector('.fw-search-excerpt');
    let fallback = item.alias ||
      (item.tags && item.tags.length ? '標籤：' + item.tags.join('、') : '') ||
      (item.date ? item.date + ' 版本' : '');
    if (!fallback) fallback = item.title;

    getContent(item.id).then(function (text) {
      if (!text || !target.isConnected) {
        target.innerHTML = highlight(fallback, tokens);
        return;
      }
      let idx = -1;
      tokens.forEach(function (t) {
        if (!t) return;
        const i = text.toLowerCase().indexOf(t.toLowerCase());
        if (i !== -1 && (idx === -1 || i < idx)) idx = i;
      });

      if (idx === -1) {
        // 正文无命中（仅标题/标签命中）：用别名摘要，但仍尝试取正文开头
        const head = text.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_LEN);
        target.innerHTML = highlight((head ? '…' + head + '…' : fallback), tokens);
        return;
      }

      const start = Math.max(0, idx - Math.floor(EXCERPT_LEN / 2));
      let snippet = text.slice(start, start + EXCERPT_LEN).replace(/\s+/g, ' ').trim();
      snippet = (start > 0 ? '…' : '') + snippet + (start + EXCERPT_LEN < text.length ? '…' : '');
      target.innerHTML = highlight(snippet, tokens);
    }).catch(function () {
      target.innerHTML = highlight(fallback, tokens);
    });
  }

  // ---------- 搜索主流程 ----------
  function runSearch(q) {
    const seq = ++state.seq;
    renderStatus(seq, 0, true);
    openDropdown();
    if (!el.results) return;

    loadIndex().then(function (index) {
      if (seq !== state.seq) return;
      const tokens = q.trim().split(/\s+/).filter(Boolean);
      const ranked = [];
      index.forEach(function (item) {
        const s = matchScore(item, q);
        if (s > 0) ranked.push({ item: item, score: s });
      });
      ranked.sort(function (a, b) { return b.score - a.score; });
      const top = ranked.slice(0, MAX_RESULTS);
      renderStatus(seq, top.length, false);
      renderList(seq, top, tokens);
    }).catch(function () {
      if (seq !== state.seq) return;
      renderStatus(seq, 0, false);
      if (el.results) {
        el.results.innerHTML = '<div class="fw-search-empty">數據載入失敗，請確認伺服器已啟動</div>';
      }
    });
  }

  // ---------- 浮层开关 ----------
  function openDropdown() {
    if (!el.dropdown) return;
    el.dropdown.hidden = false;
    // 下一帧再加 .open，确保过渡动画生效
    requestAnimationFrame(function () {
      el.dropdown.classList.add('open');
    });
  }

  function closeDropdown() {
    if (!el.dropdown) return;
    el.dropdown.classList.remove('open');
    setTimeout(function () {
      if (!el.dropdown.classList.contains('open')) el.dropdown.hidden = true;
    }, 180);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    el.input.addEventListener('input', function () {
      const q = el.input.value.trim();
      clearTimeout(state.timer);
      if (!q) {
        state.seq++;
        if (el.status) el.status.textContent = '';
        closeDropdown();
        return;
      }
      state.timer = setTimeout(function () { runSearch(q); }, DEBOUNCE_MS);
    });

    el.input.addEventListener('focus', function () {
      const q = el.input.value.trim();
      if (!q) return;
      // 已有结果则直接展开；否则立即重搜（焦点进入视为有意搜索）
      if (state.seq > 0 && el.dropdown && !el.dropdown.hidden) {
        openDropdown();
      } else {
        runSearch(q);
      }
    });

    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const first = el.results ? el.results.querySelector('.fw-search-result') : null;
        if (first) {
          e.preventDefault();
          window.location.href = first.getAttribute('href');
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
        el.input.blur();
      }
    });

    // 点击搜索栏外部关闭
    document.addEventListener('click', function (e) {
      if (el.bar && !el.bar.contains(e.target)) closeDropdown();
    });
  }

  // ---------- 初始化 ----------
  const el = { bar: null, input: null, dropdown: null, results: null, status: null };

  function init() {
    el.bar = document.getElementById('fw-search-bar');
    if (!el.bar) return;
    el.input = document.getElementById('fw-search-input');
    el.dropdown = document.getElementById('fw-search-dropdown');
    el.results = document.getElementById('fw-search-results');
    el.status = document.getElementById('fw-search-status');
    if (!el.input || !el.dropdown) return;

    bindEvents();
    // 预取索引，保证首次输入即有结果
    loadIndex().catch(function () { /* 输入时才提示失败 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
