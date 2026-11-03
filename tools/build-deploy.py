"""Package only public assets. Add --pages for Cloudflare Pages advanced mode."""
from pathlib import Path
import argparse
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pages', action='store_true')
args = parser.parse_args()
subprocess.run([sys.executable, str(ROOT / 'tools/build-pages.py')], check=True)
out = ROOT / 'dist'
if out.exists():
    shutil.rmtree(out)
out.mkdir()
for name in ['index.html', 'styles.css', 'site-pages.css', 'script.js', 'contact.js',
             'reset.html', 'reset.js', 'reset.css', '_headers', 'favicon.png', 'manifest.json', 'assets', 'contact', 'faq', 'terms',
             'privacy', 'purchases', 'delete-account', 'ad-privacy']:
    source = ROOT / name
    if source.is_dir():
        shutil.copytree(source, out / name, ignore=shutil.ignore_patterns('.*'))
    else:
        shutil.copy2(source, out / name)
if args.pages:
    for name in ['_worker.js', '_routes.json']:
        shutil.copy2(ROOT / name, out / name)
print(f'Packaged {"Pages" if args.pages else "Worker"} assets in {out}')
