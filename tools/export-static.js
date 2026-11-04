#!/usr/bin/env node
/**
 * export-static.js —— 生成可直接部署到 GitHub Pages 的静态站点（site/）
 *
 * 为什么要单独做一层导出，而不是直接把仓库丢给 Pages：
 *   前端的全部数据都来自 server.js 的 /api/*，这些接口运行时读取仓库之外的
 *   Windows 绝对路径（AMEND_VAULT / AMEND_DOCS），而 server.js:13 的
 *   TW_VAULT_DIR 是硬编码且本机真实存在的目录。因此：
 *
 *   1) 绝不启动 server.js —— 一旦启动就会把真实的台湾法规内容序列化进站点。
 *   2) 直接输出「结构合法但为空」的快照，并用 js/static-api.js 在浏览器端
 *      拦截 /api/*，让所有页面正常渲染空状态，而不是满屏 404。
 *
 * 产物：
 *   site/*.html          11 个页面（排除 test.html 调试页），<head> 后注入拦截器
 *   site/css  site/js    原样复制
 *   site/api/snapshot.json   唯一的「数据」，empty: true
 *   site/.nojekyll      防止 Jekyll 忽略下划线文件 / 解析 {{ }}
 *
 * 用法：node tools/export-static.js [--out=<dir>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argOut = process.argv.slice(2).find((a) => a.startsWith('--out='));
const SITE = argOut ? path.resolve(ROOT, argOut.slice('--out='.length)) : path.join(ROOT, 'site');

// 对外发布的页面（test.html 是调试页，不发布）
const PAGES = [
  'index', 'detail', 'archive', 'drafts', 'orders', 'meetings',
  'regulations', 'tw', 'draft_detail', 'order_detail', 'amendment'
].map((n) => n + '.html');

const INJECT = '<script src="js/static-api.js"></script>';

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

  // ---------- 3. 空快照 ----------
  const snapshot = buildSnapshot();
  fs.mkdirSync(path.join(SITE, 'api'), { recursive: true });
  fs.writeFileSync(
    path.join(SITE, 'api', 'snapshot.json'),
    JSON.stringify(snapshot, null, 2) + '\n',
    'utf8'
  );

  // ---------- 4. 防 Jekyll ----------
  fs.writeFileSync(path.join(SITE, '.nojekyll'), '', 'utf8');

  // ---------- 5. 自检 ----------
  if (!fs.existsSync(path.join(SITE, 'js', 'static-api.js'))) {
    throw new Error('site/js/static-api.js 缺失，前端會取不到任何資料');
  }
  const rel = path.relative(ROOT, SITE) || '.';
  console.log(`✓ 已生成 ${rel}/`);
  console.log(`  頁面 ${injected} 個（已注入 static-api.js）`);
  console.log(`  快照 api/snapshot.json（empty: ${snapshot.empty}）`);
  console.log(`  部署後網址形如 https://<owner>.github.io/<repo>/`);
}

try {
  main();
} catch (err) {
  console.error('✗ 導出失敗：' + err.message);
  process.exit(1);
}
