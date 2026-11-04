/**
 * static-api.js —— 静态站点取数适配层（仅在导出产物 site/ 中加载）
 *
 * 本机 `npm start` 时页面不引用本文件，行为不变。
 *
 * 背景：前端所有取数都是 fetch('/api/...')，共 29 处。静态站没有 Node 后端，
 * 且站点位于 /<repo>/ 子路径下，'/api/x' 会打到域名根。这里在 <head> 处改写
 * window.fetch，把 /api/* 就地解析为导出好的数据快照，不改任何已有调用点。
 *
 * 快照布局（由 tools/export-snapshot.js 生成、tools/export-static.js 打包）：
 *   api/snapshot.json      索引：data / twData / archive / drafts / text / mtime
 *                          / atomicIndex / amendIndex
 *   api/text/<hash>.txt    正文分片，路径形如 "text/xxx.txt"（相对 api/）
 *   api/atomic/<hash>.json 每部法規一个：{ detail, contents: { 日期: 快照 } }
 *   api/amend/<hash>.json  每部法規一个：与 GET /api/amend 同构
 */
(function () {
  'use strict';

  var origFetch = window.fetch.bind(window);
  var API_BASE = new URL('api/', document.baseURI);
  var snapPromise = null;
  var chunkCache = Object.create(null);

  // ---------- 取数基元 ----------
  function getJson(ref) {
    // ref 是相对 api/ 的路径（"text/x.txt" / "atomic/x.json"）
    if (!ref) return Promise.resolve(null);
    if (!chunkCache[ref]) {
      chunkCache[ref] = origFetch(new URL(ref, API_BASE))
        .then(function (res) { return res.ok ? res.json() : null; })
        .catch(function () { return null; });
    }
    return chunkCache[ref];
  }

  function getText(ref) {
    if (!ref) return Promise.resolve(null);
    if (!chunkCache[ref]) {
      chunkCache[ref] = origFetch(new URL(ref, API_BASE))
        .then(function (res) { return res.ok ? res.text() : null; })
        .catch(function () { return null; });
    }
    return chunkCache[ref];
  }

  function loadSnapshot() {
    if (!snapPromise) {
      snapPromise = origFetch(new URL('snapshot.json', API_BASE))
        .then(function (res) { return res.ok ? res.json() : null; })
        .catch(function () { return null; });
    }
    return snapPromise;
  }

  // ---------- 应答构造 ----------
  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
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

  var READONLY_MSG = '靜態站為唯讀快照：修正同步請在本機版（npm start）操作';

  // ---------- 路由 ----------
  window.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : (input && input.url) || '';
    var url;
    try {
      url = new URL(raw, location.href);
    } catch (e) {
      return origFetch(input, init);
    }
    if (url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0) {
      return origFetch(input, init);
    }

    var p = url.pathname;
    var method = (init && init.method ? String(init.method) : 'GET').toUpperCase();

    if (method !== 'GET') {
      // 写操作（点击计数、同步、事件追加）一律 200 + 明确说明，避免前端落到网络错误分支
      if (p === '/api/click') {
        var clickedId = '';
        try { clickedId = JSON.parse((init && init.body) || '{}').lawId || ''; } catch (e) {}
        return Promise.resolve(jsonResponse({ ok: true, count: 0, lawId: clickedId, readonly: true }));
      }
      return Promise.resolve(jsonResponse({ ok: false, error: READONLY_MSG }));
    }

    return loadSnapshot().then(function (s) {
      if (!s) return jsonResponse({ ok: false, error: '資料快照載入失敗' });

      // ---------- 固定端点 ----------
      if (p === '/api/data') return jsonResponse(s.data || {});
      if (p === '/api/tw-data') return jsonResponse(s.twData || {});
      if (p === '/api/archive') return jsonResponse(s.archive || []);
      if (p === '/api/drafts') return jsonResponse(s.drafts || {});
      if (p === '/api/click') return jsonResponse(s.clicks || {});
      if (p === '/api/atomic/laws') return jsonResponse(s.atomicLaws || []);
      if (p === '/api/amend-preview') {
        return jsonResponse({ ok: false, error: '靜態站沒有命令文書庫，無法預覽同步差異' });
      }
      if (p === '/api/amend-undo') return jsonResponse({ ok: false, error: READONLY_MSG });

      var parts = p.split('/').filter(Boolean); // ['api', ...]

      // ---------- /api/amend?law=<id> ----------
      if (p === '/api/amend') {
        var lawId = url.searchParams.get('law') || '';
        var ref = (s.amendIndex || {})[lawId];
        if (!ref) {
          // 快照里没有这部法規的同步记录：给出与后端同构的空应答
          return jsonResponse({
            ok: true, law: lawId, source: '靜態快照', target: { kind: 'none' },
            current_version: '—', next_version: 'v1', versions: [],
            pending: 0, blocked: 0, files: [], readonly: true
          });
        }
        return getJson(ref).then(function (payload) {
          if (!payload) return jsonResponse({ ok: false, error: '同步資料缺失' });
          payload.readonly = true;
          return jsonResponse(payload);
        });
      }

      // ---------- /api/content/<lawId>[/<version>] ----------
      if (parts[1] === 'content') {
        var cid = decodeURIComponent(parts[2] || '');
        var ver = parts[3] ? decodeURIComponent(parts[3]) : '';
        var key = 'content|' + cid + '|' + ver;
        return getText((s.text || {})[key]).then(function (body) {
          if (body === null) return notFound();
          return textResponse(body, { 'X-Law-Modified': (s.mtime || {})[key] });
        });
      }

      // ---------- /api/notes/<lawId> ----------
      if (parts[1] === 'notes') {
        var nid = decodeURIComponent(parts[2] || '');
        var nkey = 'notes|' + nid;
        return getText((s.text || {})[nkey]).then(function (body) {
          return body === null ? notFound()
            : textResponse(body, { 'X-Law-Modified': (s.mtime || {})[nkey] });
        });
      }

      // ---------- /api/draft-content/<id> ----------
      if (parts[1] === 'draft-content') {
        var did = decodeURIComponent(parts[2] || '');
        return getText((s.text || {})['draft|' + did]).then(function (body) {
          return body === null ? notFound() : textResponse(body);
        });
      }

      // ---------- /api/atomic/laws/<id>[/content|/diff] ----------
      if (parts[1] === 'atomic' && parts[2] === 'laws') {
        var aid = decodeURIComponent(parts[3] || '');
        var sub = parts[4] || '';
        var aref = (s.atomicIndex || {})[aid];
        if (!aref) return jsonResponse({ ok: false, error: '快照中無此法規：' + aid });
        return getJson(aref).then(function (pack) {
          if (!pack) return jsonResponse({ ok: false, error: '法規資料缺失：' + aid });

          if (sub === 'content') {
            var want = url.searchParams.get('date') || '';
            var contents = pack.contents || {};
            var hit = contents[want];
            if (!hit) {
              var dates = Object.keys(contents).sort();
              hit = dates.length ? contents[dates[dates.length - 1]] : null;
            }
            return jsonResponse(hit || { ok: false, error: '無此日期快照：' + want });
          }
          if (sub === 'diff') {
            return jsonResponse({ ok: false, error: '靜態站不提供版本差異計算' });
          }
          return jsonResponse(pack.detail || { ok: false, error: '快照中無此法規：' + aid });
        });
      }

      return jsonResponse({ ok: false, error: '靜態站未實作此端點：' + p });
    });
  };
})();
