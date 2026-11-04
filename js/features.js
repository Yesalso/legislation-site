// 目录导航和搜索功能
(function() {
  'use strict';

  // ==================== 共用：法規的「最新修正日」 ====================
  // 全站法規卡片／沿革一律以「最新修正的沿革」為準：
  //   版本序列取現行版（isCurrent），否則取最後一版；無版本時才退回檔案修改時間。
  // 由 features.js 提供（各板塊頁與詳情頁都會載入），避免各處自行取 versions[0] 而誤用制定日。
  window.lawLatestDate = function(law) {
    if (!law) return '';
    var vs = law.versions || [];
    var cur = null;
    for (var i = 0; i < vs.length; i++) { if (vs[i] && vs[i].isCurrent) { cur = vs[i]; break; } }
    if (!cur) cur = vs[vs.length - 1] || null;
    var d = (cur && cur.date) || law.modified || '';
    return String(d).slice(0, 10);
  };

  // ==================== TOC 目录导航 ====================

  let scrollHandler = null;

  // 跳到正文某個標題（目錄所有條目共用：葉條目、章／節標題皆可點）
  function jumpToHeading(id) {
    const target = document.getElementById(id);
    if (!target) return;
    // 距離太遠（如 400 多條的長法規跨章跳轉）就不做平滑捲動：
    // 上萬像素的動畫要跑好幾秒，期間 scroll-spy 會把高亮一路刷過去，反而像點錯了
    const dist = Math.abs(target.getBoundingClientRect().top);
    target.scrollIntoView({ behavior: dist > 2500 ? 'auto' : 'smooth', block: 'start' });
    closeMobileTOC();
  }

  // 展開目標條目的所有祖先折疊組（章／節／款）——僅在使用者主動展開時呼叫
  function expandAncestors(link) {
    let list = link.closest('ul');
    while (list && list.classList.contains('toc-sublist')) {
      const groupLi = list.parentElement;
      if (groupLi && groupLi.classList.contains('toc-group')) {
        groupLi.classList.add('open');
        const arrow = groupLi.querySelector(':scope > .toc-toggle > .toc-arrow');
        if (arrow) arrow.setAttribute('aria-expanded', 'true');
      }
      list = groupLi ? groupLi.parentElement : null;
    }
  }

  // 構建目錄元素（默認全部折疊；滾動只標記所在章節，不自動展開）
  // openIds：重建前已展開的組 id，重建後原樣恢復（切換版本／重渲染不丟折疊狀態）
  function buildTocElement(headings, openIds) {
    const keepOpen = new Set(openIds || []);
    const toc = document.createElement('nav');
    toc.className = 'toc-sidebar';
    toc.setAttribute('aria-label', '目錄');

    const title = document.createElement('div');
    title.className = 'toc-title';

    const titleText = document.createElement('span');
    titleText.textContent = '目錄';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'toc-collapse-all';
    collapseBtn.textContent = '收合';
    collapseBtn.title = '收合所有層級';
    collapseBtn.disabled = true;

    title.appendChild(titleText);
    title.appendChild(collapseBtn);
    toc.appendChild(title);

    const rootList = document.createElement('ul');
    rootList.className = 'toc-list';

    const arr = Array.prototype.slice.call(headings).map(function(h, i) {
      if (!h.id) h.id = 'heading-' + i;
      return { el: h, level: Number(h.className.match(/md-h(\d)/)[1]) };
    });

    // 有任一層級展開時「收合」按鈕才可用
    function updateCollapseBtn() {
      collapseBtn.disabled = !rootList.querySelector('.toc-group.open');
    }

    // 栈：记录每级折叠组的 { level, subList }，用于嵌套
    const stack = [];

    arr.forEach(function(item, i) {
      const level = item.level;
      const hasChildren = i + 1 < arr.length && arr[i + 1].level > level;

      // 弹出 level >= 当前标题的栈顶，找到父级（处理跳级：h1→h2→h5 时 h5 挂在 h2 下）
      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parent = stack.length ? stack[stack.length - 1] : null;

      const li = document.createElement('li');
      li.className = 'toc-item toc-h' + level;

      if (hasChildren) {
        // 折叠组（默認折疊）
        li.classList.add('toc-group');
        li.dataset.target = item.el.id;   // 供重建時記住／恢復展開狀態

        // 整行是跳轉連結（與葉條目一致）；只有左側箭頭負責展開／收合
        const toggle = document.createElement('a');
        toggle.className = 'toc-toggle';
        toggle.href = '#' + item.el.id;
        toggle.dataset.target = item.el.id;
        toggle.title = item.el.textContent;   // 長章名被省略時可懸停看全稱

        const arrow = document.createElement('span');
        arrow.className = 'toc-arrow';
        arrow.textContent = '\u203A'; // ›
        arrow.setAttribute('role', 'button');
        arrow.setAttribute('tabindex', '0');
        arrow.setAttribute('aria-expanded', 'false');
        arrow.setAttribute('aria-label', '展開或收合');
        arrow.title = '展開／收合';

        const label = document.createElement('span');
        label.className = 'toc-label';
        label.textContent = item.el.textContent;

        toggle.appendChild(arrow);
        toggle.appendChild(label);
        li.appendChild(toggle);

        const subList = document.createElement('ul');
        subList.className = 'toc-sublist';
        li.appendChild(subList);

        function toggleGroup() {
          const isOpen = li.classList.toggle('open');
          arrow.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          // 展開時若「當前閱讀位置」在此組內，順帶打開到所在節／款，直接看到那一條
          if (isOpen && toc._activeId) {
            const active = li.querySelector('.toc-link[data-target="' + toc._activeId + '"]');
            if (active) expandAncestors(active);
          }
          updateCollapseBtn();
        }

        // 點箭頭＝展開／收合（不觸發整行跳轉）
        arrow.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          toggleGroup();
        });
        arrow.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            toggleGroup();
          }
        });

        // 點標題文字＝跳到該章節
        toggle.addEventListener('click', function(e) {
          e.preventDefault();
          jumpToHeading(item.el.id);
        });

        stack.push({ level: level, subList: subList });
      } else {
        // 叶子标题 = 跳转链接
        const link = document.createElement('a');
        link.className = 'toc-link toc-h' + level;
        link.href = '#' + item.el.id;
        link.textContent = item.el.textContent;
        link.dataset.target = item.el.id;
        link.title = item.el.textContent;     // 目錄內文字被 ellipsis 截斷時仍可看全稱

        link.addEventListener('click', function(e) {
          e.preventDefault();
          jumpToHeading(this.dataset.target);
          document.querySelectorAll('.toc-link').forEach(function(l) { l.classList.remove('active'); });
          this.classList.add('active');
        });

        li.appendChild(link);
      }

      if (parent) {
        parent.subList.appendChild(li);
      } else {
        rootList.appendChild(li);
      }
    });

    // 一鍵收合所有層級（含巢狀）
    collapseBtn.addEventListener('click', function() {
      rootList.querySelectorAll('.toc-group.open').forEach(function(g) {
        g.classList.remove('open');
        const a = g.querySelector(':scope > .toc-toggle > .toc-arrow');
        if (a) a.setAttribute('aria-expanded', 'false');
      });
      updateCollapseBtn();
    });

    // 恢復重建前的展開狀態（只恢復仍存在的組）
    if (keepOpen.size) {
      rootList.querySelectorAll('.toc-group').forEach(function(g) {
        if (!keepOpen.has(g.dataset.target)) return;
        g.classList.add('open');
        const a = g.querySelector(':scope > .toc-toggle > .toc-arrow');
        if (a) a.setAttribute('aria-expanded', 'true');
      });
      // 外層先開，再由內層展開補齊子組（順序不影響，統一收尾更新按鈕）
      updateCollapseBtn();
    }

    toc.appendChild(rootList);
    return toc;
  }

  // 重建目录（内容渲染完成后由 MutationObserver 触发）
  function rebuildTOC() {
    const container = document.getElementById('law-content') || document.getElementById('order-content') || document.getElementById('draft-content');
    if (!container) return;

    const old = document.querySelector('.toc-sidebar');
    // 記住舊目錄裡展開到哪一層：切換版本／正文重渲染後不會又全部收回去
    const openIds = old
      ? Array.prototype.map.call(old.querySelectorAll('.toc-group.open'), function(g) { return g.dataset.target; }).filter(Boolean)
      : [];
    if (old) old.remove();

    const headings = container.querySelectorAll('.md-heading.md-h1, .md-heading.md-h2, .md-heading.md-h3, .md-heading.md-h4, .md-heading.md-h5');
    if (headings.length === 0) return;

    const toc = buildTocElement(headings, openIds);

    const app = document.getElementById('app');
    let layout = app ? app.querySelector('.detail-layout') : null;
    if (app && !layout) {
      layout = document.createElement('div');
      layout.className = 'detail-layout';
      const wrap = document.createElement('div');
      wrap.className = 'detail-content';
      while (app.firstChild) {
        wrap.appendChild(app.firstChild);
      }
      layout.appendChild(wrap);
      app.appendChild(layout);
    }
    if (layout) {
      layout.appendChild(toc);
    }

    setupScrollSpy(headings, toc);
    setupMobileToggle(toc);
  }

  // 滚动监听 - 只标记「当前所在章/节」，不自动展开目录
  function setupScrollSpy(headings, toc) {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }

    let ticking = false;

    function updateActiveLink() {
      let currentId = '';
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight > window.innerHeight + 4;
      // 頁面觸底：最後一條永遠到不了 top≤100，直接鎖定最後一條
      const atBottom = scrollable && (window.innerHeight + window.scrollY >= doc.scrollHeight - 2);

      if (atBottom && headings.length) {
        currentId = headings[headings.length - 1].id;
      } else {
        headings.forEach(function(heading) {
          if (heading.getBoundingClientRect().top <= 100) currentId = heading.id;
        });
        // 停在頁面頂部（還未越過第一個標題）時，預設標記第一條，避免首屏目錄全無狀態
        if (!currentId && headings.length) currentId = headings[0].id;
      }

      toc._activeId = currentId;   // 供「展開章節時順帶展開當前節/款」使用

      toc.querySelectorAll('.toc-link').forEach(function(link) {
        link.classList.toggle('active', link.dataset.target === currentId);
      });

      // 清除舊標記
      toc.querySelectorAll('.toc-group.is-current, .toc-group.is-context').forEach(function(g) {
        g.classList.remove('is-current', 'is-context');
      });
      if (!currentId) { ticking = false; return; }

      // 当前节点可能是叶子条文（.toc-link），也可能是「还没进入任何条文」的章节标题（.toc-group）
      const node = toc.querySelector('.toc-link[data-target="' + currentId + '"]')
                || toc.querySelector('.toc-group[data-target="' + currentId + '"]');
      if (!node) { ticking = false; return; }

      const isGroup = node.classList.contains('toc-group');

      // 收集祖先组链：最近的在最前，最外层在最后。
      // 不用 offsetParent 判可见性——折叠时祖先的 toggle 仍在布局外，会被误判为 null。
      const chain = [];
      if (isGroup) chain.push(node);
      let list = node.closest('ul');
      while (list && list.classList.contains('toc-sublist')) {
        const groupLi = list.parentElement;
        if (groupLi && groupLi.classList.contains('toc-group')) chain.push(groupLi);
        list = groupLi ? groupLi.parentElement : null;
      }

      // 最外层的组用底色标记（＝「你在这一章」），内层只染字色，避免整列都是色块
      chain.forEach(function(g, i) {
        g.classList.add(i === chain.length - 1 ? 'is-current' : 'is-context');
      });

      // 葉條目本身可見時，才在目錄面板內滾到可視範圍（block:nearest 不動正文）
      if (!isGroup && node.offsetParent !== null) {
        const r = node.getBoundingClientRect();
        const tr = toc.getBoundingClientRect();
        if (r.top < tr.top + 40 || r.bottom > tr.bottom - 8) {
          node.scrollIntoView({ block: 'nearest' });
        }
      }

      ticking = false;
    }

    scrollHandler = function() {
      if (!ticking) {
        requestAnimationFrame(updateActiveLink);
        ticking = true;
      }
    };
    window.addEventListener('scroll', scrollHandler);
    updateActiveLink();   // 首屏先標一次
  }

  // 移动端 TOC 浮动按钮
  function setupMobileToggle(toc) {
    let btn = document.querySelector('.toc-mobile-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'toc-mobile-toggle';
      btn.setAttribute('aria-label', '開啟目錄');
      btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg>';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        // 讀 btn._toc（重建目錄時會更新），不可閉包捕獲首次的 toc，
        // 否則 rebuildTOC() 換掉節點後按鈕仍在操作已脫離 DOM 的舊目錄。
        const target = btn._toc;
        if (target && target.isConnected) target.classList.toggle('open');
      });
      document.body.appendChild(btn);
    }
    btn._toc = toc;

    if (!document._tocOutsideClickBound) {
      document._tocOutsideClickBound = true;
      document.addEventListener('click', function(e) {
        const t = document.querySelector('.toc-sidebar.open');
        const b = document.querySelector('.toc-mobile-toggle');
        if (t && !t.contains(e.target) && !(b && b.contains(e.target))) {
          t.classList.remove('open');
        }
      });
    }
  }

  function closeMobileTOC() {
    const t = document.querySelector('.toc-sidebar.open');
    if (t) t.classList.remove('open');
  }

  // 监听内容容器变化（解决异步渲染时序问题）
  function observeContainers() {
    ['law-content', 'order-content', 'draft-content'].forEach(function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      let timer;
      new MutationObserver(function() {
        clearTimeout(timer);
        timer = setTimeout(rebuildTOC, 150);
      }).observe(el, { childList: true, subtree: true });
    });
  }


  // ==================== 移动端菜单面板开关 ====================
  // 注意：必须用独立 if，不能用 if/else if，否则点面板内部会误触发关闭面板本身。
  function setupPanels() {
    if (window.__ninePanelsBound) return;
    window.__ninePanelsBound = true;
    const menuPanel = document.getElementById('nav-menu-panel');
    const menuBtn = document.getElementById('nav-menu-switch');

    if (menuBtn && menuPanel) {
      menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        menuPanel.classList.toggle('float-panel-closed');
      });
    }

    document.addEventListener('click', function(e) {
      const onMenu = e.target.closest('#nav-menu-panel') || e.target.closest('#nav-menu-switch');
      if (!onMenu && menuPanel) menuPanel.classList.add('float-panel-closed');
    });
  }

  // ==================== 初始化 ====================

  // 详情页返回按钮：有本站来源页时返回上一页，否则回首页
  window.goBack = function() {
    try {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0) {
        window.history.back();
        return;
      }
    } catch (e) {}
    window.location.href = 'index.html';
  };

  function init() {
    setupPanels();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        observeContainers();
      });
    } else {
      observeContainers();
    }
  }

  init();
})();
