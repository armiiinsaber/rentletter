# scripts/brand/font-instance.py
# One font file from a self hosted web font (public/fonts), for the brand kit (scripts/brand/kit.mjs).
# With no axis values it writes the variable font as a TTF; with values it writes that one static
# instance. Needs fontTools with brotli (woff2). Nothing here runs in the app.
#   python3 scripts/brand/font-instance.py <src.woff2> <out.ttf> [wght=600 opsz=28 ...]
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src, out = sys.argv[1], sys.argv[2]
axes = {k: float(v) for k, v in (a.split('=') for a in sys.argv[3:])}
# The source's own timestamp stays in the file, so the same source writes the same bytes.
font = TTFont(src, recalcTimestamp=False)
font.flavor = None
if axes:
    instancer.instantiateVariableFont(font, axes, inplace=True)
font.save(out)
print(out)
