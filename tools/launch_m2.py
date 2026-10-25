"""Fill the visible Indigo setup form using Talus UI input tools.

Coordinates were verified against the 1920x1018 Talus window. This helper
requires that the setup menu is already open; it never edits game state.
"""
import argparse
import json
from bridge import call

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--humans', type=int, default=1)
p.add_argument('--computers', type=int, default=1)
p.add_argument('--seconds', type=int, default=30)
p.add_argument('--seed', default='')
p.add_argument('--names', default='Player 1\nCPU 1')
p.add_argument('--error-layout', action='store_true', help='Use positions of the visibly displayed validation-error form')
a = p.parse_args()
screen = call('engine_screenshot', {'format': 'png', 'maxWidth': 800})
if screen['window'] != {'width': 1920, 'height': 1018}:
    raise RuntimeError('Window size changed; inspect the menu before adapting the coordinates')
for x, y, value in [(1045,400,a.humans),(1265,400,a.computers),(1045,500,a.seconds),
                    (1265,500,a.seed),(1150,620,a.names)]:
    if a.error_layout:
        y -= 28
    call('engine_mouse', {'action':'click','x':x,'y':y})
    # Native text selection is fixed in Talus 0.0.2496.
    call('engine_key', {'key':'a','modifiers':['meta']})
    if str(value):
        call('engine_type', {'text':str(value)})
    else:
        call('engine_key', {'key':'Backspace'})
call('engine_mouse', {'action':'click','x':1285,'y':818 if a.error_layout else 790})
print(json.dumps({'submitted':vars(a)}), flush=True)
