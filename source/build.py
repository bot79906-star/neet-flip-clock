#!/usr/bin/env python3
"""Builds the extension from source/src into a folder Chrome can load.

  python3 build.py [output_dir]      (default: ../extension)

- newtab.html / popup.html get ALL their CSS inlined, so the first paint never waits on a stylesheet
- newtab.js / popup.js / reminder.js / background.js are single bundles (fewer requests, faster start)
"""
import os, re, shutil, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
_v = json.load(open(os.path.join(HERE, 'manifest.json')))['version']
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'extension')

def read(name): return open(os.path.join(SRC, name), encoding='utf-8').read()
def css(*names):
    text = '\n'.join(read(n) for n in names)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)       # comments
    return re.sub(r'\s+', ' ', text).strip()                # whitespace
def js(*names): return '\n'.join(read(n) for n in names) + '\n'

if os.path.isdir(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)

def write(name, text):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f: f.write(text)

# pages
write('newtab.html', read('newtab.html.tpl').replace('/*CSS*/', css('fonts.css', 'flip.css', 'newtab.css')))
write('popup.html',  read('popup.html.tpl').replace('/*CSS*/',  css('fonts.css', 'flip.css', 'popup.css')))

# scripts
write('newtab.js', js('common.js', 'quotes.js', 'timer.js', 'sound.js', 'motion.js', 'flip.js', 'reminder.src.js', 'newtab.app.js'))
write('popup.js',  js('common.js', 'quotes.js', 'timer.js', 'motion.js', 'flip.js', 'popup.app.js'))
write('reminder.js', js('motion.js', 'reminder.src.js') + '\nself.neetShowReminder();\n')   # injected into pages: shows at once
write('background.js', js('common.js', 'quotes.js', 'timer.js', 'sync.js', 'background.src.js'))

# assets
for d in ('fonts', 'icons', 'assets'): shutil.copytree(os.path.join(HERE, d), os.path.join(OUT, d))
write('manifest.json', json.dumps(json.load(open(os.path.join(HERE, 'manifest.json'))), indent=2) + '\n')

total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs)
print('built ->', os.path.abspath(OUT), f'({total/1024:.0f} KB)')
for f in ('newtab.html', 'newtab.js', 'popup.html', 'popup.js', 'reminder.js', 'background.js'):
    print(f'  {f:16} {os.path.getsize(os.path.join(OUT, f))/1024:6.1f} KB')
