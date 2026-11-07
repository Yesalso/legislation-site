const MD_HEADINGS = {
  1: { font: 'GenSekiGothic TW', size: '18pt' },
  // 二級標題（##）用 MingLiu
  2: { font: 'MingLiu', size: '15pt' },
  3: { font: 'GenSekiGothic TW', size: '13.5pt' },
  4: { font: 'GenSekiGothic TW', size: '13.5pt' },
  5: { font: 'GenSekiGothic TW', size: '12pt' },
  // 六級標題（######）用 MingLiu
  6: { font: 'MingLiu', size: '12pt' }
};

// 分隔線：*** / --- / ___（字元之間可有空白，至少三個）單獨成行即為 <hr>
var MD_HR_RE = /^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/;

// 標題／正文的行內樣式（單一來源：法規詳情頁與「異動條文」比對表共用）
function mdHeadingStyle(level) {
  var cfg = MD_HEADINGS[level] || MD_HEADINGS[6];
  // 五級＝條文標題，上下留白收窄；其餘章節標題保留較大段距
  var margin = level === 5 ? '0.2em 0 0.12em' : '0.9em 0 0.35em';
  return "font-family:'" + cfg.font + "';font-size:" + cfg.size + ';font-weight:bold;margin:' + margin;
}

function mdParagraphStyle() {
  return "font-family:'MingLiu';font-size:12pt;line-height:1.8;margin:0.18em 0";
}

// 標題行相鄰的空行在渲染時折疊：標題本身已有邊距，空行只會造成大片留白
function isHeadingLine(line) {
  return /^#{1,6}\s+/.test(String(line).trim());
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInlineMd(text) {
  var s = escapeHtml(text);

  // 行內程式碼（`文字`）：先抽出保護，避免其中的 * _ [[ ]] 被後續規則誤改
  var codes = [];
  s = s.replace(/`([^`\n]+)`/g, function(m, code) {
    codes.push(code);
    return '\u0002C' + (codes.length - 1) + '\u0002';
  });

  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 匹配 [[#第X條 ...|显示文本]] 格式，生成跳转链接（支持「第145條之1」与「第6-1條」两种写法）
  s = s.replace(/\[\[#(第[\d一二三四五六七八九十百]+條(?:[之\-][\d一二三四五六七八九十]+)?)[^\|]*\|([^\]]+)\]\]/g,
    function(m, art, label) {
      art = normArtId(art);
      return '<a href="#art-' + art + '" class="md-wiki-link" onclick="scrollToArticle(event, \'art-' + art + '\')">' + label + '</a>';
    });
  s = s.replace(/\[\[#(第[\d一二三四五六七八九十百]+(?:[之\-][\d一二三四五六七八九十]+)?條)[^\|]*\|([^\]]+)\]\]/g,
    function(m, art, label) {
      art = normArtId(art);
      return '<a href="#art-' + art + '" class="md-wiki-link" onclick="scrollToArticle(event, \'art-' + art + '\')">' + label + '</a>';
    });
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,
    '<span class="md-wiki-link">$2</span>');
  s = s.replace(/\[\[([^\]]+)\]\]/g,
    '<span class="md-wiki-link">$1</span>');

  // 還原行內程式碼（字型由 .md-inline-code 指定）
  s = s.replace(/\u0002C(\d+)\u0002/g, function(m, idx) {
    return '<code class="md-inline-code">' + codes[Number(idx)] + '</code>';
  });
  return s;
}

// 平滑滚动到指定条文
function scrollToArticle(event, articleId) {
  if (event && event.preventDefault) event.preventDefault();
  var target = document.getElementById(articleId);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 高亮显示目标条文（高亮色跟隨主題色相，暗色下不會殘留淺色塊）
    target.style.transition = 'background-color 0.5s';
    target.style.backgroundColor = 'color-mix(in oklab, var(--primary) 22%, var(--article-heading-bg))';
    setTimeout(function() {
      target.style.backgroundColor = 'var(--article-heading-bg)';
    }, 2000);
  }
}

// 从經歷過程等视图跳转到条文：先切回瀏覽法律标签再滚动
function jumpToArticle(event, artId) {
  if (event && event.preventDefault) event.preventDefault();
  if (typeof switchTab === 'function') switchTab('content');
  setTimeout(function() {
    scrollToArticle(null, 'art-' + artId);
  }, 250);
}

// 歷史文本内联渲染：条文链接跳转本页条文，會議編號链接到相關會議頁
function renderHistoryInline(text) {
  var s = escapeHtml(text);
  s = s.replace(/\[\[#(第[\d一二三四五六七八九十百]+條(?:[之\-][\d一二三四五六七八九十]+)?)[^\]]*?\|([^\]]+)\]\]/g,
    function(m, art, label) {
      art = normArtId(art);
      return '<a href="#art-' + art + '" class="md-wiki-link" onclick="jumpToArticle(event, \'' + art + '\')">' + label + '</a>';
    });
  s = s.replace(/\[\[#(第[\d一二三四五六七八九十百]+(?:[之\-][\d一二三四五六七八九十]+)?條)[^\]]*?\|([^\]]+)\]\]/g,
    function(m, art, label) {
      art = normArtId(art);
      return '<a href="#art-' + art + '" class="md-wiki-link" onclick="jumpToArticle(event, \'' + art + '\')">' + label + '</a>';
    });
  s = s.replace(/\[\[(\d+)\]\]/g,
    '<a href="meetings.html" class="md-wiki-link md-meeting-link" title="於相關會議中查看">$1</a>');
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="md-wiki-link">$2</span>');
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<span class="md-wiki-link">$1</span>');

  // 把纯文本中的阿拉伯数字條号转为条文跳转链接：
  // ①「第 150 條」「第73、145-1、146~153、157、163、185、190、343及432條」→ 各数字可点击；
  // ② 无「第」前缀（如「增訂…及150-1~150-5及163-1條」）同样转换。
  // 关键：所有数字转换都必须在「占位保护 <a>」之后执行，否则会误改 wiki 链接的 href/onclick
  // （里面也含「第N條」），造成标签破损。带「第」规则生成的新 <a> 需二次保护，避免无前缀规则重复处理。
  var anchors = [];
  function protectAnchors(str) {
    return str.replace(/<a[^>]*>[\s\S]*?<\/a>/g, function(m) {
      anchors.push(m);
      return '\u0001A' + (anchors.length - 1) + '\u0001';
    });
  }
  function restoreAnchors(str) {
    return str.replace(/\u0001A(\d+)\u0001/g, function(m, i) { return anchors[Number(i)]; });
  }

  s = protectAnchors(s);  // 保护 wiki 链接生成的 <a>

  s = s.replace(/第\s*([\d、\s及\-~]+?)\s*條/g, function(m, nums) {
    var parts = nums.split(/[、\s及~]+/).filter(function(x) { return x !== ''; });
    if (parts.length === 0) return m;
    var links = parts.map(function(n) {
      return '<a href="#art-第' + n + '條" class="md-wiki-link tl-art-link" onclick="jumpToArticle(event, \'第' + n + '條\')">' + n + '</a>';
    });
    return '第' + links.join('、') + '條';
  });

  s = protectAnchors(s);  // 保护刚生成的带「第」链接，防止无前缀规则二次处理

  s = s.replace(/(\d+(?:-\d+)?(?:之\d+)?)(?:~(\d+(?:-\d+)?(?:之\d+)?))?(?:及(\d+(?:-\d+)?(?:之\d+)?))?(?=\s*條)/g, function(m, a, b, c) {
    var links = [a];
    if (b) links.push(b);
    if (c) links.push(c);
    return links.map(function(n) {
      n = n.replace(/之/g, '-');
      return '<a href="#art-第' + n + '條" class="md-wiki-link tl-art-link" onclick="jumpToArticle(event, \'第' + n + '條\')">' + n + '</a>';
    }).join('~');
  });

  s = restoreAnchors(s);

  return s;
}

// 提取立法沿革原始行：支援文檔任意位置的「立法沿革」標題段，
// 無標題時掃描行首編號熙明日期行或「MM月DD日」式沿革行（含緊跟的深層縮進續行）
function extractHistoryForTimeline(content) {
  var lines = content.replace(/\r\n/g, '\n').split('\n');
  var collected = [];
  var startIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim().indexOf('立法沿革') === 0) { startIdx = i; break; }
  }
  if (startIdx >= 0) {
    for (var j = startIdx + 1; j < lines.length; j++) {
      if (/^#{1,6}\s/.test(lines[j]) && lines[j].charAt(0) !== '\t') break;
      collected.push(lines[j]);
    }
    return collected;
  }

  var lastIdx = -2;
  for (var k = 0; k < lines.length; k++) {
    var line = lines[k];
    var t = line.trim();
    if (t === '') continue;
    if (/^\d+[\.、]\s*熙明/.test(t.trim()) || /^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(t.trim())) {
      collected.push(line);   // 保留原始縮進，供時間線區分「會議修正」與其子行「令修正公布」
      lastIdx = k;
      continue;
    }
    if (collected.length > 0 && k === lastIdx + 1 && /^\t{2,}/.test(line)) {
      collected.push(line);
      lastIdx = k;
    }
  }
  return collected;
}

// 中文數字解析（支援零一二三四五六七八九十百，如 十三→13、二十九→29）
function cnNum(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  var map = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  var total = 0, num = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (map[ch] !== undefined) num = map[ch];
    else if (ch === '十') { total += (num || 1) * 10; num = 0; }
    else if (ch === '百') { total += (num || 1) * 100; num = 0; }
  }
  return total + num;
}

var CN_D = '0-9零一二三四五六七八九十百';

// 構建立法沿革時間線（歸檔風格）
// 每個帶日期的條目（會議通過、令令公布）獨立顯示一個時間線節點，
// 按時間從後往前（新→舊）排序；無日期的細節行附屬於其前一節點之下；
// 無日期的獨立節點以文件最後修改時間作為日期（mtimeDisplay，熙明格式）
function buildHistoryTimeline(historyLines, mtimeDisplay) {
  if (!historyLines || historyLines.length === 0) {
    return '<div class="fw-empty"><p>此法規暫無立法沿革紀錄</p></div>';
  }

  var groups = [];
  function currentGroup() { return groups.length > 0 ? groups[groups.length - 1] : null; }

  for (var i = 0; i < historyLines.length; i++) {
    var raw = historyLines[i];
    var trimmed = raw.trim();
    if (trimmed === '') continue;

    var key = null;
    var dateText = '';
    var text = trimmed.replace(/^\d+[\.、]\s*/, '');
    var body = text;
    var eraDateRe = new RegExp('^(熙明\\s*[' + CN_D + ']+\\s*年\\s*[' + CN_D + ']+\\s*月\\s*[' + CN_D + ']+\\s*日)([\\s\\S]*)$');
    var dateMatch = text.match(eraDateRe);
    var partialMatch = text.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日([\s\S]*)$/);

    if (!dateMatch && !partialMatch && groups.length > 0 && text.length < 15 && !text.includes('年')) {
      // 續行（如「條條文。」）併入上一節點：有子項時併入最後子項，否則併入正文
      var cg = currentGroup();
      if (cg.children.length > 0) cg.children[cg.children.length - 1] += text;
      else cg.body += text;
      continue;
    }

    if (dateMatch) {
      dateText = dateMatch[1];
      var dm = dateText.match(new RegExp('熙明\\s*([' + CN_D + ']+)\\s*年\\s*([' + CN_D + ']+)\\s*月\\s*([' + CN_D + ']+)\\s*日'));
      key = cnNum(dm[1]) * 10000 + cnNum(dm[2]) * 100 + cnNum(dm[3]);
      body = dateMatch[2].replace(/^[，、\s]+/, '');
    } else if (partialMatch) {
      // 「05月14日」式：補當前熙明年
      var curEra = new Date().getFullYear() - 2013;
      dateText = '熙明 ' + curEra + ' 年 ' + parseInt(partialMatch[1], 10) + ' 月 ' + parseInt(partialMatch[2], 10) + ' 日';
      key = curEra * 10000 + parseInt(partialMatch[1], 10) * 100 + parseInt(partialMatch[2], 10);
      body = partialMatch[3].replace(/^[，、\s]+/, '');
    }

    // 縮進子行（如「主任委員…令修正公布…」）：即使帶日期也歸入前一節點，
    // 作為右側第二段（與「會議修正」同屬一次沿革），不單獨成為時間線節點
    if (/^\t{2,}/.test(raw) && currentGroup() && (dateMatch || partialMatch)) {
      currentGroup().children.push(body);
      continue;
    }

    if (dateMatch || partialMatch) {
      groups.push({ date: dateText, key: key, body: body, children: [] });
    } else if (currentGroup()) {
      // 無日期細節行（如「熙字第…號令公告…」）作為當前節點的子項
      currentGroup().children.push(text);
    } else {
      groups.push({ date: '', key: null, body: text, children: [] });
    }
  }
  if (groups.length === 0) {
    return '<div class="fw-empty"><p>此法規暫無立法沿革紀錄</p></div>';
  }

  // 時間從後往前排序（新→舊）；同日或無日期者保持文檔原順序（穩定排序）
  var indexed = groups.map(function(g, idx) { return { g: g, idx: idx }; });
  indexed.sort(function(a, b) {
    if (a.g.key !== null && b.g.key !== null && a.g.key !== b.g.key) return b.g.key - a.g.key;
    return a.idx - b.idx;
  });

  // 依「熙明 X 年」分組（新→舊、組內保持文檔順序），版面與「立法歷程」歸檔頁共用同一組 .ar-* 樣式
  var years = [];
  var byYear = {};
  indexed.forEach(function(w) {
    var g = w.g;
    var dateText = g.date || (g.key === null && mtimeDisplay ? mtimeDisplay : '');
    var ym = dateText.match(new RegExp('熙明\\s*([' + CN_D + ']+)\\s*年'));
    var label = ym ? '熙明 ' + cnNum(ym[1]) + ' 年' : '未載明年份';
    if (!byYear[label]) { byYear[label] = { label: label, items: [] }; years.push(byYear[label]); }
    var md = '';
    if (g.key !== null) {
      md = String(Math.floor((g.key % 10000) / 100)).padStart(2, '0') + '-' + String(g.key % 100).padStart(2, '0');
    }
    var childHtml = g.children.map(function(c) {
      return '<span class="ar-event ar-event-sub">' + renderHistoryInline(c) + '</span>';
    }).join('');
    byYear[label].items.push({
      md: md,
      fullDate: dateText,
      title: renderHistoryInline(g.body) || '<span class="ar-event ar-noevent">（無說明的沿革紀錄）</span>',
      children: childHtml
    });
  });

  var html = '';
  years.forEach(function(y) {
    html += '<div class="ar-group">' +
            '<div class="ar-group-header">' +
            '<div class="ar-year">' + escapeHtml(y.label) + '</div>' +
            '<div class="ar-header-dot"></div>' +
            '<div class="ar-count">' + y.items.length + ' 則沿革</div>' +
            '</div>';
    y.items.forEach(function(it) {
      html += '<div class="ar-row ar-wrap"' + (it.fullDate ? ' title="' + escapeHtml(it.fullDate) + '"' : '') + '>' +
              '<div class="ar-date">' + escapeHtml(it.md) + '</div>' +
              '<div class="ar-line"><div class="ar-dot"></div></div>' +
              '<div class="ar-main">' +
              '<div class="ar-title">' + it.title + '</div>' +
              (it.children ? '<div class="ar-body">' + it.children + '</div>' : '') +
              '</div>' +
              '</div>';
    });
    html += '</div>';
  });
  return html;
}

function applyIndent(text, tabIndent) {
  if (!text) return '';
  const indentMatch = text.match(/^\t+/);
  const tabLevel = indentMatch ? indentMatch[0].length : 0;
  const t = text.trim();

  // tabIndent 模式：完全按原始 tab 缩进渲染（1 tab = 2em padding），
  // 不再应用下方模式规则（［\d+］/一、/（一）/1. 等会被错误加 4em）
  if (tabIndent) {
    return '<span style="display:inline-block;width:100%;padding-left:' + (tabLevel * 2) + 'em">' + renderInlineMd(t) + '</span>';
  }

  if (/^［\d+］/.test(t)) {
    return '<span style="display:inline-block;width:100%">' + renderInlineMd(t) + '</span>';
  }

  if (/^[一二三四五六七八九十]+、/.test(t)) {
    return '<span style="display:inline-block;width:100%;text-indent:2em">' + renderInlineMd(t) + '</span>';
  }

  if (/^（[一二三四五六七八九十]+）/.test(t)) {
    return '<span style="display:inline-block;width:100%;padding-left:2em;text-indent:2em">' + renderInlineMd(t) + '</span>';
  }

  if (/^\d+[.、]/.test(t)) {
    return '<span style="display:inline-block;width:100%;padding-left:4em;text-indent:2em">' + renderInlineMd(t) + '</span>';
  }

  return renderInlineMd(t);
}

/* ---------------- Markdown 表格 ---------------- */

// 切表格列：首尾豎線可省略；支援 \| 轉義；空欄保留（不以 split 丟空字串）
function mdSplitRow(line) {
  var s = String(line == null ? '' : line).trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.length > 0 && s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') {
    s = s.slice(0, -1);
  }
  var cells = [], buf = '', escaped = false;
  for (var i = 0; i < s.length; i++) {
    // [[#第5條|顯示文字]] 內的豎線屬於連結語法，不視為欄分隔
    if (s.charAt(i) === '[' && s.charAt(i + 1) === '[') {
      var close = s.indexOf(']]', i + 2);
      if (close !== -1) { buf += s.slice(i, close + 2); i = close + 1; continue; }
    }
    // 行內程式碼 `…` 內的豎線同理
    if (s.charAt(i) === '`') {
      var tick = s.indexOf('`', i + 1);
      if (tick !== -1) { buf += s.slice(i, tick + 1); i = tick; continue; }
    }
    var ch = s.charAt(i);
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '|') { cells.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (escaped) buf += '\\';
  cells.push(buf.trim());
  return cells;
}

// 分隔列（| --- | :--: |）。必須含豎線，否則水平線 --- 會被誤判成表格
function mdIsSeparator(line) {
  if (!line || line.indexOf('|') === -1) return false;
  var cells = mdSplitRow(line);
  if (!cells.length) return false;
  for (var i = 0; i < cells.length; i++) {
    if (!/^:?-{1,}:?$/.test(cells[i].replace(/\s+/g, ''))) return false;
  }
  return true;
}

function mdAlignOf(cell) {
  var c = String(cell == null ? '' : cell).replace(/\s+/g, '');
  var left = c.charAt(0) === ':';
  var right = c.charAt(c.length - 1) === ':';
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

// 估算文字寬度（半形字寬為 1，全形/CJK 為 2）；wiki 連結只計顯示文字
function mdTextWidth(text) {
  var t = String(text == null ? '' : text)
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\*\*|__|\*|_|`/g, '');
  var w = 0;
  for (var i = 0; i < t.length; i++) {
    var code = t.charCodeAt(i);
    var wide = (code >= 0x1100 && (
      code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)));
    w += wide ? 2 : 1;
  }
  return w;
}

// 依各欄文字量擬定欄寬（em）：以最大值為主、平均值為輔，
// 單欄設上限讓超長內容靠換行吸收，避免一格吃掉整張表
function mdTableColWidths(header, bodyRows) {
  var CAP = 46;          // 單欄內容上限（半形字寬，約 23 個漢字）
  var widths = [];
  for (var c = 0; c < header.length; c++) {
    var headW = mdTextWidth(header[c]);
    var maxW = headW;
    var sumW = 0, cnt = 0;
    for (var r = 0; r < bodyRows.length; r++) {
      var w = mdTextWidth(bodyRows[r][c]);
      if (w > 0) { sumW += w; cnt++; }
      if (w > maxW) maxW = w;
    }
    var avgW = cnt ? sumW / cnt : 0;
    var score = 0.6 * Math.min(maxW, CAP) + 0.4 * Math.min(avgW, CAP);
    // 表頭不得被內容（尤其是全空的資料欄）擠壓到換行
    if (headW > score) score = headW;
    if (score < 3) score = 3;              // 空欄也保留最小寬度
    if (score > CAP) score = CAP;
    // 半形≈0.5em；再加左右內距（含粗體表頭的餘裕）
    widths.push(Math.round((score * 0.52 + 2.0) * 10) / 10);
  }
  return widths;
}

function renderMdTable(header, aligns, bodyRows) {
  var n = header.length;
  var widths = mdTableColWidths(header, bodyRows);
  var colgroup = '', i;
  for (i = 0; i < n; i++) {
    colgroup += '<col style="width:' + widths[i] + 'em">';
  }
  var cls = 'md-table' + (n >= 8 ? ' md-table--dense' : '');
  var html = '<div class="md-table-wrap"><table class="' + cls + '">' +
             '<colgroup>' + colgroup + '</colgroup><thead><tr>';
  for (i = 0; i < n; i++) {
    html += '<th' + (aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '') + '>' +
            renderInlineMd(header[i]) + '</th>';
  }
  html += '</tr></thead>';
  if (bodyRows.length) {
    html += '<tbody>';
    for (var r = 0; r < bodyRows.length; r++) {
      html += '<tr>';
      for (i = 0; i < n; i++) {
        html += '<td' + (aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '') + '>' +
                renderInlineMd(bodyRows[r][i] || '') + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table></div>';
  return html;
}

// 解析從 start 開始的表格塊，回傳 { html, end }（end = 表格後第一行）
function parseMdTable(lines, start) {
  var header = mdSplitRow(lines[start]);
  var aligns = mdSplitRow(lines[start + 1]).map(mdAlignOf);
  var rows = [];
  var i = start + 2;
  for (; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t === '' || t.indexOf('|') === -1) break;
    if (t.indexOf('```') === 0) break;
    // 緊接的下一個表格（兩表之間沒有空行）：本行是新表頭，交回主迴圈
    if (i + 1 < lines.length && mdIsSeparator(lines[i + 1])) break;
    var cells = mdSplitRow(t);
    // 以表頭欄數為準：不足補空欄、超出截斷，避免個別多餘豎線撐出鬼欄
    if (cells.length > header.length) cells = cells.slice(0, header.length);
    while (cells.length < header.length) cells.push('');
    rows.push(cells);
  }
  while (aligns.length < header.length) aligns.push('');
  aligns = aligns.slice(0, header.length);
  return { html: renderMdTable(header, aligns, rows), end: i };
}

// 統一條号格式：第145條之1 / 第145-1條 → 第145-1條（与经历過程链接、正文 id 一致）
function normArtId(art) {
  var m = art.match(/第([\d一二三四五六七八九十百]+)條(?:[之\-]([\d一二三四五六七八九十]+))?/);
  if (m) return '第' + m[1] + (m[2] ? '-' + m[2] : '') + '條';
  m = art.match(/第([\d一二三四五六七八九十百]+)(?:[之\-]([\d一二三四五六七八九十]+))?條/);
  if (m) return '第' + m[1] + (m[2] ? '-' + m[2] : '') + '條';
  return art;
}

function extractArticleId(headingText) {
  var m = headingText.match(/第[\d一二三四五六七八九十百]+條(?:[之\-][\d一二三四五六七八九十]+)?/) ||
          headingText.match(/第[\d一二三四五六七八九十百]+(?:[之\-][\d一二三四五六七八九十]+)?條/);
  return m ? normArtId(m[0]) : null;
}

function parseHistorySection(lines) {
  var historyLines = [];
  var bodyStart = 0;

  // 检测文档开头是否有"立法沿革"
  if (lines.length > 0 && lines[0].trim().indexOf('立法沿革') === 0) {
    historyLines.push(lines[0]);
    bodyStart = 1;
    // 收集后续的所有行，直到遇到非缩进的标题
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      // 如果遇到非缩进的标题（# 开头），停止收集
      if (/^#{1,6}\s/.test(line) && line.charAt(0) !== '\t') {
        break;
      }
      historyLines.push(line);
      bodyStart = i + 1;
    }
  }

  return { historyLines: historyLines, bodyStart: bodyStart };
}

function renderHistoryBlock(historyLines) {
  if (historyLines.length <= 1) return '';

  var entries = [];
  var currentEntry = null;

  function indentOf(s) {
    var m = s.match(/^(\t*)/);
    return m ? m[1].length : 0;
  }
  // 判断一行是否为新条目：可带编号前缀（1. / 1、），其后接「熙明 X年」或「MM月DD日」
  function isEntryStart(line) {
    var t = line.trim().replace(/^\d+[\.、]\s*/, '');
    return /^熙明\s*[\d零一二三四五六七八九十百]+\s*年/.test(t)
        || /^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(line.trim());
  }

  var currentIndent = -1;

  for (var i = 1; i < historyLines.length; i++) {
    var line = historyLines[i];
    var trimmed = line.trim();
    if (trimmed === '') continue;

    if (isEntryStart(line)) {
      var ind = indentOf(line);
      // 缩进更深 → 作为上一条目的子项（如「主任委员令…公布」）
      if (currentEntry && ind > currentIndent) {
        currentEntry.details.push(trimmed);
      } else {
        if (currentEntry) entries.push(currentEntry);
        currentEntry = { summary: trimmed, details: [] };
        currentIndent = ind;
      }
    } else {
      if (currentEntry) {
        currentEntry.details.push(trimmed);
      }
      // 尚无当前条目时的孤立行忽略
    }
  }
  if (currentEntry) entries.push(currentEntry);

  var html = '<div class="law-history-block">';
  html += '<div class="law-history-header" onclick="toggleHistory(this)">';
  html += '<span class="law-history-title">立法沿革</span>';
  html += '<button class="note-toggle">展開</button>';
  html += '</div>';
  html += '<div class="law-history-content" style="display:none">';

  entries.forEach(function(entry) {
    var renderedSummary = renderInlineMd(entry.summary);
    var renderedDetails = entry.details.map(function(d) {
      return '<div class="law-history-detail">' + renderInlineMd(d) + '</div>';
    }).join('');
    html += '<div class="law-history-entry">' + renderedSummary + renderedDetails + '</div>';
  });

  html += '</div></div>';
  return html;
}

function toggleHistory(el) {
  var header = el.closest('.law-history-header');
  if (!header) return;
  var content = header.nextElementSibling;
  var btn = header.querySelector('.note-toggle');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    if (btn) btn.textContent = '收起';
  } else {
    content.style.display = 'none';
    if (btn) btn.textContent = '展開';
  }
}

// 提取文件開頭的獨立區域內容：狀態說明行（*…*）與標籤行（#法規 等）
// 遇到 markdown 標題、立法沿革、條文正文即停止
function extractPreamble(rawLines) {
  var items = [];
  var count = 0;
  for (var i = 0; i < rawLines.length; i++) {
    var t = rawLines[i].trim();
    if (t === '') { count = i + 1; continue; }
    if (/^#{1,6}\s/.test(t)) break;        // markdown 標題（含條文標題）
    if (/^立法沿革/.test(t)) break;         // 沿革段開始
    if (/^\*[^*]+\*$/.test(t)) {
      items.push({ type: 'status', text: t.slice(1, -1) });
      count = i + 1;
      continue;
    }
    // 標籤行：以 #標籤 開頭即可，允許行尾附帶其他內容（如 #命令 [[645&646]]）
    if (/^#[^#\s]/.test(t)) {
      var tagMatches = t.match(/#[^\s#]+/g) || [];
      if (tagMatches.length > 0) {
        // 去掉所有 #標籤 與 [[...]] 後若無剩餘文字，視為純標籤行
        var remainder = t.replace(/#[^\s#]+/g, '')
                         .replace(/\[\[[^\]]*\]\]/g, '')
                         .replace(/\s+/g, '');
        if (remainder === '') {
          items.push({ type: 'tags', tags: tagMatches });
          count = i + 1;
          continue;
        }
      }
    }
    break;                                  // 其他正文（沿革條目、條文等）
  }
  return { items: items, count: count };
}

function renderPreamble(items) {
  if (!items || items.length === 0) return '';
  var html = '<div class="law-preamble">';
  items.forEach(function(it) {
    if (it.type === 'status') {
      html += '<div class="preamble-status">' + escapeHtml(it.text) + '</div>';
    } else {
      html += '<div class="preamble-tags">' +
              it.tags.map(function(t) {
                return '<span class="fw-badge tag">' + escapeHtml(t) + '</span>';
              }).join('') +
              '</div>';
    }
  });
  html += '</div>';
  return html;
}

function parseMarkdown(text, opts) {
  var rawLines = text.replace(/\r\n/g, '\n').split('\n');
  var preamble = extractPreamble(rawLines);
  var restLines = rawLines.slice(preamble.count);
  var result = parseHistorySection(restLines);
  var historyLines = result.historyLines;
  var lines = restLines.slice(result.bodyStart);

  var html = '';
  var inCodeBlock = false;
  var inArticleBlock = false;
  var articleContent = '';

  html += renderPreamble(preamble.items);

  // 統一的輸出出口：條文區塊內收進 articleContent，其餘直接進 html
  function emit(chunk) {
    if (inArticleBlock) articleContent += chunk; else html += chunk;
  }

  // 正文不显示「立法沿革」块：其数据仅用于「經歷過程」頁籤的時間线（buildHistoryTimeline）
  // （parseHistorySection 仍会把这些行从正文剥离，避免以普通文本形式泄露）

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // 圍籬程式碼區塊：區內逐行原樣保留（含空行），結尾才輸出 </pre>
    if (inCodeBlock) {
      if (trimmed.indexOf('```') === 0) {
        inCodeBlock = false;
        emit('</pre>');
      } else {
        emit(escapeHtml(line) + '\n');
      }
      continue;
    }
    if (trimmed.indexOf('```') === 0) {
      // ```lang：取語言標記（Obsidian 會在右上角顯示）
      var fenceLang = trimmed.slice(3).trim().split(/\s+/)[0];
      inCodeBlock = true;
      emit('<pre class="md-code-block"' +
           (fenceLang ? ' data-lang="' + escapeHtml(fenceLang) + '"' : '') + '>');
      continue;
    }

    // 標題前後的空行折疊（含條文區塊結尾多餘的空行），避免區塊間出現大片留白
    if (trimmed === '') {
      var prevTxt = '';
      for (var p = i - 1; p >= 0; p--) { if (lines[p].trim() !== '') { prevTxt = lines[p]; break; } }
      var nextTxt = '';
      for (var n = i + 1; n < lines.length; n++) { if (lines[n].trim() !== '') { nextTxt = lines[n]; break; } }
      if (prevTxt === '' || nextTxt === '' || isHeadingLine(prevTxt) || isHeadingLine(nextTxt)) continue;
    }

    if (trimmed === '') {
      emit('<div class="md-empty-line"><br></div>');
      continue;
    }

    // 分隔線：*** / --- / ___（字元間可有空白）單獨成行
    if (MD_HR_RE.test(trimmed)) {
      emit('<hr class="md-hr">');
      continue;
    }

    // 表格：本行含豎線、下一行是 | --- | 分隔列即視為表格塊
    if (trimmed.indexOf('|') !== -1 && i + 1 < lines.length && mdIsSeparator(lines[i + 1])) {
      var tbl = parseMdTable(lines, i);
      emit(tbl.html);
      i = tbl.end - 1;
      continue;
    }

    var headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      var content = headingMatch[2];

      if (level === 5) {
        if (inArticleBlock) {
          html += '<div class="law-article-block">' + articleContent + '</div>';
          articleContent = '';
        }
        inArticleBlock = true;
        var artId = extractArticleId(content);
        var idAttr = artId ? ' id="art-' + artId + '"' : '';
        articleContent += '<div class="md-heading md-h5"' + idAttr + ' style="' + mdHeadingStyle(5) + ';padding:4px;background:var(--article-heading-bg)">' + renderInlineMd(content) + '</div>';
      } else {
        if (inArticleBlock) {
          html += '<div class="law-article-block">' + articleContent + '</div>';
          articleContent = '';
          inArticleBlock = false;
        }
        html += '<div class="md-heading md-h' + level + '" style="' + mdHeadingStyle(level) + '">' + renderInlineMd(content) + '</div>';
      }
      continue;
    }

    var indentedContent = applyIndent(line, opts && opts.tabIndent);
    var paragraphHtml = '<div class="md-paragraph" style="' + mdParagraphStyle() + '">' + indentedContent + '</div>';

    if (inArticleBlock) {
      articleContent += paragraphHtml;
    } else {
      html += paragraphHtml;
    }
  }

  if (inArticleBlock) {
    html += '<div class="law-article-block">' + articleContent + '</div>';
  }

  if (inCodeBlock) {
    html += '</pre>';
  }

  return html;
}

function parseNotes(text) {
  var notes = [];
  var re = /【(第[^】]+?)\s+(\d{4}-\d{2}-\d{2})\s+修正理由】([\s\S]*?)(?=【|$)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    notes.push({
      article: m[1].trim().replace('条', '條'),
      date: m[2].trim(),
      content: m[3].trim().split('\n').filter(function(l) { return l.trim(); })
    });
  }
  var grouped = {};
  notes.forEach(function(n) {
    if (!grouped[n.article]) grouped[n.article] = [];
    grouped[n.article].push(n);
  });
  Object.keys(grouped).forEach(function(k) {
    grouped[k].sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  });
  return grouped;
}

function parseLawContent(text, notes) {
  return parseMarkdown(text);
}

function updateNote(id, idx) {
  var wrapper = document.getElementById('note-' + id);
  if (!wrapper) return;
  var content = wrapper.querySelector('.note-content');
  var json = wrapper.querySelector('script[type="application/json"]');
  if (!content || !json) return;
  try {
    var versions = JSON.parse(json.textContent);
    var i = parseInt(idx, 10);
    if (versions[i]) content.innerHTML = versions[i].map(function(p) { return '<p>' + applyIndent(p) + '</p>'; }).join('');
  } catch (e) { console.error(e); }
}

function toggleNote(btn) {
  var content = btn.parentElement.nextElementSibling;
  content.style.display = content.style.display === 'none' ? 'block' : 'none';
  btn.textContent = content.style.display === 'none' ? '展開' : '收起';
}

async function loadData() {
  if (window.lawData) return window.lawData;
  try {
    var res = await fetch('/api/data');
    if (!res.ok) throw new Error('Failed to load data');
    window.lawData = await res.json();
    // 台灣法規目錄（第二數據源）
    try {
      var twRes = await fetch('/api/tw-data');
      if (twRes.ok) window.twData = await twRes.json();
    } catch (e) {
      console.warn('Failed to load tw data:', e);
    }
    return window.lawData;
  } catch (e) {
    console.error('Failed to load data:', e);
    return null;
  }
}

function findLaw(lawId) {
  var data = window.lawData;
  if (data) {
    // 法規目錄 + 相關命令（命令只在 orders 板块，详情页同样可查）
    var allCats = (data.laws.categories || []).concat(data.orders.categories || []);
    var found = allCats.flatMap(function(c) { return c.laws; }).find(function(l) { return l.id === lawId; });
    if (found) return found;
  }
  var tw = window.twData;
  if (tw) {
    return tw.laws.categories.flatMap(function(c) { return c.laws; }).find(function(l) { return l.id === lawId; });
  }
  return null;
}

function findOrder(orderId) {
  var data = window.lawData;
  if (!data) return null;
  return data.orders.categories.flatMap(function(c) { return c.laws; }).find(function(l) { return l.id === orderId; });
}

async function initDetailPage() {
  await loadData();

  var params = new URLSearchParams(location.search);
  var lawId = params.get('lawId');

  if (!lawId) {
    document.body.innerHTML = '<h1 style="text-align:center;padding:2rem">參數錯誤：缺少法規ID</h1>';
    return;
  }

  var law = findLaw(lawId);
  if (!law) {
    // 全新法規：File 文書庫有命令、但尚未進入 LawCurrent 目錄（如剛起草的制定令）。
    // /api/amend 以 lawId 為準、不依賴目錄，此際仍讓「修正同步」頁簽可達——同步後
    // export-vault 會建立派生資料夾，refreshAfterAmend 重跑本函式即恢復完整頁面。
    try {
      var probe = await fetch('/api/amend?law=' + encodeURIComponent(lawId));
      var pd = probe.ok ? await probe.json() : null;
      if (pd && pd.ok && (pd.files || []).length > 0) {
        var t1 = document.getElementById('law-title');
        if (t1) t1.textContent = lawId;
        var bcEl = document.getElementById('law-name-breadcrumb');
        if (bcEl) bcEl.textContent = lawId;
        var ttEl = document.getElementById('law-title-top');
        if (ttEl) ttEl.textContent = lawId;
        document.title = '法規查詢系統 - ' + lawId;
        var ce = document.getElementById('law-content');
        if (ce) ce.innerHTML =
          '<div class="fw-empty" style="padding:2rem"><p>此法規尚未進入法規庫（LawCurrent）。' +
          'File 文書庫中有 <b>' + pd.files.length + '</b> 道命令文書，請切換至「修正同步」頁簽執行同步；' +
          '同步後將自動建立法規頁面並恢復完整內容。</p></div>';
        switchTab('amend');
        return;
      }
    } catch (e) { /* 探測失敗落入一般提示 */ }
    document.body.innerHTML = '<h1 style="text-align:center;padding:2rem">未找到該法規</h1>';
    return;
  }

  try {
    var res = await fetch('/api/content/' + encodeURIComponent(lawId));
    if (!res.ok) throw new Error('無法加載版本內容');
    var content = await res.text();

    var notes = {};
    try {
      var notesRes = await fetch('/api/notes/' + encodeURIComponent(lawId));
      if (notesRes.ok) notes = parseNotes(await notesRes.text());
    } catch (e) {}

    var titleEl = document.getElementById('law-title');
    if (titleEl) titleEl.textContent = law.title;
    var contentEl = document.getElementById('law-content');
    if (contentEl) contentEl.innerHTML = parseLawContent(content, notes);

    var breadcrumb = document.getElementById('law-name-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = law.title;
    var titleTop = document.getElementById('law-title-top');
    if (titleTop) titleTop.textContent = law.title;
    var aliasEl = document.getElementById('law-alias');
    if (aliasEl) aliasEl.textContent = law.alias || '無';

    var ver = law.versions.find(function(v) { return v.isCurrent; }) || law.versions[law.versions.length - 1] || law.versions[0];
    if (ver) {
      var parts = ver.date.split('-');
      var dateEl = document.getElementById('amend-date');
      if (dateEl) dateEl.textContent = parts[0] + ' 年 ' + parts[1] + ' 月 ' + parts[2] + ' 日 修正';
    }

    // 構建經歷過程時間線（無撰寫時間的節點以文件最後修改時間作為日期，熙明格式）
    var tlEl = document.getElementById('history-timeline');
    if (tlEl) {
      var mtimeDisplay = '';
      var modHeader = res.headers.get('X-Law-Modified');
      if (modHeader) {
        var mp = modHeader.split('-');
        mtimeDisplay = '熙明 ' + (parseInt(mp[0], 10) - 2013) + ' 年 ' +
                       parseInt(mp[1], 10) + ' 月 ' + parseInt(mp[2], 10) + ' 日';
      }
      tlEl.innerHTML = buildHistoryTimeline(extractHistoryForTimeline(content), mtimeDisplay);
    }

    // 統一時間軸：atomic 法規（有版本快照）→ 點擊切版；Vault 法規 → 點擊條文連結跳轉高亮現行版
    initUnifiedTimeline(lawId, content, contentEl);
  } catch (e) {
    var contentEl = document.getElementById('law-content');
    if (contentEl) contentEl.innerHTML = '<div style="color:#dc3545;padding:2rem"><h3>加載失敗</h3><p>' + e.message + '</p></div>';
  }
}

// ==================== 經歷過程：統一立法沿革時間軸 ====================
// 呈現統一為「立法沿革」樣式（熙明日期 + 主任委員令號 + 修正條文連結，縮進子項）。
// 資料源分兩類，交互不同：
//   ① atomic 法規（有版本級事件，帶整版條文快照）→ 點擊沿革條目 = 切換到該版本條文；
//   ② Vault 法規（僅正文「立法沿革」文字，無逐版快照）→ 條文連結點擊 = 跳轉/高亮現行版。
// 兩者呈現同一套樣式，向「熙明十三年度政務委員會總預算施行條例」的沿革呈現對齊。

var _atomicView = { lawId: null, originalHtml: null };

function eraDateFromWestern(ws) {
  var m = String(ws || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  return '熙明 ' + (parseInt(m[1], 10) - 2013) + ' 年 ' + parseInt(m[2], 10) + ' 月 ' + parseInt(m[3], 10) + ' 日';
}

// 統一入口：先查 atomic 事件流，命中則渲染可切版沿革；否則退回正文沿革行渲染
async function initUnifiedTimeline(lawId, content, contentEl) {
  var tlEl = document.getElementById('history-timeline');
  if (!tlEl) return;
  var atomicUsed = false;
  try {
    var res = await fetch('/api/atomic/laws/' + encodeURIComponent(lawId));
    if (res.ok) {
      var data = await res.json();
      if (data.ok && Array.isArray(data.events) && data.events.length > 0) {
        _atomicView.lawId = lawId;
        _atomicView.originalHtml = contentEl ? contentEl.innerHTML : null;
        tlEl.innerHTML = renderAtomicTimeline(data.events);
        atomicUsed = true;
      }
    }
  } catch (e) { /* atomic 層不可用 */ }

  if (!atomicUsed) {
    var lines = extractHistoryForTimeline(content);
    tlEl.innerHTML = renderVaultTimeline(lines);
  }
}

// ---------- 沿革樣式共用工具（對齊全國法規資料庫：中文 MingLiU、數字藍色 Times） ----------
function pad2(n) {
  n = String(parseInt(n, 10));
  return n.length < 2 ? '0' + n : n;
}
// 西元日期 → 熙明阿拉伯數字日期，月、日補零（1 月 → 01 月、3 日 → 03 日）。
// 與既有沿革行寫法一致：熙明 13 年 10 月 16 日
function eraDateNum(ws) {
  var m = String(ws || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return String(ws || '');
  return '熙明 ' + (parseInt(m[1], 10) - 2013) + ' 年 ' + pad2(m[2]) + ' 月 ' + pad2(m[3]) + ' 日';
}
// 純文字：數字片段（令號、條號、條數）包上 .lh-num（藍色 Times），其餘中文走 MingLiU。
// 先用捕捉群切開再個別跳脫，避免 escHtml 產生的 &#39; 內之數字被誤包。
function mingliuHtml(s) {
  var raw = String(s == null ? '' : s);
  var parts = raw.split(/(\d[\d.\-~]*)/);
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1 && parts[i] !== '') out += '<span class="lh-num">' + escHtml(parts[i]) + '</span>';
    else out += escHtml(parts[i]);
  }
  return out;
}
// 已含 HTML（連結等）的字串：只處理標籤以外的文字段，屬性內數字不受影響
function wrapNumsOutsideTags(html) {
  return String(html).split(/(<[^>]*>)/g).map(function (seg, i) {
    if (i % 2 === 1) return seg;
    return seg.replace(/(\d[\d.\-~]*)/g, '<span class="lh-num">$1</span>');
  }).join('');
}
// 第N條 → N／第N條之M → N-M（沿革行慣例：阿拉伯數字）
function artKeyToNum(k) {
  var m = /^第(\d+)條(?:之(\d+))?$/.exec(String(k || ''));
  return m ? (m[2] ? m[1] + '-' + m[2] : m[1]) : String(k || '');
}
// 依主文聲明條號（含動詞）組出「修正公布第 3、5、9、10 條條文；增訂第 7 條條文」
function keysPhrase(keys) {
  var groups = [];
  (keys || []).forEach(function (k) {
    var v = k.verb || '修正';
    var last = groups[groups.length - 1];
    if (last && last.verb === v) last.keys.push(k.key);
    else groups.push({ verb: v, keys: [k.key] });
  });
  return groups.map(function (g) {
    var nums = g.keys.map(artKeyToNum).join('、');
    if (g.verb === '修正') return '修正公布第 ' + nums + ' 條條文';
    if (g.verb === '增訂') return '增訂第 ' + nums + ' 條條文';
    if (g.verb === '刪除') return '刪除第 ' + nums + ' 條';
    return g.verb + '第 ' + nums + ' 條';
  }).join('；');
}
// 命令的完整稱法：命令頭若有「熙字第 … 號令」的發文字號，一律採用完整形式
//   有熙字號 → 主任委員熙字第 01300136520 號令
//   無熙字號 → 主任委員令第 388 號令
function orderLabelOf(ev) {
  if (ev.ref_no) return '主任委員熙字第 ' + ev.ref_no + ' 號令';
  if (ev.order_no) return ev.order_no + '令';
  return '';
}
// atomic 事件 → 沿革一行字：
//   制定：熙明 13 年 09 月 16 日主任委員令第 379 號令制定公布全文 11 條
//   修正（部分條文）：…主任委員熙字第 01300136520 號令修正公布第 3、5、9、10 條條文
//   修正（全文）：…號令修正公布全文 11 條
function atomicEventText(ev) {
  var head = eraDateNum(ev.publish_date || ev.effective_date || '') + orderLabelOf(ev);
  var keys = ev.keys || [];
  var n = ev.article_count;
  if (ev.verb === '制定') return head + '制定公布' + (n ? '全文 ' + n + ' 條' : '');
  if (ev.verb === '修正' || ev.verb === '增訂' || ev.verb === '刪除') {
    if (keys.length) return head + keysPhrase(keys);
    return head + ev.verb + '公布' + (n ? '全文 ' + n + ' 條' : '');
  }
  if (ev.verb === '廢止') return head + '廢止' + (ev.summary ? '（' + ev.summary + '）' : '');
  if (ev.summary) return head + (ev.verb ? ev.verb + '：' : '') + ev.summary;
  return head + (ev.verb || '');
}

// 命令序號：從「主任委員令第 388 號」取出 388；無令號者回 0（排序時置末）
function commandNoOf(ev) {
  if (ev.command_no != null && ev.command_no !== '') return Number(ev.command_no) || 0;
  var m = /第\s*(\d+)\s*號/.exec(String(ev.order_no || ''));
  return m ? parseInt(m[1], 10) : 0;
}

// atomic 事件 → 全國法規資料庫沿革樣式（中文 MingLiU、數字藍色）
// 次序：命令序號由大到小（新的靠前）；同號或缺號時再比日期（新→舊）。
// 令號才是命令先後的權威依據——本庫多有「同日多道令」，單靠日期會並列而次序不定。
function renderAtomicTimeline(events) {
  var sorted = events.slice().sort(function(a, b) {
    var na = commandNoOf(a), nb = commandNoOf(b);
    if (na !== nb) return nb - na;
    var da = a.effective_date || a.publish_date || '';
    var db = b.effective_date || b.publish_date || '';
    return da < db ? 1 : da > db ? -1 : 0;
  });
  var html = '<div class="law-history-block"><div class="law-history-content" style="display:block">';
  sorted.forEach(function(ev) {
    var date = ev.effective_date || ev.publish_date || '';
    var label = eraDateNum(date) + (ev.order_no ? ' ' + ev.order_no : '') + ' ' + (ev.verb || '修正');
    html += '<div class="law-history-entry">' +
            '<button type="button" class="law-history-jump" data-date="' + escHtml(date) + '" data-label="' + escHtml(label) + '">' +
            mingliuHtml(atomicEventText(ev)) +
            '</button></div>';
  });
  html += '</div></div>';
  return html;
}

// Vault 正文「立法沿革」行 → 統一「立法沿革」樣式（沿用 renderHistoryBlock 的分組邏輯，但條文連結可跳轉）
function renderVaultTimeline(historyLines) {
  if (!historyLines || historyLines.length === 0) {
    return '<div class="fw-empty"><p>此法規暫無立法沿革紀錄</p></div>';
  }

  var entries = [];
  var currentEntry = null;
  function indentOf(s) { var m = s.match(/^(\t*)/); return m ? m[1].length : 0; }
  function isEntryStart(line) {
    var t = line.trim().replace(/^\d+[\.、]\s*/, '');
    return /^熙明\s*[\d零一二三四五六七八九十百]+\s*年/.test(t)
        || /^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(line.trim());
  }
  var currentIndent = -1;
  for (var i = 0; i < historyLines.length; i++) {
    var line = historyLines[i];
    var trimmed = line.trim();
    if (trimmed === '' || /^立法沿革/.test(trimmed)) continue;
    if (isEntryStart(line)) {
      var ind = indentOf(line);
      if (currentEntry && ind > currentIndent) {
        currentEntry.details.push(trimmed);
      } else {
        if (currentEntry) entries.push(currentEntry);
        currentEntry = { summary: trimmed, details: [] };
        currentIndent = ind;
      }
    } else {
      if (currentEntry) currentEntry.details.push(trimmed);
    }
  }
  if (currentEntry) entries.push(currentEntry);

  var html = '<div class="law-history-block"><div class="law-history-content" style="display:block">';
  entries.forEach(function(entry) {
    var renderedSummary = wrapNumsOutsideTags(renderHistoryInline(entry.summary)); // 條文連結跳轉現行版
    var renderedDetails = entry.details.map(function(d) {
      return '<div class="law-history-detail">' + wrapNumsOutsideTags(renderHistoryInline(d)) + '</div>';
    }).join('');
    html += '<div class="law-history-entry">' + renderedSummary + renderedDetails + '</div>';
  });
  html += '</div></div>';
  return html;
}

function renderAtomicArticles(articles) {
  var md = articles.map(function(a) {
    var head = '##### 第' + (a.display_no || a.stable_key || '') + '條' + (a.title ? '　' + a.title : '');
    return head + '\n\n' + String(a.content || '').trim();
  }).join('\n\n');
  return parseLawContent(md, {});
}

async function viewAtomicVersion(date, label) {
  if (!_atomicView.lawId || !date) return;
  var contentEl = document.getElementById('law-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="loading-state">載入該版本條文中...</div>';
  try {
    var res = await fetch('/api/atomic/laws/' + encodeURIComponent(_atomicView.lawId) +
                          '/content?date=' + encodeURIComponent(date));
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || '載入失敗');
    contentEl.innerHTML = renderAtomicArticles(data.articles);
    var bar = document.getElementById('version-view-bar');
    var lab = document.getElementById('viewing-version-label');
    if (lab) lab.textContent = '正在瀏覽：' + label + ' 版本（' + data.article_count + ' 條）';
    if (bar) bar.style.display = 'flex';
    switchTab('content');
    window.scrollTo(0, 0);
  } catch (e) {
    contentEl.innerHTML = '<div style="color:#dc3545;padding:1rem">' + escHtml(e.message) + '</div>';
  }
}

function backToCurrentVersion() {
  var contentEl = document.getElementById('law-content');
  var bar = document.getElementById('version-view-bar');
  if (contentEl && _atomicView.originalHtml != null) contentEl.innerHTML = _atomicView.originalHtml;
  if (bar) bar.style.display = 'none';
}

function backToHistoryTimeline() {
  switchTab('history');
}

// 事件委派：atomic 沿革條目點擊（切版）+ 版本瀏覽按鈕
document.addEventListener('click', function(ev) {
  var row = ev.target.closest ? ev.target.closest('.law-history-jump') : null;
  if (row) { viewAtomicVersion(row.dataset.date, row.dataset.label); return; }
  if (ev.target.id === 'btn-back-current') backToCurrentVersion();
  if (ev.target.id === 'btn-back-timeline') backToHistoryTimeline();
});

// ==================== 修正條文同步（來源：File 文書庫） ====================
// GET /api/amend          查詢同步狀態（含各修正文件之動作／狀態）
// GET /api/amend-preview  預覽某修正文件套用後之變動條文
// POST /api/amend?law=&file=X  套用單一修正文件（產生新版本並同步 current）
// POST /api/amend?law=         一次套用全部待處理文件

var _amendInited = false;

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function jsSafe(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// 目前這部法規在 LawCurrent 的目標型態（'flat' / 'folder-manual' = 手寫，同步時會先歸檔）
var _amendTarget = null;

// 手寫目標的補充說明：同步會先整份移入退場檔（保留備份），不是刪除
function amendArchiveHint() {
  var tk = _amendTarget && _amendTarget.kind;
  if (tk !== 'flat' && tk !== 'folder-manual') return '';
  return '\n\n注意：LawCurrent 目前放的是手寫檔（' + _amendTarget.rel + '），\n同步時會先整份移入 LawCurrent_退場檔/遷移備份_<時間>/ 保留，再建立派生資料夾。';
}

async function initAmendTab() {
  var lawId = new URLSearchParams(location.search).get('lawId');
  var targets = ['amend-sync-summary', 'amend-sync-actions', 'amend-sync-table', 'amend-preview'];
  targets.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  var section = document.getElementById('amend-preview-section');
  if (section) section.style.display = 'none';
  var summary = document.getElementById('amend-sync-summary');
  var table = document.getElementById('amend-sync-table');
  if (summary) summary.innerHTML = '<div class="loading-state">載入同步資訊...</div>';
  try {
    var res = await fetch('/api/amend?law=' + encodeURIComponent(lawId));
    var data = await res.json();
    if (!data.ok) {
      if (summary) summary.innerHTML = '<div class="error-msg">' + escHtml(data.error) + '</div>';
      return;
    }
    renderAmendStatus(data);
  } catch (e) {
    if (summary) summary.innerHTML = '<div class="error-msg">' + escHtml(e.message) + '</div>';
  }
}

function renderAmendStatus(data) {
  var summary = document.getElementById('amend-sync-summary');
  var actions = document.getElementById('amend-sync-actions');
  var table = document.getElementById('amend-sync-table');
  var files = data.files || [];
  var pending = files.filter(function (f) { return !f.applied && !f.blocked; });
  var blockedCount = files.filter(function (f) { return f.blocked; }).length;
  _amendTarget = data.target || null;

  if (summary) {
    var warn = '';
    var tk = data.target && data.target.kind;
    if (tk === 'flat' || tk === 'folder-manual') {
      // 手寫目標不再擋同步：後端會整份移入退場檔保留，再建立派生資料夾
      warn = '<div class="amend-warn">LawCurrent 中的目標 <b>' + escHtml(data.target.rel) + '</b> 是手寫內容（' +
        escHtml(data.target.note || '非派生') + '）。同步時會先整份移入 <b>LawCurrent_退場檔/遷移備份_&lt;時間&gt;/</b> 保留，再建立派生資料夾，不會刪除任何內容。</div>';
    }
    if (files.length === 0) {
      summary.innerHTML = warn + '<div class="fw-empty"><p>File 文書庫中暫無此法規的命令文書。</p></div>';
    } else {
      summary.innerHTML = warn +
        '<div class="amend-status-info">' +
          '<span>來源：<b>' + escHtml(data.source || 'File 文書庫') + '</b></span>' +
          '<span>現行版本：<b>' + escHtml(data.current_version) + '</b></span>' +
          '<span>下一版本：<b>' + escHtml(data.next_version) + '</b></span>' +
          '<span>待同步：<b>' + pending.length + '</b> / ' + files.length + '</span>' +
          (blockedCount ? '<span>缺全文：<b>' + blockedCount + '</b></span>' : '') +
        '</div>';
    }
  }

  if (actions) {
    if (pending.length > 0) {
      actions.innerHTML = '<button class="filter-btn" type="button" onclick="syncAllAmendments(this)">同步全部待處理（' + pending.length + '）</button>';
    } else if (blockedCount > 0) {
      actions.innerHTML = '<span class="amend-act-muted">有 ' + blockedCount + ' 道命令因 File 缺條文全文而無法同步（見下表「狀態」）</span>';
    } else {
      actions.innerHTML = '<span class="amend-all-done">File 中的命令皆已納入派生版本</span>';
    }
  }

  if (table) {
    if (files.length === 0) { table.innerHTML = ''; return; }
    table.innerHTML =
      '<table class="amend-table">' +
      '<colgroup>' +
        '<col style="width:26%"><col style="width:13%"><col style="width:26%">' +
        '<col style="width:8%"><col style="width:12%"><col style="width:15%">' +
      '</colgroup>' +
      '<thead><tr>' +
      '<th>版本（命令文書）</th><th>日期</th><th>動作</th><th>條文數</th><th>狀態</th><th>操作</th>' +
      '</tr></thead><tbody>' + files.map(renderAmendRow).join('') + '</tbody></table>';
  }
}

function renderAmendRow(f) {
  var date = f.date ? escHtml(f.date) : '<span class="amend-act-muted">—</span>';
  var cmd = f.command_no
    ? '主任委員令 第' + escHtml(f.command_no) + '號' + (f.verb ? '（' + escHtml(f.verb) + '）' : '')
    : (f.verb ? escHtml(f.verb) : '');
  var verInfo = f.version
    ? '<div class="amend-muted">→ 派生版本 ' + escHtml(f.version) + '</div>'
    : '';
  var actionsHtml = (f.actions && f.actions.length)
    ? f.actions.map(function (a) {
        return '<div class="amend-act"><b>' + escHtml(a.verb) + '</b> ' +
          (a.keys && a.keys.length ? a.keys.map(escHtml).join('、') : '（依條文區塊）') + '</div>';
      }).join('')
    : '<span class="amend-act-muted">依條文區塊推斷</span>';
  var statusHtml = f.applied
    ? '<span class="badge b-applied">已同步</span>'
    : (f.blocked
        ? '<span class="badge b-blocked">無法同步</span>' + (f.reason ? '<div class="amend-muted">' + escHtml(f.reason) + '</div>' : '')
        : '<span class="badge b-pending">待同步</span>' + (f.reason ? '<div class="amend-muted">' + escHtml(f.reason) + '</div>' : ''));
  // 每一版都帶「同步」：改了哪個版本的源文檔（File 命令文書）就點哪一行；
  // 已納入的版本顯示「重新同步」（藍），待同步的顯示「同步」（綠）；
  // blocked（File 只有宣告、缺條文全文）不給可點的同步，避免必然失敗的請求。
  var ops = f.blocked
    ? '<button class="filter-btn" type="button" disabled title="無法派生，無內容可預覽">預覽</button>'
      + ' <button class="filter-btn" type="button" disabled title="File 缺條文全文，重放必然 0 條">同步</button>'
    : '<button class="filter-btn" type="button" onclick="previewAmendFile(\'' + jsSafe(f.file) + '\')">預覽</button>'
      + ' <button class="' + (f.applied ? 'filter-btn' : 'amend-btn') + '" type="button" '
      + 'onclick="syncAmendFile(\'' + jsSafe(f.file) + '\', this)">' + (f.applied ? '重新同步' : '同步') + '</button>';
  return '<tr>' +
    '<td><div class="amend-file">' + escHtml(f.file) + '</div>' + (cmd ? '<div class="amend-muted">' + cmd + '</div>' : '') + verInfo + '</td>' +
    '<td>' + date + '</td>' +
    '<td class="amend-acts">' + actionsHtml + '</td>' +
    '<td class="c-count">' + f.article_count + '</td>' +
    '<td>' + statusHtml + '</td>' +
    '<td class="amend-cell-ops">' + ops + '</td>' +
    '</tr>';
}

// 預覽儲存格：首行若為「##### 第N條…」則去記號後以條文標題呈現，其餘保留原始換行與縮排
function renderPreviewCell(text, emptyText) {
  var s = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!s.trim()) return '<span class="amend-act-muted">' + escHtml(emptyText || '（無內容）') + '</span>';
  var lines = s.split('\n');
  var head = '';
  if (/^#{1,6}\s+/.test(lines[0])) {
    head = '<span class="pcell-head">' + escHtml(lines[0].replace(/^#{1,6}\s+/, '')) + '</span>';
    lines.shift();
  }
  var body = lines.join('\n').replace(/^\n+/, '');
  return head + (body.trim() ? escHtml(body) : '');
}

async function previewAmendFile(file) {
  var lawId = new URLSearchParams(location.search).get('lawId');
  var section = document.getElementById('amend-preview-section');
  var title = document.getElementById('amend-preview-title');
  var box = document.getElementById('amend-preview');
  if (!box) return;
  if (section) section.style.display = '';
  if (title) title.textContent = '同步預覽 · ' + file;
  box.innerHTML = '<div class="loading-state">計算修正內容...</div>';
  try {
    var res = await fetch('/api/amend-preview?law=' + encodeURIComponent(lawId) + '&file=' + encodeURIComponent(file));
    var data = await res.json();
    if (!data.ok) { box.innerHTML = '<div class="error-msg">' + escHtml(data.error) + '</div>'; return; }
    var srcVer = data.source_version || '';
    var tgtVer = data.target_version || '';
    // 舊版 API 未回傳版本資訊時，退回通用標題（重啟 server.js 後即顯示 vN）
    var srcLabel = srcVer ? srcVer + '.md' : '現行版本';
    var tgtLabel = tgtVer ? tgtVer + '.md' : '同步後版本';
    var stats = data.stats || {};
    var statHtml = ['修正', '增訂', '刪除'].filter(function (k) { return stats[k]; })
      .map(function (k) { return '<span class="amend-act"><b>' + k + '</b> ' + stats[k] + ' 條</span>'; }).join('');
    var rows = (data.changed || []).map(function (c) {
      var st = c.status === '刪除' ? 'st-del' : (c.status === '增訂' ? 'st-add' : 'st-mod');
      return '<tr>' +
        '<td class="pkey">' + escHtml(c.key) +
          '<div><span class="pkey-badge ' + st + '">' + escHtml(c.status) + '</span></div></td>' +
        '<td class="pcell">' + renderPreviewCell(c.before, c.status === '增訂' ? '（新增條文，無前文）' : '（無內容）') + '</td>' +
        '<td class="pcell">' + renderPreviewCell(c.after, c.status === '刪除' ? '（本條刪除）' : '（無內容）') + '</td>' +
        '</tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="3" class="amend-act-muted">現行內容與此修正一致，無變動條文。</td></tr>';
    box.innerHTML =
      '<div class="preview-meta">' +
        '<span>修正前：<b>' + escHtml(srcLabel) + '</b>' + (srcVer ? '（現行）' : '') + '</span>' +
        '<span>修正後：<b>' + escHtml(tgtLabel) + '</b>' + (tgtVer ? '（同步後產生）' : '') + '</span>' +
        '<span class="preview-meta-acts">' + statHtml + '</span>' +
      '</div>' +
      '<table class="amend-preview-table">' +
        '<colgroup><col class="c-key"><col><col></colgroup>' +
        '<thead><tr>' +
          '<th>條號</th>' +
          '<th>修正前（' + escHtml(srcLabel) + '）</th>' +
          '<th>修正後（' + escHtml(tgtLabel) + '）</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  } catch (e) {
    box.innerHTML = '<div class="error-msg">' + escHtml(e.message) + '</div>';
  }
}

// 同步結果 → 可讀文字（含各步驟成敗與失敗輸出）
function fmtSyncResult(data) {
  var lines = [];
  if (data.message) lines.push(data.message);
  if (data.current_version) lines.push('現行版本：' + data.current_version);
  (data.steps || []).forEach(function (s) { lines.push((s.ok ? '[成功] ' : '[失敗] ') + s.label); });
  (data.steps || []).filter(function (s) { return !s.ok; }).forEach(function (s) {
    lines.push('—— ' + s.label + ' 輸出 ——');
    lines.push(String(s.output || '').slice(-1200));
  });
  return lines.join('\n');
}

async function postSyncAmend(url) {
  try {
    var res = await fetch(url, { method: 'POST' });
    var data = await res.json();
    alert((data.ok ? '同步完成\n\n' : '同步失敗\n\n') + (data.error || fmtSyncResult(data)));
    await refreshAfterAmend();
  } catch (e) {
    alert('同步失敗：' + e.message);
  }
}

// 同步單一版本（命令文書）：POST /api/amend?law=X&file=Y
// 後端仍跑完整同步流水線（derive → export-vault --update → rebuild-atomic），file 用於
// 校驗該命令存在於 File；重放冪等，已納入的版本再同步一次結果不變。
// btn＝該行的「同步／重新同步」按鈕，同步期間禁用並顯示「同步中…」防重複點擊。
async function syncAmendFile(file, btn) {
  var lawId = new URLSearchParams(location.search).get('lawId');
  if (!confirm('確認同步「' + file + '」（對應版本）？\n將以 File 文書庫為來源重放命令，更新 derived\\、LawCurrent\\（--update 僅覆蓋派生資料夾）與 atomic\\。' + amendArchiveHint())) return;
  var oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
  try {
    await postSyncAmend('/api/amend?law=' + encodeURIComponent(lawId) + '&file=' + encodeURIComponent(file));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

async function syncAllAmendments(btn) {
  var lawId = new URLSearchParams(location.search).get('lawId');
  if (!confirm('確認同步全部待處理命令？\n將以 File 文書庫為來源重放命令，更新 derived\\、LawCurrent\\（--update 僅覆蓋派生資料夾）與 atomic\\。' + amendArchiveHint())) return;
  var oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
  try {
    await postSyncAmend('/api/amend?law=' + encodeURIComponent(lawId));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

async function refreshAfterAmend() {
  _amendmentInited = false;
  _compareToolInited = false;
  _amendInited = false;
  window.lawData = null;
  var lawId = new URLSearchParams(location.search).get('lawId');
  var tab = document.body.getAttribute('data-tab');
  await initDetailPage();
  await initAmendTab();
  // 同步可能產生新版本：若當前停在依賴版本數據的分頁，順手重繪，避免要手動切走再切回
  if (tab === 'amendment' || tab === 'comparetool') {
    try { await window.LawCompare.init(lawId); } catch (e) {}
  }
  if (tab === 'amendment') { _amendmentInited = true; await initAmendmentView(); }
  else if (tab === 'comparetool') { _compareToolInited = true; initCompareTool(); }
}
// ==================== 詳情頁標籤切換 ====================

var _amendmentInited = false;
var _compareToolInited = false;

function switchTab(tab) {
  document.querySelectorAll('.tab-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-view').forEach(function(v) {
    v.style.display = (v.id === 'view-' + tab) ? '' : 'none';
  });
  document.body.setAttribute('data-tab', tab);

  if (tab === 'amendment' && !_amendmentInited) {
    _amendmentInited = true;
    initAmendmentView();
  }
  if (tab === 'amend' && !_amendInited) {
    _amendInited = true;
    initAmendTab();
  }
  if (tab === 'sublaws') {
    renderSublaws();
  }
  if (tab === 'comparetool' && !_compareToolInited) {
    _compareToolInited = true;
    initCompareTool();
  }
}

// ==================== 異動條文視圖（頁內版本對比） ====================

async function initAmendmentView() {
  var params = new URLSearchParams(location.search);
  var lawId = params.get('lawId');

  try {
    await window.LawCompare.init(lawId);
    renderAmendmentSidebar();
    await window.LawCompare.renderCompareContent(document.getElementById('compare-content'));
    var btn = document.getElementById('toggleModifiedOnly');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() { window.LawCompare.toggleShowModifiedOnly(); });
    }
  } catch (e) {
    var sb = document.getElementById('version-sidebar');
    if (sb) sb.innerHTML = '<div class="error-msg">' + e.message + '</div>';
    var cc = document.getElementById('compare-content');
    if (cc) cc.innerHTML = '<div class="error-msg">' + e.message + '</div>';
  }
}

function renderAmendmentSidebar() {
  var el = document.getElementById('version-sidebar');
  if (!el) return;
  var versions = window.LawCompare.getAllVersions();
  if (versions.length === 0) { el.innerHTML = '<div class="empty-msg">無版本數據</div>'; return; }
  var active = window.LawCompare.getSelectedTargetVersion();
  el.innerHTML = versions.slice().reverse().map(function(v) {
    return '<div class="version-item' + (v.version === active ? ' active' : '') + '" data-version="' + v.version + '">' + v.displayDate + '</div>';
  }).join('');
  el.querySelectorAll('.version-item').forEach(function(item) {
    item.addEventListener('click', function() {
      el.querySelectorAll('.version-item').forEach(function(x) { x.classList.remove('active'); });
      item.classList.add('active');
      window.LawCompare.switchVersion(item.dataset.version);
      window.LawCompare.renderCompareContent(document.getElementById('compare-content'));
    });
  });
}

// ==================== 子法列表視圖 ====================

function findSublaws(lawId) {
  var data = window.lawData;
  if (!data) return [];
  var all = [];
  data.laws.categories.forEach(function(c) {
    (c.laws || []).forEach(function(l) { all.push({ law: l, catName: c.name }); });
  });
  var self = all.find(function(x) { return x.law.id === lawId; });
  if (!self) return [];
  return all.filter(function(x) {
    return x.law.id !== lawId && x.law.title.indexOf(self.law.title) !== -1;
  });
}

function renderSublaws() {
  var container = document.getElementById('sublaw-list');
  if (!container) return;
  var params = new URLSearchParams(location.search);
  var lawId = params.get('lawId');
  var subs = findSublaws(lawId);

  if (subs.length === 0) {
    container.innerHTML = '<div class="fw-empty"><p>此法規暫無子法</p></div>';
    return;
  }

  container.innerHTML = '';
  subs.forEach(function(item) {
    var card = document.createElement('article');
    card.className = 'fw-card fw-post-card';
    var ver = null;
    var vs = item.law.versions || [];
    for (var i = 0; i < vs.length; i++) { if (vs[i].isCurrent) { ver = vs[i]; break; } }
    if (!ver) ver = vs[vs.length - 1];
    var verDate = (typeof window.lawLatestDate === 'function')
      ? window.lawLatestDate(item.law)
      : String((ver && ver.date) || item.law.modified || '');
    card.innerHTML = `
      <h2 class="fw-post-title">${item.law.title}</h2>
      <div class="fw-post-meta">
        <span class="meta-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <span>${verDate ? verDate : ''}</span>
        <span class="with-divider fw-badge cat">${item.catName}</span>
        ${item.law.abolished ? '<span class="fw-badge abolished">已廢止</span>' : ''}
      </div>
      <div class="fw-post-desc">${item.law.alias || '閱讀更多關於「' + item.law.title + '」的內容'}</div>
      <a href="detail.html?lawId=${encodeURIComponent(item.law.id)}" class="fw-read-more">閱讀全文 →</a>
    `;
    container.appendChild(card);
  });
}

// ==================== 條文比較工具視圖 ====================

function initCompareTool() {
  var selA = document.getElementById('tool-version-a');
  var selB = document.getElementById('tool-version-b');
  if (!selA || !selB) return;

  var versions = window.LawCompare.getAllVersions();
  if (versions.length < 2) {
    var wrap = document.getElementById('tool-controls');
    if (wrap) wrap.innerHTML = '<div class="fw-empty"><p>此法規目前僅有 ' + versions.length + ' 個版本，暫無法進行跨版本比較</p></div>';
    return;
  }

  var options = versions.map(function(v) {
    return '<option value="' + v.version + '">' + v.displayDate + '</option>';
  }).join('');
  selA.innerHTML = options;
  selB.innerHTML = options;
  selA.value = versions[versions.length - 2].version;
  selB.value = versions[versions.length - 1].version;

  function run() {
    window.LawCompare.selectedPrevVersion = selA.value;
    window.LawCompare.selectedTargetVersion = selB.value;
    window.LawCompare.showModifiedOnly = false;
    window.LawCompare.renderCompareContent(document.getElementById('tool-compare-content'));
  }

  if (!selA.dataset.bound) { selA.dataset.bound = '1'; selA.addEventListener('change', run); }
  if (!selB.dataset.bound) { selB.dataset.bound = '1'; selB.addEventListener('change', run); }
  run();
}

async function initOrderDetailPage() {
  await loadData();

  var params = new URLSearchParams(location.search);
  var orderId = params.get('orderId');

  if (!orderId) {
    document.body.innerHTML = '<h1 style="text-align:center;padding:2rem">參數錯誤：缺少命令ID</h1>';
    return;
  }

  var order = findOrder(orderId);
  if (!order) {
    document.body.innerHTML = '<h1 style="text-align:center;padding:2rem">未找到該命令</h1>';
    return;
  }

  try {
    var res = await fetch('/api/content/' + encodeURIComponent(orderId));
    if (!res.ok) throw new Error('無法加載版本內容');
    var content = await res.text();

    var notes = {};
    try {
      var notesRes = await fetch('/api/notes/' + encodeURIComponent(orderId));
      if (notesRes.ok) notes = parseNotes(await notesRes.text());
    } catch (e) {}

    var titleEl = document.getElementById('order-title');
    if (titleEl) titleEl.textContent = order.title;
    var contentEl = document.getElementById('order-content');
    if (contentEl) contentEl.innerHTML = parseLawContent(content, notes);

    var breadcrumb = document.getElementById('order-name-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = order.title;
    var titleTop = document.getElementById('order-title-top');
    if (titleTop) titleTop.textContent = order.title;
    var aliasEl = document.getElementById('order-alias');
    if (aliasEl) aliasEl.textContent = order.alias || '無';

    var ver = null;
    var ovs = order.versions || [];
    for (var j = 0; j < ovs.length; j++) { if (ovs[j].isCurrent) { ver = ovs[j]; break; } }
    if (!ver) ver = ovs[ovs.length - 1];
    if (ver) {
      var parts = ver.date.split('-');
      var dateEl = document.getElementById('amend-date');
      if (dateEl) dateEl.textContent = parts[0] + ' 年 ' + parts[1] + ' 月 ' + parts[2] + ' 日 修正';
    }
  } catch (e) {
    var contentEl = document.getElementById('order-content');
    if (contentEl) contentEl.innerHTML = '<div style="color:#dc3545;padding:2rem"><h3>加載失敗</h3><p>' + e.message + '</p></div>';
  }
}
