"""Add Lucide icons to assets/icons.js.  usage: python3 tools/add_icons.py <lucide icons dir> name [name...]"""
import json
import re
import sys

src, names = sys.argv[1], sys.argv[2:]
s = open('assets/icons.js').read()
icons = json.loads(s[len('window.ICONS='):s.rindex(';')])
for n in names:
    t = open(f'{src}/{n}.svg').read()
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S).strip()
    t = re.sub(r'\s(width|height)="24"', '', t, count=2)
    t = re.sub(r'class="[^"]*"', '', t)
    icons[n] = t
open('assets/icons.js', 'w').write('window.ICONS=' + json.dumps(icons) + ';\n')
print(len(icons), 'icons')
