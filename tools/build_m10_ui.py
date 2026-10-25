"""Embed shared arcade CSS in Talus markup-only menus (no runtime DOM scripts)."""
from pathlib import Path
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
MENUS = ROOT / 'world/Menus'
css = (MENUS / 'arcade.css').read_text()
for path in MENUS.glob('*.html'):
    html = path.read_text()
    html = re.sub(r'<style>.*?</style>\s*', '', html, flags=re.S)
    html = html.replace('__TERRA_TITLE_IMAGE__', 'data:image/webp;base64,' + base64.b64encode(
        (ROOT / 'world/Art/scorched-terra-title.webp').read_bytes()).decode())
    path.write_text('<style>\n' + css + '\n</style>\n' + html)
    if path.stat().st_size > 1024 * 1024:
        raise ValueError(f'{path.name} exceeds native world text file limit')
print('Arcade menus built:', ', '.join(p.name for p in MENUS.glob('*.html')))
