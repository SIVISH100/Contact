"""Build an alternate slide order from index.html without touching the original.

usage: python3 tools/variant.py <out.html> <slide classes in order...>
e.g.   python3 tools/variant.py index-solution-first.html s0 s4 s5 s6 s7 s1 s2 s3 s8 s9 s10 s11

Numbered slides are renumbered in their new order (kicker badge + page number).
"""
import re
import sys

src = open('index.html', encoding='utf8').read()
out, order = sys.argv[1], sys.argv[2:]
sections = {m.group(1): m.group(0) for m in re.finditer(r'<section class="slide (s\d+)[^"]*".*?</section>', src, re.S)}
first = src.index('<section class="slide ')
last = src.rindex('</section>') + len('</section>')

n = 0
parts = []
for cls in order:
    sec = sections[cls]
    if 'data-n="' in sec:
        n += 1
        sec = re.sub(r'data-n="\d+"', f'data-n="{n}"', sec, count=1)
        sec = re.sub(r'(<div class="kicker"><b>)\d+(</b>)', rf'\g<1>{n:02d}\2', sec, count=1)
    parts.append(sec)
html = src[:first] + '\n\n'.join(parts) + src[last:]
# the cover must be the slide that starts active
html = html.replace('class="slide s0 active"', 'class="slide s0"').replace(f'<section class="slide {order[0]}', f'<section class="slide {order[0]} active', 1)
open(out, 'w', encoding='utf8').write(html)
print(out, len(parts), 'slides')
