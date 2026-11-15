# 只做頭＋頭髮，近拍檢查（快）
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import *
import head as H, hair3 as H3
clear()
hd = H.build_head(0)
hr = H3.style_sweep(); hr.data.materials.append(H3.glossy_hair_mat())
sc = bpy.context.scene
try:
    sc.eevee.use_gtao = True; sc.eevee.gtao_distance = 0.12
except Exception: pass
try:
    sc.eevee.use_raytracing = True
except Exception: pass
for name, cam in (('front', (0.35, -1.3, 1.4)), ('side', (1.35, -0.2, 1.42)), ('back', (-0.7, 1.2, 1.5))):
    render(os.path.join(SHOT, f'h3_{name}.png'), cam, (0, 0.02, 1.36), 50, (600, 600))
print('DONE')
