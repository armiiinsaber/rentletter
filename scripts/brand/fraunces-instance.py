# scripts/brand/fraunces-instance.py
# One static instance of the self hosted Fraunces variable font (public/fonts/fraunces-latin.woff2),
# the face the official logo is set in: weight 600 at optical size 144. That instance matches the R
# of the admin home screen icon (public/admin-icon-512.png) pixel for pixel. Called by
# scripts/brand/build-brand.mjs, which turns its outlines into the logo's vector paths.
#   python3 scripts/brand/fraunces-instance.py <out.ttf>
# Needs fontTools with brotli (woff2). Nothing here runs in the app.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src = 'public/fonts/fraunces-latin.woff2'
out = sys.argv[1]
font = TTFont(src)
font.flavor = None
instancer.instantiateVariableFont(font, {'wght': 600, 'opsz': 144}, inplace=True)
font.save(out)
print(out)
