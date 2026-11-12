# -*- coding: utf-8 -*-
"""Build the two source webfonts used by tools/build-fonts.py.

  tools/font-src/mingliu-full.woff2  ← genuine PMingLiU-TW (Big5 + 站點用字)
  tools/font-src/genseki-full.woff2  ← GenSekiGothic TW Bold（後備字，站點用字）

兩者都先去掉 hinting（iOS CoreText 不跑 bytecode），並限定在需要的字集。

用法：python temp/make-sources.py
"""
import importlib.util
import os
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools import subset

ROOT = Path(r"D:\Windows\nine")
FONTDIR = Path(r"C:\Users\Windows\AppData\Local\Microsoft\Windows\Fonts")
OUT = ROOT / "tools" / "font-src"

spec = importlib.util.spec_from_file_location("bf", ROOT / "tools" / "build-fonts.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)


def big5_chars():
    s = set()
    for b1 in range(0xA1, 0xFA):
        for b2 in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                ch = bytes([b1, b2]).decode("cp950")
            except Exception:
                continue
            s.add(ord(ch))
    return s


def strip_hints(f):
    for name in f.getGlyphOrder():
        g = f["glyf"][name]
        prog = getattr(g, "program", None)
        if prog is not None:
            g.program = ttProgram.Program()
            g.program.fromBytecode(b"")
    for tag in ("fpgm", "prep", "cvt ", "VDMX", "hdmx", "LTSH", "vhea", "vmtx"):
        if tag in f:
            del f[tag]
    f["post"].isFixedPitch = 0
    return f


def build(src_path, out_name, unicodes):
    f = TTFont(str(src_path))
    cm = f.getBestCmap() or {}
    have = sorted(cp for cp in unicodes if cp in cm)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=have)
    sub.subset(f)
    strip_hints(f)
    f.flavor = "woff2"
    p = OUT / out_name
    f.save(str(p))
    print("%-24s %5d 字  %6.1f KB" % (out_name, len(have), p.stat().st_size / 1024.0))
    return set(have)


freq = bf.collect_text()
for ch in bf.EXTRA:
    freq[ch] += 1000
corpus = {ord(c) for c in freq}
b5 = big5_chars()
print("Big5:", len(b5), "corpus:", len(corpus))

OUT.mkdir(parents=True, exist_ok=True)
ming_have = build(FONTDIR / "PMingLiU-TW.ttf", "mingliu-full.woff2", b5 | corpus)
genseki_have = build(FONTDIR / "gensekigothictw-bold.ttf", "genseki-full.woff2", corpus | set(range(0x20, 0x7F)))

print("明體缺字:", len(corpus - ming_have))
print("GenSeki 缺字:", len(corpus - genseki_have))
print("兩者皆缺:", len(corpus - ming_have - genseki_have))
