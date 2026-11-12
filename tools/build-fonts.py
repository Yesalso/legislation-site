#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""依站點實際用字生成分塊網頁字體，並改寫 css/theme.css 的 @font-face。

為什麼要這樣做：
  * 完整字面太大，手機（尤其連 GitHub Pages）下載大檔常中斷，@font-face
    沒有續傳，失敗就整頁退回系統字體。
  * 本站內容是固定的靜態快照，實際用字約三千出頭；依「詞頻」分塊，
    最常用的一塊很小且會 preload，首屏中文最快變成細明體。
  * 兩個字族：
      MingLiu           正版 PMingLiU（細明體）
      GenSekiGothic TW  源石黑體 Bold，只當 MingLiu 缺字／載入失敗時的後備，
                        正常情況不會下載（unicode-range + 字族次序）。

輸入：
  tools/font-src/mingliu-full.woff2   已去 hinting 的 PMingLiU（Big5 超集）
  tools/font-src/genseki-full.woff2   已去 hinting 的 GenSekiGothic TW Bold
  站點內容：*.html、js/*.js、static-data/**（json/txt/md）
  （兩個來源字體由 tools/make-font-sources.py 從本機字型產生）

輸出：
  css/fonts/mingliu-{sym,00,01,02}.woff2
  css/fonts/genseki-{sym,00,01,02}.woff2
  css/theme.css 內 FONTFACE:START / END 之間的 @font-face

用法：python tools/build-fonts.py
"""
import sys
from collections import Counter
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "css" / "fonts"
THEME = ROOT / "css" / "theme.css"
FAMILIES = [
    # (檔名前綴, CSS 字族名, 來源檔, font-weight 描述)
    ("mingliu", "MingLiu", ROOT / "tools" / "font-src" / "mingliu-full.woff2", "normal"),
    ("genseki", "GenSekiGothic TW", ROOT / "tools" / "font-src" / "genseki-full.woff2", "400 700"),
]

# 這些字元一定要有（ASCII + 中文排版常用標點），即使內容裡沒出現
EXTRA = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "\u3000\u3001\u3002\uff0c\uff0e\uff1b\uff1a\uff01\uff1f"
      "\u300c\u300d\u300e\u300f\uff08\uff09\u3014\u3015\u3010\u3011\u300a\u300b\u3008\u3009"
      "\uff3b\uff3d\u2026\u2014\u2013\uff5e\u00b7\u2027\u2032\u2033"
      "\u2018\u2019\u201c\u201d\uff02\uff07\uff04\uff05\uff06\uff0a\uff0b\uff0d\uff0f\uff1d\uff20\uff03\uff3c\uff5c"
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


def build_chunk(group, prefix, family, weight, cps, src_font):
    f = TTFont(str(src_font))
    cmap = f.getBestCmap() or {}
    have = [cp for cp in cps if cp in cmap]
    if not have:
        return None

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=have)
    sub.subset(f)
    f.flavor = "woff2"
    name = "%s-%s.woff2" % (prefix, group)
    path = FONT_DIR / name
    f.save(str(path))
    size = path.stat().st_size
    print("  %-20s %5d 字  %7.1f KB" % (name, len(have), size / 1024.0))
    return {"family": family, "weight": weight, "path": name, "cps": have, "size": size}


def main():
    for _, _, src, _ in FAMILIES:
        if not src.exists():
            sys.exit("找不到來源字體：%s（先跑 tools/make-font-sources.py）" % src)

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

    FONT_DIR.mkdir(parents=True, exist_ok=True)
    print("生成字體分塊：")
    chunks = []
    for name, cps in groups:
        if not cps:
            continue
        for prefix, family, src, weight in FAMILIES:
            c = build_chunk(name, prefix, family, weight, cps, src)
            if c:
                chunks.append(c)

    # 清掉這次沒產生的舊分塊，避免部署殘留
    keep = {c["path"] for c in chunks}
    for pat in ("mingliu-*.woff2", "genseki-*.woff2"):
        for p in FONT_DIR.glob(pat):
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
            "  font-family: '%s';\n"
            "  src: url('fonts/%s') format('woff2');\n"
            "  font-weight: %s;\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            "  unicode-range: %s;\n"
            "}" % (c["family"], c["path"], c["weight"], ranges_str(c["cps"]))
        )
    start = css.index("/* FONTFACE:START")
    start = css.index("\n", start) + 1
    end = css.index("/* FONTFACE:END */")
    THEME.write_text(css[:start] + "\n".join(blocks) + "\n" + css[end:], encoding="utf-8")
    print("已更新 %s" % THEME.relative_to(ROOT))

    ming = [c for c in chunks if c["family"] == "MingLiu"]
    gen = [c for c in chunks if c["family"] != "MingLiu"]
    covered = set()
    for c in chunks:
        covered.update(c["cps"])
    print("MingLiu 分塊合計 %.1f KB；GenSeki 後備合計 %.1f KB" % (
        sum(c["size"] for c in ming) / 1024.0, sum(c["size"] for c in gen) / 1024.0))
    print("覆蓋 %d/%d 字（缺 %d）" % (len(covered & set(all_cps)), len(all_cps),
                                     len(set(all_cps) - covered)))


if __name__ == "__main__":
    main()
