window.LawCompare = {
  lawId: '',
  lawTitle: '',
  allVersions: [],
  selectedTargetVersion: '',
  selectedPrevVersion: '',
  showModifiedOnly: false,

  async init(lawId) {
    this.lawId = lawId;
    await this.loadLawConfig();
    this.setDefaultVersion();
    return this;
  },

  async loadLawConfig() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('數據加載失敗');
    const data = await res.json();
    window.lawData = data;
    
    const allLaws = data.laws.categories.flatMap(c => c.laws);
    const law = allLaws.find(l => l.id === this.lawId);
    if (!law) throw new Error('未找到對應法規');
    this.lawTitle = law.title;
    this.allVersions = law.versions.map(v => ({
      ...v,
      displayDate: this.formatDate(v.date) + ' 修正'
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  setDefaultVersion() {
    const len = this.allVersions.length;
    if (len >= 2) {
      this.selectedTargetVersion = this.allVersions[len - 1].version;
      this.selectedPrevVersion = this.allVersions[len - 2].version;
    } else if (len === 1) {
      this.selectedTargetVersion = this.allVersions[0].version;
      this.selectedPrevVersion = this.allVersions[0].version;
    }
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${(d.getMonth()+1).toString().padStart(2,'0')}月${d.getDate().toString().padStart(2,'0')}日`;
  },

  switchVersion(targetVersion) {
    this.selectedTargetVersion = targetVersion;
    const idx = this.allVersions.findIndex(v => v.version === targetVersion);
    this.selectedPrevVersion = idx === 0 ? targetVersion : this.allVersions[idx - 1].version;
    this.showModifiedOnly = false;
    const btn = document.getElementById('toggleModifiedOnly');
    if (btn) { btn.textContent = '僅展示修正條文'; btn.style.background = '#0066cc'; }
  },

  async getTxtContent(version) {
    try {
      const res = await fetch(`/api/content/${this.lawId}/${version}`);
      return res.ok ? await res.text() : '';
    } catch (e) { return ''; }
  },

  normalizeText(str) {
    if (!str) return '';
    return str.replace(/\s+/g,'').replace(/［/g,'[').replace(/］/g,']').replace(/（/g,'(').replace(/）/g,')').replace(/，/g,',').replace(/。/g,'.').replace(/、/g,'/').toLowerCase();
  },

  splitIntoGroups(content) {
    const lines = content.split('\n').map(l => ({ raw: l, trimmed: l.trim() })).filter(l => l.trimmed);
    const groups = [];
    let curId = '', curContent = [];

    lines.forEach(line => {
      let groupId = '', matched = false;
      const bzMatch = line.raw.match(/(第[一二三四五六七八九十\d]+(編|章|節|款)(?:之[一二三四五六七八九十]+)?)\s{2}/);
      if (bzMatch) { groupId = bzMatch[1]; matched = true; }
      else {
        const tMatch = line.trimmed.match(/(第\d+條(?:之\d+)?)/);
        if (tMatch) { groupId = tMatch[1]; matched = true; }
      }
      if (matched && groupId) {
        if (curId && curContent.length > 0) groups.push({ id: curId, content: curContent.join('\n'), order: groups.length });
        curId = groupId;
        curContent = [line.raw];
      } else if (curId) {
        curContent.push(line.raw);
      }
    });
    if (curId && curContent.length > 0) groups.push({ id: curId, content: curContent.join('\n'), order: groups.length });
    return groups;
  },

  isGroupModified(prev, target) {
    if (this.selectedPrevVersion === this.selectedTargetVersion) return false;
    return this.normalizeText(prev) !== this.normalizeText(target);
  },

  toggleShowModifiedOnly() {
    this.showModifiedOnly = !this.showModifiedOnly;
    const btn = document.getElementById('toggleModifiedOnly');
    if (btn) {
      btn.textContent = this.showModifiedOnly ? '展示所有條文' : '僅展示修正條文';
      btn.style.background = this.showModifiedOnly ? '#dc3545' : '#0066cc';
    }
    this.renderCompareContent(document.getElementById('compare-content'));
    return this.showModifiedOnly;
  },

  getIndentStyle(text) {
    if (/^[一二三四五六七八九十]+、/.test(text)) return 'text-indent:2em;';
    if (/^（[一二三四五六七八九十]+）/.test(text)) return 'text-indent:2em;';
    if (/^\d+\./.test(text)) return 'text-indent:3em;';
    return '';
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  getCharDiffHtml(oldStr, newStr, type) {
    if (!oldStr && !newStr) return '';
    if (type === 'delete' && !oldStr) return '';
    if (type === 'add' && !newStr) return '';
    if (this.normalizeText(oldStr) === this.normalizeText(newStr)) return this.escapeHtml(oldStr || newStr).replace(/\n/g, '<br>');
    if (type === 'add' && !oldStr) return `<strong style="color:#28a745;font-weight:700">${this.escapeHtml(newStr).replace(/\n/g,'<br>')}</strong>`;
    if (type === 'delete' && !newStr) return `<strong style="color:#dc3545;text-decoration:line-through;font-weight:700">${this.escapeHtml(oldStr).replace(/\n/g,'<br>')}</strong>`;

    const oc = oldStr.split(''), nc = newStr.split('');
    const ol = oc.length, nl = nc.length;
    const dp = Array(ol+1).fill(0).map(() => Array(nl+1).fill(0));
    for (let i = 1; i <= ol; i++)
      for (let j = 1; j <= nl; j++)
        dp[i][j] = this.normalizeText(oc[i-1]) === this.normalizeText(nc[j-1]) ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);

    let i = ol, j = nl;
    const oldR = [], newR = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && this.normalizeText(oc[i-1]) === this.normalizeText(nc[j-1])) {
        oldR.unshift(oc[i-1]); newR.unshift(nc[j-1]); i--; j--;
      } else if (i > 0 && (j === 0 || dp[i-1][j] >= dp[i][j-1])) {
        oldR.unshift(`<strong style="color:#dc3545;text-decoration:line-through;font-weight:700">${this.escapeHtml(oc[i-1])}</strong>`);
        newR.unshift(''); i--;
      } else {
        oldR.unshift('');
        newR.unshift(`<strong style="color:#28a745;font-weight:700">${this.escapeHtml(nc[j-1])}</strong>`);
        j--;
      }
    }
    return (type === 'delete' ? oldR : newR).join('').replace(/\n/g, '<br>');
  },

  // 行類型：標題（# 開頭）或正文
  lineKind(line) {
    const m = String(line == null ? '' : line).match(/^\s*(#{1,6})\s+(.*)$/);
    if (m) return { type: 'heading', level: m[1].length, text: m[2] };
    return { type: 'text', text: String(line == null ? '' : line) };
  },

  // 與法規詳情頁相同的行容器：字體／字級／邊距皆取自詳情頁同一組樣式（mdHeadingStyle / mdParagraphStyle）
  // 標題不套用詳情頁的灰底，避免蓋住新增／刪除的差異底色
  formatLine(lineText, innerHtml, indent, highlightBg) {
    const k = this.lineKind(lineText);
    const isHeading = k.type === 'heading';
    const style = isHeading
      ? (typeof mdHeadingStyle === 'function' ? mdHeadingStyle(k.level) : "font-family:'MingLiu';font-weight:bold")
      : (typeof mdParagraphStyle === 'function' ? mdParagraphStyle() : "font-family:'MingLiu';font-size:12pt;line-height:1.8");
    const cls = isHeading ? 'md-heading md-h' + k.level : 'md-paragraph';
    let body = innerHtml || '';
    if (highlightBg) body = `<span style="background-color:${highlightBg};display:block;width:100%;${indent}">${body}</span>`;
    else if (indent) body = `<span style="${indent}">${body}</span>`;
    return `<div class="${cls}" style="${style}">${body || '&nbsp;'}</div>`;
  },

  generateHighlightedContent(prevContent, targetContent, type) {
    // 無前置版本：修正後欄位同樣以詳情頁格式渲染（不再原文照貼，避免露出 ##### 記號）
    if (this.selectedPrevVersion === this.selectedTargetVersion) {
      if (type === 'prev') return '<span style="color:#999">無前置版本</span>';
      return String(targetContent || '').split('\n').filter(l => l.trim())
        .map(l => this.formatLine(l, this.escapeHtml(this.lineKind(l).text))).join('');
    }
    if (type === 'prev' && !prevContent) return '<span style="color:#999">無此內容</span>';
    if (type === 'target' && !targetContent) return '<span style="color:#999">無此內容</span>';

    const prevLines = prevContent.split('\n');
    const targetLines = targetContent.split('\n');
    const max = Math.max(prevLines.length, targetLines.length);
    const out = [];

    for (let i = 0; i < max; i++) {
      const pl = prevLines[i] || '', tl = targetLines[i] || '';
      if (!pl.trim() && !tl.trim()) continue; // 空白行不比對、不輸出（詳情頁亦已折疊）
      const check = type === 'prev' ? pl : tl;
      const indent = this.getIndentStyle(this.lineKind(check).text.trim());
      const modified = this.normalizeText(pl) !== this.normalizeText(tl);
      const inner = modified
        ? this.getCharDiffHtml(this.lineKind(pl).text, this.lineKind(tl).text, type)
        : this.escapeHtml(this.lineKind(check).text);
      // 高亮底色跟隨主題：以語義色混入卡片底色，暗色下同樣可讀
      const bg = (modified && check.trim())
        ? (type === 'prev'
          ? 'color-mix(in oklab, var(--ctp-red) 16%, var(--bg-secondary))'
          : 'color-mix(in oklab, #22c55e 16%, var(--bg-secondary))')
        : '';
      out.push(this.formatLine(check, inner, indent, bg));
    }
    return out.join('');
  },

  mergeGroups(prev, target) {
    const ids = new Set([...prev.map(g => g.id), ...target.map(g => g.id)]);
    const merged = Array.from(ids).map(id => {
      const pg = prev.find(g => g.id === id) || { content: '', order: Infinity };
      const tg = target.find(g => g.id === id) || { content: '', order: Infinity };
      return { id, prevContent: pg.content, targetContent: tg.content, order: tg.order !== Infinity ? tg.order : pg.order };
    });
    merged.sort((a, b) => a.order - b.order);
    return merged;
  },

  async renderCompareContent(container) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#666">加載中...</div>';
    try {
      const prev = await this.getTxtContent(this.selectedPrevVersion);
      const target = await this.getTxtContent(this.selectedTargetVersion);
      const prevGroups = this.splitIntoGroups(prev);
      const targetGroups = this.splitIntoGroups(target);
      let items = this.mergeGroups(prevGroups, targetGroups);

      if (this.showModifiedOnly) {
        items = items.filter(item => this.isGroupModified(item.prevContent, item.targetContent));
        if (items.length === 0) { container.innerHTML = '<div style="text-align:center;padding:2rem;color:#666">當前版本無修正條文</div>'; return; }
      }

      const prevDate = this.getVersionDate(this.selectedPrevVersion);
      const targetDate = this.getVersionDate(this.selectedTargetVersion);
      let html = `<table class="compare-table"><thead><tr><th>${this.selectedPrevVersion === this.selectedTargetVersion ? '無前置版本' : `修正前 (${prevDate})`}</th><th>修正後 (${targetDate})</th></tr></thead><tbody>`;
      items.forEach(item => {
        html += `<tr><td class="article-cell">${this.generateHighlightedContent(item.prevContent, item.targetContent, 'prev') || ''}</td><td class="article-cell">${this.generateHighlightedContent(item.prevContent, item.targetContent, 'target') || ''}</td></tr>`;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div style="text-align:center;padding:2rem;color:#dc3545">加載失敗：${e.message}</div>`;
    }
  },

  getAllVersions() { return this.allVersions; },
  getSelectedTargetVersion() { return this.selectedTargetVersion; },
  getLawTitle() { return this.lawTitle || '法規異動條文對比'; },
  getVersionDate(v) { const ver = this.allVersions.find(x => x.version === v); return ver ? ver.displayDate.replace(' 修正', '') : ''; }
};
