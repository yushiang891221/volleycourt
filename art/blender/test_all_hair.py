import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import *
import head as H, hair3_styles as HS3
only = [int(x) for x in sys.argv[sys.argv.index('--') + 1:]] if '--' in sys.argv else list(range(8))
for t in only:
    clear(); H.build_head(1 if t >= 4 else 0); HS3.build(t)
    sc = bpy.context.scene
    try: sc.eevee.use_gtao = True
    except Exception: pass
    long_ = t in (4, 5, 6)
    render(os.path.join(SHOT, f'h3s_{t}.png'), (0.75, -1.45, 1.35) if not long_ else (1.25, -1.6, 1.25), (0, 0.02, 1.33 if not long_ else 1.2), 50, (500, 500))
print('DONE')
