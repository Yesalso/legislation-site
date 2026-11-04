// 主题切换功能
(function() {
  'use strict';

  const THEME_KEY = 'law-system-theme';
  const LIGHT = 'light';
  const DARK = 'dark';

  // 获取保存的主题或系统偏好
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    
    // 检测系统偏好
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return DARK;
    }
    return LIGHT;
  }

  // 应用主题
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    
    // 更新切换按钮图标
    updateToggleButton(theme);
  }

  // 切换主题
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || LIGHT;
    const next = current === LIGHT ? DARK : LIGHT;
    setTheme(next);
  }

  // 更新切换按钮图标
  function updateToggleButton(theme) {
    const buttons = document.querySelectorAll('.theme-toggle');
    buttons.forEach(btn => {
      btn.innerHTML = theme === DARK 
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      btn.setAttribute('aria-label', theme === DARK ? '切换到亮色模式' : '切换到暗色模式');
    });
  }

  // 创建主题切换按钮
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.onclick = toggleTheme;
    btn.setAttribute('type', 'button');
    return btn;
  }

  // 初始化
  function init() {
    // 立即应用主题（避免闪烁）
    const theme = getPreferredTheme();
    document.documentElement.setAttribute('data-theme', theme);
    
    // DOM 加载完成后创建按钮
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        updateToggleButton(theme);
        injectToggleButton();
      });
    } else {
      updateToggleButton(theme);
      injectToggleButton();
    }

    // 监听系统主题变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem(THEME_KEY)) {
          setTheme(e.matches ? DARK : LIGHT);
        }
      });
    }
  }

  // 注入切换按钮到导航栏
  function injectToggleButton() {
    const fwActions = document.querySelector('.fw-nav-actions');
    if (fwActions && !fwActions.querySelector('.theme-toggle')) {
      const menuBtn = document.getElementById('nav-menu-switch');
      const btn = createToggleButton();
      if (menuBtn) {
        fwActions.insertBefore(btn, menuBtn);
      } else {
        fwActions.appendChild(btn);
      }
      return;
    }

    const nav = document.querySelector('.top-nav-list');
    if (nav && !nav.querySelector('.theme-toggle')) {
      const btn = createToggleButton();
      const li = document.createElement('li');
      li.className = 'top-nav-item theme-toggle-item';
      li.appendChild(btn);
      nav.appendChild(li);
    }
  }

  // 暴露全局方法
  window.toggleTheme = toggleTheme;
  window.setTheme = setTheme;
  window.getPreferredTheme = getPreferredTheme;

  // 立即执行
  init();
})();
