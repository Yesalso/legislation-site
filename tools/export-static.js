#!/usr/bin/env node
/**
 * export-static.js —— 生成可直接部署的静态站点（site/）
 *
 * 为什么要在仓库里另做一层导出，而不是把仓库直接丢给 Vercel / Pages：
 *   前端的全部数据都来自 server.js 的 /api/*，这些接口运行时读取仓库之外的
 *   Windows 绝对路径（AMEND_VAULT / AMEND_DOCS / TW_VAULT_DIR）。云上没有这些目录，
 *   所以数据必须提前固化——由 tools/export-snapshot.js 在本机生成 static-data/，
 *   再由本工具把快照与页面拼成一个纯静态站点。
 *
 * 两种模式：
 *   --data=<dir>  使用真实数据快照（static-data/，empty:false）。
 *                 快照含 snapshot.json 索引 + text/ 正文分片 + atomic/ + amend/ 分区文件，
 *                 由 js/static-api.js 在浏览器端接管 /api/*，按需懒加载。
 *   不带 --data   生成「结构合法但为空」的快照（界面展示版），页面不 404 但无内容。
 *
 * 产物：
 *   site/*.html          11 个页面（排除 test.html 调试页），<head> 后注入拦截器
 *   site/css  site/js    原样复制
 *   site/api/*           数据快照（真实或空）
 *   site/.nojekyll      防止 Jekyll 忽略下划线文件 / 解析 {{ }}
 *
 * 用法：node tools/export-static.js [--out=<dir>] [--data=static-data]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argOut = process.argv.slice(2).find((a) => a.startsWith('--out='));
const SITE = argOut ? path.resolve(ROOT, argOut.slice('--out='.length)) : path.join(ROOT, 'site');
const argData = process.argv.slice(2).find((a) => a.startsWith('--data='));
const DATA = argData ? path.resolve(ROOT, argData.slice('--data='.length)) : null;

// 对外发布的页面（test.html 是调试页，不发布）
const PAGES = [
  'index', 'detail', 'archive', 'drafts', 'orders', 'meetings',
  'regulations', 'tw', 'draft_detail', 'order_detail', 'amendment'
].map((n) => n + '.html');

// 字體預載：手機端無本機 MingLiu，提前搶先下載，避免正文先以系統字體閃現
const FONT_PRELOAD =
  '<link rel="preload" href="css/fonts/mingliu-subset.woff2" as="font" type="font/woff2" crossorigin>';
const INJECT = FONT_PRELOAD + '\n  <script src="js/static-api.js"></script>';

/**
 * 空数据快照 —— 结构与 server.js 各函数在「数据目录不存在」时的早返回一致。
 * 对应关系见注释，改动 server.js 的返回结构时需同步这里。
 */
function buildSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    empty: true,
    note: '介面展示版：未隨站發布任何法規資料。',
    // scanVault()（server.js:460-470）
    data: {
      laws: { categories: [], tags: [] },
      orders: { categories: [] },
      meetings: { categories: [] },
      regulations: { categories: [] },
      drafts: { categories: [] }
    },
    // scanTwVault()（server.js:694 起）
    twData: { laws: { categories: [], tags: [] } },
    // buildArchive()（server.js:1161 返回裸数组）
    archive: [],
    // scanDraftVault()（server.js:216-221）
    drafts: { laws: { categories: [], types: { '法規草案': [], '命令草案': [], '一般草案': [] } } },
    atomicLaws: [],       // atomic.js listLaws() 缺 laws.json 时返回 []
    atomicDetail: {},
    atomicContent: {},
    atomicDiff: {},
    clicks: {},           // atomic/clicks.json
    text: {},             // content / notes / draft-content 的正文
    mtime: {}             // 正文的 X-Law-Modified
  };
}

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

/**
 * 把 amend/*.json 裡的 doc_dir（本機絕對路徑）清空。
 * 只處理這一層的單檔 JSON；目錄不存在或解析失敗則略過，不阻斷建置。
 */
function stripLocalPaths(dir) {
  if (!fs.existsSync(dir)) return;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const p = path.join(dir, name);
    try {
      const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (typeof obj.doc_dir === 'string' && obj.doc_dir) {
        obj.doc_dir = '';
        fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
        n++;
      }
    } catch (e) { /* 壞檔留給前端顯示缺失，不在這裡中斷 */ }
  }
  if (n) console.log(`  已脫敏 ${n} 個同步分片的本機路徑`);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    throw new Error('找不到 index.html，請在倉庫根目錄執行');
  }

  rimraf(SITE);
  fs.mkdirSync(SITE, { recursive: true });

  // ---------- 1. 页面：复制 + 注入拦截器 ----------
  let injected = 0;
  for (const file of PAGES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) throw new Error(`缺少頁面：${file}`);

    let html = fs.readFileSync(src, 'utf8');
    const heads = (html.match(/<head[^>]*>/gi) || []).length;
    if (heads !== 1) {
      // 宁可失败，也不要静默产出一个没有拦截器的站点（会满屏 404）
      throw new Error(`${file}：<head> 定位失敗（命中 ${heads} 次），無法注入 static-api.js`);
    }
    if (html.includes('static-api.js')) {
      throw new Error(`${file}：已包含 static-api.js 引用，請確認是否重複注入了注入邏輯`);
    }
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  ${INJECT}`);
    fs.writeFileSync(path.join(SITE, file), html, 'utf8');
    injected++;
  }

  // ---------- 2. 静态资源 ----------
  copyDir(path.join(ROOT, 'css'), path.join(SITE, 'css'));
  copyDir(path.join(ROOT, 'js'), path.join(SITE, 'js'));

  // ---------- 3. 数据快照 ----------
  const apiDir = path.join(SITE, 'api');
  fs.mkdirSync(apiDir, { recursive: true });

  let snapshot;
  if (DATA) {
    const src = path.join(DATA, 'snapshot.json');
    if (!fs.existsSync(src)) {
      throw new Error(`找不到資料快照：${path.relative(ROOT, src)}（請先執行 node tools/export-snapshot.js）`);
    }
    snapshot = JSON.parse(fs.readFileSync(src, 'utf8'));
    if (snapshot.empty !== false) {
      throw new Error('快照標記為 empty，--data 應指向 tools/export-snapshot.js 產生的真實快照');
    }
    // 分片目錄（text / atomic / amend）整批複製；缺一個就等於線上大半頁面取不到內容
    for (const sub of ['text', 'atomic', 'amend']) {
      const from = path.join(DATA, sub);
      if (!fs.existsSync(from)) throw new Error(`快照缺少 ${sub}/ 目錄`);
      fs.cpSync(from, path.join(apiDir, sub), { recursive: true });
    }
    // 脫敏：amend/*.json 帶著本機文書庫的絕對路徑（server.js 的 doc_dir），
    // 公開站不該暴露開發機的目錄結構。逐檔改寫，只動這一個欄位。
    stripLocalPaths(path.join(apiDir, 'amend'));
    fs.writeFileSync(path.join(apiDir, 'snapshot.json'), JSON.stringify(snapshot), 'utf8');
  } else {
    snapshot = buildSnapshot();
    fs.writeFileSync(
      path.join(apiDir, 'snapshot.json'),
      JSON.stringify(snapshot, null, 2) + '\n',
      'utf8'
    );
  }

  // ---------- 4. 防 Jekyll ----------
  fs.writeFileSync(path.join(SITE, '.nojekyll'), '', 'utf8');

  // ---------- 5. 自检 ----------
  if (!fs.existsSync(path.join(SITE, 'js', 'static-api.js'))) {
    throw new Error('site/js/static-api.js 缺失，前端會取不到任何資料');
  }
  if (!fs.existsSync(path.join(apiDir, 'snapshot.json'))) {
    throw new Error('site/api/snapshot.json 缺失');
  }
  if (DATA) {
    // 快照索引引用的分片必須真的存在，否則線上才會 404（建置時就該擋下）
    const missing = [];
    for (const ref of Object.values(snapshot.text || {})) {
      if (!fs.existsSync(path.join(apiDir, ref))) missing.push(ref);
      if (missing.length > 5) break;
    }
    for (const ref of Object.values(snapshot.atomicIndex || {})) {
      if (!fs.existsSync(path.join(apiDir, ref))) missing.push(ref);
      if (missing.length > 5) break;
    }
    if (missing.length) throw new Error('快照索引指向不存在的分片：' + missing.join('、'));
  }

  const rel = path.relative(ROOT, SITE) || '.';
  console.log(`✓ 已生成 ${rel}/`);
  console.log(`  頁面 ${injected} 個（已注入 static-api.js）`);
  if (DATA) {
    const c = snapshot.counts || {};
    console.log(`  資料快照：法規 ${c.laws || 0} 部｜台灣法規 ${c.twLaws || 0} 部｜草案 ${c.drafts || 0} 份｜歷程 ${c.archive || 0} 條`);
    console.log(`  正文分片 ${Object.keys(snapshot.text || {}).length} 項｜原子層 ${Object.keys(snapshot.atomicIndex || {}).length} 部`);
  } else {
    console.log(`  快照 api/snapshot.json（empty: ${snapshot.empty}）`);
  }
  console.log(`  輸出目錄即部署根目錄：${rel}/`);
}

try {
  main();
} catch (err) {
  console.error('✗ 導出失敗：' + err.message);
  process.exit(1);
}
