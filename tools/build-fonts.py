#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""依站點實際用字生成分塊網頁字體，並改寫 css/theme.css 的 @font-face。

為什麼要這樣做：
  * 完整 Big5 字面約 2.8MB，手機（尤其連 GitHub Pages）下載大檔常常中斷，
    @font-face 沒有續傳，失敗就整頁退回系統字體。
  * 本站內容是固定的靜態快照，實際用字只有數千個；依「詞頻」分三塊，
    最常用的那一塊很小（約 60–90KB）且會 preload，首屏中文可以最快變細明體，
    其餘字塊再由瀏覽器按 unicode-range 按需補上。

輸入：
  tools/font-src/mingliu-full.woff2   已固化的 MingLiu 子集（不依賴 hinting）
  站點內容：*.html、js/*.js、static-data/**（json/txt/md）

輸出：
  css/fonts/mingliu-sym.woff2   符號/ASCII/標點
  css/fonts/mingliu-00.woff2    高頻字（preload）
  css/fonts/mingliu-01.woff2    次高頻
  css/fonts/mingliu-02.woff2    其餘
  css/theme.css 內 FONTFACE:START / END 之間的 @font-face

用法：python tools/build-fonts.py
"""
import os
import re
import sys
from collections import Counter
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "font-src" / "mingliu-full.woff2"
FONT_DIR = ROOT / "css" / "fonts"
THEME = ROOT / "css" / "theme.css"

# 這些字元一定要有（ASCII + 中文排版常用標點），即使內容裡沒出現
EXTRA = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "　、。，．；：！？「」『』（）〔〕【】《》〈〉…—–～·‧′″"
      "‘’“”＂＇＄％＆＊＋－／＝＠＃＼｜"
)

CJK_MIN = 0x3000          # 這個碼位以上視為「漢字/全形」字
CHUNK_SIZES = [500, 900]  # 00 / 01 的字數，其餘進 02

FONT_EXT = {".json", ".txt", ".md", ".html", ".js"}


def collect_text() -> Counter:
    freq = Counter()
    files = 0
    targets = []
    targets += list(ROOT.glob("*.html"))
    targets += list((ROOT / "js").glob("*.js"))
    for p in (ROOT / "static-data").rglob("*"):
        if p.is_file() and p.suffix.lower() in FONT_EXT:
            targets.append(p)

    for p in targets:
        try:
            s = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        files += 1
        freq.update(ch for ch in s if ord(ch) >= 0x20)
    print("掃描 %d 個檔案，取得 %d 個不同字元" % (files, len(freq)))
    return freq


def ranges_str(cps):
    """把碼位集合壓成 unicode-range 文字。"""
    out = []
    cps = sorted(cps)
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        if i == j:
            out.append("U+%04X" % cps[i])
        else:
            out.append("U+%04X-%04X" % (cps[i], cps[j]))
        i = j + 1
    return ", ".join(out)


def build_chunk(name, cps, src_font):
    f = TTFont(src_font)
    cmap = f.getBestCmap()
    have = [cp for cp in cps if cp in cmap]
    missing = [cp for cp in cps if cp not in cmap]

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=have)
    sub.subset(f)
    f.flavor = "woff2"
    path = FONT_DIR / ("mingliu-%s.woff2" % name)
    f.save(str(path))
    size = path.stat().st_size
    print("  %-14s %5d 字  %7.1f KB  %s" % (path.name, len(have), size / 1024.0,
                                             "缺字 %d" % len(missing) if missing else ""))
    return {"name": name, "path": path.name, "cps": have, "size": size}


def main():
    if not SRC.exists():
        sys.exit("找不到來源字體：%s" % SRC)

    freq = collect_text()
    for ch in EXTRA:
        freq[ch] += 1000  # 讓這些字元一定進 sym 塊

    all_cps = {ord(ch): n for ch, n in freq.items()}
    sym_cps = sorted(cp for cp in all_cps if cp < CJK_MIN)
    cjk = sorted((cp for cp in all_cps if cp >= CJK_MIN),
                 key=lambda cp: (-all_cps[cp], cp))

    a = CHUNK_SIZES[0]
    b = CHUNK_SIZES[0] + CHUNK_SIZES[1]
    groups = [
        ("sym", sym_cps),
        ("00", cjk[:a]),
        ("01", cjk[a:b]),
        ("02", cjk[b:]),
    ]

    print("生成字體分塊：")
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    chunks = [build_chunk(name, cps, str(SRC)) for name, cps in groups if cps]

    # 清掉這次沒產生的舊分塊，避免部署殘留（保留其他字體檔）
    keep = {c["path"] for c in chunks}
    for p in FONT_DIR.glob("mingliu-*.woff2"):
        if p.name not in keep:
            p.unlink()
            print("  移除舊檔", p.name)

    # 改寫 theme.css 的 @font-face 區塊
    css = THEME.read_text(encoding="utf-8")
    if "/* FONTFACE:START" not in css or "/* FONTFACE:END */" not in css:
        sys.exit("theme.css 缺少 FONTFACE:START / FONTFACE:END 標記")

    blocks = []
    for c in chunks:
        blocks.append(
            "@font-face {\n"
            "  font-family: 'MingLiu';\n"
            "  src: url('fonts/%s') format('woff2');\n"
            "  font-weight: normal;\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            "  unicode-range: %s;\n"
            "}" % (c["path"], ranges_str(c["cps"]))
        )
    start = css.index("/* FONTFACE:START")
    start = css.index("\n", start) + 1
    end = css.index("/* FONTFACE:END */")
    new_css = css[:start] + "\n".join(blocks) + "\n" + css[end:]
    THEME.write_text(new_css, encoding="utf-8")
    print("已更新 %s" % THEME.relative_to(ROOT))

    total = sum(c["size"] for c in chunks)
    print("分塊合計 %.1f KB（原始完整字面 %.1f KB）" % (total / 1024.0, SRC.stat().st_size / 1024.0))


if __name__ == "__main__":
    main()
