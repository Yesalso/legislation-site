// 板块页共享渲染逻辑（相關命令/相關會議/重要規定/草案審查）
// 特殊模式：草案審查(drafts) 與 相關命令(orders) 改由 Obsidian 草稿庫(/api/drafts) 驅動，
// 展示「主任委員令(commands)」與「一般草案(drafts)」卡片（React 草稿版卡片樣式）。
(function() {
  'use strict';

  const SECTION_KEY = window.SECTION_KEY;
  const SECTION_TITLES = {
    orders: '相關命令',
    meetings: '相關會議',
    regulations: '重要規定',
    drafts: '草案審查'
  };

  // 草稿庫模式：drafts→drafts 群組、orders→commands 群組（主任委員令）
  const DRAFT_MODE = SECTION_KEY === 'drafts' || SECTION_KEY === 'orders';
  const DRAFT_CATEGORY = SECTION_KEY === 'orders' ? 'commands' : 'drafts';

  let data = null;
  let currentCat = '';
  let currentTag = '';
  const PAGE_SIZE = 8; // 每页条数（照 fuwari PAGE_SIZE）
  let currentPage = 1;

  function sectionData() {
    return (data && data[SECTION_KEY]) || { categories: [] };
  }

  function allSectionLaws() {
    return sectionData().categories.flatMap(c => (c.laws || []).map(l => ({ ...l, catName: c.name })));
  }

  // ==================== 数据加载 ====================
  async function init() {
    // 高亮当前栏目
    document.querySelectorAll('.fw-nav-links a, .fw-mobile-menu a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === SECTION_KEY + '.html');
    });

    try {
      if (DRAFT_MODE) {
        const res = await fetch('/api/drafts');
        if (!res.ok) throw new Error('Failed to load');
        const draftData = await res.json();
        const cats = (draftData.laws && draftData.laws.categories) || [];
        const cat = cats.find(c => c.id === DRAFT_CATEGORY) || { id: DRAFT_CATEGORY, name: DRAFT_CATEGORY, laws: [] };
        data = { [SECTION_KEY]: { categories: [cat] } };
      } else {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Failed to load');
        data = await res.json();
      }
    } catch (e) {
      document.getElementById('error-state').style.display = 'block';
      return;
    }

    const cats = sectionData().categories || [];
    const laws = allSectionLaws();
    const tagCount = {};
    laws.forEach(l => (l.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const tags = Object.entries(tagCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    document.getElementById('stat-categories').textContent = cats.length;
    document.getElementById('stat-laws').textContent = laws.length;
    document.getElementById('stat-tags').textContent = tags.length;

    buildCategories(cats);
    buildTags(tags);
    render();
  }

  function buildCategories(cats) {
    const wrap = document.getElementById('fw-cats');
    if (cats.length === 0) {
      wrap.innerHTML = '<span style="color:var(--text-secondary);font-size:.85rem">暫無分類</span>';
      return;
    }

    const allBtn = document.createElement('button');
    allBtn.className = 'fw-cat-pill active';
    allBtn.innerHTML = `<span>全部</span><span class="fw-cat-count">${cats.flatMap(c => c.laws).length}</span>`;
    allBtn.addEventListener('click', () => {
      currentCat = '';
      currentTag = '';
      currentPage = 1;
      document.querySelectorAll('#fw-tags .fw-tag-pill').forEach(el => el.classList.remove('active'));
      wrap.querySelectorAll('.fw-cat-pill').forEach(el => el.classList.remove('active'));
      allBtn.classList.add('active');
      render();
    });
    wrap.appendChild(allBtn);

    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'fw-cat-pill';
      btn.innerHTML = `<span>${cat.name}</span><span class="fw-cat-count">${cat.laws.length}</span>`;
      btn.addEventListener('click', () => {
        currentTag = '';
        document.querySelectorAll('#fw-tags .fw-tag-pill').forEach(el => el.classList.remove('active'));
        if (currentCat === cat.id) {
          currentCat = '';
          allBtn.classList.add('active');
        } else {
          currentCat = cat.id;
          wrap.querySelectorAll('.fw-cat-pill').forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
        }
        currentPage = 1;
        render();
      });
      wrap.appendChild(btn);
    });
  }

  function buildTags(tags) {
    const wrap = document.getElementById('fw-tags');
    if (tags.length === 0) {
      wrap.innerHTML = '<span style="color:var(--text-secondary);font-size:.85rem">無標籤</span>';
      return;
    }
    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'fw-cat-pill fw-tag-pill';
      btn.innerHTML = `<span>#${tag.name}</span><span class="fw-cat-count">${tag.count}</span>`;
      btn.addEventListener('click', () => {
        const isActive = btn.classList.contains('active');
        document.querySelectorAll('#fw-tags .fw-tag-pill').forEach(el => el.classList.remove('active'));
        currentTag = isActive ? '' : tag.name;
        if (!isActive) btn.classList.add('active');
        currentPage = 1;
        render();
      });
      wrap.appendChild(btn);
    });
  }

  // ==================== 渲染卡片列表 ====================
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}-${m}-${d}`;
  }

  // 類型/狀態徽章配色（與 LawCard.jsx 一致）
  const TYPE_CLASS = { '法規草案': 'law', '命令草案': 'cmd', '一般草案': 'general', '規範草案': 'law', '政策草案': 'policy' };
  const STATUS_CLASS = { '審議中': 'pending', '已通過': 'passed', '已退回': 'rejected', '廢止': 'abolished' };

  function draftCardHtml(law) {
    const typeCls = TYPE_CLASS[law.type] || '';
    const statusCls = STATUS_CLASS[law.status] || '';
    const isCmd = DRAFT_CATEGORY === 'commands';
    const badgeLabel = isCmd ? '主任委員令' : '草案';
    const descText = isCmd ? (law.summary || law.lawName || '主任委員令') : (law.excerpt || '草案文件');
    const dateText = law.date || law.modified || '';
    const tagsHtml = (law.tags || []).slice(0, 3).map(t =>
      `<span class="with-divider fw-badge tag">${t}</span>`
    ).join('');
    return `
      <a href="draft_detail.html?id=${encodeURIComponent(law.id)}" class="fw-card fw-post-card draft-item-link">
        <h2 class="fw-post-title">${law.title}</h2>
        <div class="fw-post-meta">
          <span class="meta-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
          <span>${formatDate(dateText)}</span>
          <span class="fw-badge">${badgeLabel}</span>
          ${law.type && !isCmd ? `<span class="fw-badge type type-${typeCls}">${law.type}</span>` : ''}
          ${law.status ? `<span class="fw-badge status status-${statusCls}">${law.status}</span>` : ''}
          ${tagsHtml}
        </div>
        <div class="fw-post-desc">${descText}</div>
        <div class="fw-post-footer">
          <span>#${law.id}</span>
          <span class="draft-open-hint">查看全文 →</span>
        </div>
      </a>
    `;
  }

  // 法規卡片的日期顯示「最新修正日」（＝最新沿革），不用制定日
  function latestDateOf(law) {
    return (typeof window.lawLatestDate === 'function')
      ? window.lawLatestDate(law)
      : String((law.versions && law.versions[0] && law.versions[0].date) || law.modified || '');
  }

  function standardCardHtml(law) {
    const tagsHtml = (law.tags && law.tags.length > 0)
      ? law.tags.map(t => `<span class="fw-badge tag">#${t}</span>`).join('')
      : '<span class="fw-badge">無標籤</span>';
    return `
      <h2 class="fw-post-title">${law.title}</h2>
      <div class="fw-post-meta">
        <span class="meta-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <span>${formatDate(latestDateOf(law))}</span>
        <span class="with-divider fw-badge cat">${law.catName}</span>
        ${law.abolished ? '<span class="fw-badge abolished">已廢止</span>' : ''}
        ${tagsHtml}
      </div>
      <div class="fw-post-desc">${law.alias ? law.alias : '閱讀更多關於「' + law.title + '」的內容'}</div>
      <div class="fw-post-footer">
        <span>${law.words} 字</span><span>|</span><span>${law.minutes} 分鐘</span>
      </div>
      <a href="detail.html?lawId=${encodeURIComponent(law.id)}" class="fw-read-more">閱讀全文 →</a>
    `;
  }

  function render() {
    const list = document.getElementById('fw-post-list');
    const empty = document.getElementById('empty-state');
    list.innerHTML = '';

    let laws = allSectionLaws();
    if (currentCat) laws = laws.filter(l => sectionData().categories.some(c => c.id === currentCat && (c.laws || []).some(x => x.id === l.id)));
    if (currentTag) laws = laws.filter(l => (l.tags || []).includes(currentTag));

    // 相關命令：按「命令序號」由大到小（越新越靠前）。草稿庫模式下後端已排序，此處僅為非草稿模式的保險。
    if (SECTION_KEY === 'orders' && !DRAFT_MODE) {
      laws = laws.slice().sort((a, b) => (b.commandNo || 0) - (a.commandNo || 0));
    }
    // 法規列表（重要規定等）：按「最新修正日」由新到舊；同日則以標題順序穩定排序。
    if (SECTION_KEY !== 'orders' && !DRAFT_MODE) {
      laws = laws.slice().sort((a, b) => {
        const d = latestDateOf(b).localeCompare(latestDateOf(a));
        return d !== 0 ? d : String(a.title || '').localeCompare(String(b.title || ''));
      });
    }

    if (laws.length === 0) {
      empty.style.display = 'block';
      empty.querySelector('p').textContent = currentCat || currentTag ? '未找到符合條件的項目' : `${SECTION_TITLES[SECTION_KEY] || ''}板塊暫無資料`;
      renderPagination(0);
      return;
    }
    empty.style.display = 'none';

    // Fuwari 式分页（每页 PAGE_SIZE 条）
    const totalPages = Math.max(1, Math.ceil(laws.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageLaws = laws.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    pageLaws.forEach(law => {
      const card = document.createElement('article');
      card.className = 'fw-card fw-post-card onload-animation';
      card.innerHTML = DRAFT_MODE ? draftCardHtml(law) : standardCardHtml(law);
      if (!DRAFT_MODE) {
        card.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          window.location.href = 'detail.html?lawId=' + encodeURIComponent(law.id);
        });
      }
      list.appendChild(card);
    });

    renderPagination(totalPages);
  }

  // Fuwari 式分页条渲染
  function renderPagination(totalPages) {
    const wrap = document.getElementById('fw-pagination');
    if (!wrap) return;
    if (!window.FWPagination || totalPages <= 1) {
      wrap.innerHTML = '';
      return;
    }
    FWPagination.render(wrap, {
      current: currentPage,
      last: totalPages,
      onPage: function(p) {
        currentPage = p;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();