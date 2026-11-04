/**
 * static-api.js —— 静态站点取数适配层（仅在 GitHub Pages 构建产物中加载）
 *
 * 本机 `npm start` 时页面完全不引用本文件，行为与改动前一致。
 *
 * 背景：前端所有取数都是绝对路径 fetch('/api/...')，共 29 处，分布在
 * js/app.js、js/search.js、js/archive.js、js/section.js、js/compareLaw.js、
 * js/draft-detail.js、js/home-widgets.js 与 index.html / tw.html 内联脚本。
 * Pages 上没有 Node 后端，且站点位于 /<repo>/ 子路径下，'/api/x' 会打到域名根。
 *
 * 做法：在 <head> 处（早于其他脚本）改写 window.fetch，把 /api/* 就地解析为
 * api/snapshot.json 里的数据，不触碰任何已有调用点。
 */
(function () {
  'use strict';

  var origFetch = window.fetch.bind(window);
  var snapPromise = null;

  function emptySnapshot() {
    return {
      empty: true,
      data: { laws: { categories: [], tags: [] }, orders: { categories: [] },
              meetings: { categories: [] }, regulations: { categories: [] },
              drafts: { categories: [] } },
      twData: { laws: { categories: [], tags: [] } },
      archive: [],
      drafts: { laws: { categories: [], types: {} } },
      atomicLaws: [], atomicDetail: {}, atomicContent: {}, atomicDiff: {},
      clicks: {}, text: {}, mtime: {}
    };
  }

  // 必须用相对路径 + document.baseURI：Pages 站点在 /<repo>/ 子路径下，
  // 写成 '/api/snapshot.json' 会落到域名根而 404。
  function loadSnapshot() {
    if (!snapPromise) {
      snapPromise = origFetch(new URL('api/snapshot.json', document.baseURI))
        .then(function (res) { return res.ok ? res.json() : emptySnapshot(); })
        .catch(emptySnapshot);
    }
    return snapPromise;
  }

  function jsonResponse(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function textResponse(text, extraHeaders) {
    var headers = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (extraHeaders) {
      for (var k in extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(extraHeaders, k) && extraHeaders[k]) {
          headers[k] = extraHeaders[k];
        }
      }
    }
    return new Response(text, { status: 200, headers: headers });
  }

  function notFound() {
    return new Response('Not Found', { status: 404 });
  }

  // 与 GET /api/amend 同构的「无命令文书库」应答，让详情页正常渲染空表格
  function amendStub(lawId) {
    return {
      ok: true,
      law: lawId || '',
      source: '靜態展示站（無法規資料）',
      target: { kind: 'none' },
      current_version: '—',
      next_version: 'v1',
      versions: [],
      pending: 0,
      blocked: 0,
      files: []
    };
  }

  function readBlob(snapshot, key, isText) {
    var ref = (snapshot.text || {})[key];
    if (!ref) return null;
    return origFetch(new URL(ref, document.baseURI))
      .then(function (res) { return res.ok ? res.text() : null; })
      .then(function (body) {
        if (body === null) return null;
        if (!isText) return body;
        return textResponse(body, { 'X-Law-Modified': (snapshot.mtime || {})[key] });
      });
  }

  window.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : (input && input.url) || '';
    var url;
    try {
      url = new URL(raw, location.href);
    } catch (e) {
      return origFetch(input, init);
    }
    // 只接管同源的 /api/*，其余（css、js、json 快照本身）原样放行
    if (url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0) {
      return origFetch(input, init);
    }

    var p = url.pathname;
    var method = (init && init.method ? String(init.method) : 'GET').toUpperCase();

    return loadSnapshot().then(function (s) {
      // ---------- 写操作：一律 200 + 明确说明，避免前端落到网络错误分支 ----------
      if (method !== 'GET') {
        if (p === '/api/click') {
          return jsonResponse({ ok: true, count: 0, note: '靜態展示站：計數不落盤' });
        }
        return jsonResponse({
          ok: false,
          error: '靜態展示版不支援同步與寫入，請在本機版（npm start）操作'
        });
      }

      // ---------- 固定端点 ----------
      if (p === '/api/data') return jsonResponse(s.data || emptySnapshot().data);
      if (p === '/api/tw-data') return jsonResponse(s.twData || emptySnapshot().twData);
      if (p === '/api/archive') return jsonResponse(s.archive || []);
      if (p === '/api/drafts') return jsonResponse(s.drafts || emptySnapshot().drafts);
      if (p === '/api/click') return jsonResponse(s.clicks || {});
      if (p === '/api/atomic/laws') return jsonResponse(s.atomicLaws || []);
      if (p === '/api/amend') return jsonResponse(amendStub(url.searchParams.get('law')));
      if (p === '/api/amend-preview') {
        return jsonResponse({ ok: false, error: '靜態展示版沒有命令文書庫，無法預覽同步差異' });
      }
      if (p === '/api/amend-undo') {
        return jsonResponse({ ok: false, error: '靜態展示版不支援回退' });
      }

      var parts = p.split('/').filter(Boolean); // ['api', ...]

      // ---------- /api/content/<lawId>[/<version>] ----------
      if (parts[1] === 'content') {
        var lawId = decodeURIComponent(parts[2] || '');
        var ver = parts[3] ? decodeURIComponent(parts[3]) : '';
        return readBlob(s, 'content|' + lawId + '|' + ver, true)
          .then(function (r) { return r || notFound(); });
      }

      // ---------- /api/notes/<lawId> ----------
      if (parts[1] === 'notes') {
        var nid = decodeURIComponent(parts[2] || '');
        return readBlob(s, 'notes|' + nid, true)
          .then(function (r) { return r || notFound(); });
      }

      // ---------- /api/draft-content/<id> ----------
      if (parts[1] === 'draft-content') {
        var did = decodeURIComponent(parts[2] || '');
        return readBlob(s, 'draft|' + did, true)
          .then(function (r) { return r || notFound(); });
      }

      // ---------- /api/atomic/laws/<id>[/content|/diff] ----------
      if (parts[1] === 'atomic' && parts[2] === 'laws') {
        var aid = decodeURIComponent(parts[3] || '');
        var sub = parts[4] || '';
        if (sub === 'content') {
          var date = url.searchParams.get('date') || '9999-12-31';
          return jsonResponse((s.atomicContent || {})[aid + '@' + date] ||
            { ok: false, error: '靜態展示版無此法規快照：' + aid });
        }
        if (sub === 'diff') {
          var from = url.searchParams.get('from') || '';
          var to = url.searchParams.get('to') || '';
          return jsonResponse((s.atomicDiff || {})[aid + '@' + from + '@' + to] ||
            { ok: false, error: '靜態展示版無此版本比較' });
        }
        var detail = (s.atomicDetail || {})[aid];
        return jsonResponse(detail || { ok: false, error: '靜態展示版無此法規：' + aid });
      }

      return jsonResponse({ ok: false, error: '靜態展示版未實作此端點：' + p });
    });
  };

  // 顶部提示条：让访客一眼看出这是界面展示版，而不是「网站坏了」
  window.addEventListener('DOMContentLoaded', function () {
    loadSnapshot().then(function (s) {
      if (!s || !s.empty || !document.body) return;
      var bar = document.createElement('div');
      bar.id = 'static-demo-banner';
      bar.style.cssText =
        'position:sticky;top:0;z-index:9999;padding:.5rem 1rem;' +
        'background:#fff4e6;color:#8a4b00;border-bottom:1px solid #ffd8a8;' +
        'font-size:.85rem;line-height:1.6;text-align:center;';
      bar.textContent = '介面展示版：法規資料未隨站發布，目錄、搜尋與版本內容為空。完整功能請在本機執行。';
      document.body.insertBefore(bar, document.body.firstChild);
    });
  });
})();
