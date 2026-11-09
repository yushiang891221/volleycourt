# 組合：身體、頭、衣服、鞋子 → 綁骨架 → 算繪檢查 → 輸出 glb
# 執行：blender --background --factory-startup --python build_all.py -- [sex] [shots]
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import *
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX = int(args[0]) if args else 0
sys.argv = [sys.argv[0], '--', str(SEX)]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_body2.py'), encoding='utf-8').read().split("print('BODY verts'")[0])
import clothes as C
tops = C.tops(body, SEX); pts = C.pants(body); kn = C.kneepads(body); sk = C.socks(body); sh = C.shoes()
for o in tops + pts + kn + [sk]:
    o.parent = rig; m = o.modifiers.new('rig', 'ARMATURE'); m.object = rig
for o, b in sh: bind_to(rig, o, b)
def show(*keep):
    for o in tops + pts + kn: o.hide_render = o not in keep
show(tops[1], pts[0], kn[0])
render(os.path.join(SHOT, f'all_{SEX}_a.png'), (1.2, -3.2, 1.1), (0, 0, 0.85), 55)
show(tops[3], pts[0], kn[1]); render(os.path.join(SHOT, f'all_{SEX}_b.png'), (-1.6, -2.9, 1.1), (0, 0, 0.85), 55)
show(tops[2], pts[1]); render(os.path.join(SHOT, f'all_{SEX}_c.png'), (3.4, -0.4, 0.95), (0, 0, 0.85), 55)
show(tops[0], pts[0], kn[0]); render(os.path.join(SHOT, f'all_{SEX}_d.png'), (0.8, 3.2, 1.1), (0, 0, 0.85), 55)
import hair3_styles as HR
hairs = []
for t in range(8):
    h = HR.build(t); bind_to(rig, h, 'head'); hairs.append(h)
    ex = bpy.data.objects.get(f'headband_{t}')
    if ex and ex not in hairs: bind_to(rig, ex, 'head'); hairs.append(ex)
show(tops[1], pts[0], kn[0])
for t in range(8):
    for h in hairs: h.hide_render = not (h.name in (f'hair_{t}', f'headband_{t}'))
    render(os.path.join(SHOT, f'hair_{SEX}_{t}.png'), (0.9, -1.55, 1.55) if t < 4 or t == 7 else (1.3, -1.2, 1.4), (0, 0.04, 1.3), 50, (500, 500))
# 攔網姿勢（雙手舉高）檢查會不會露腰
show(tops[1], pts[0], kn[0])
for h in hairs: h.hide_render = True
pb = rig.pose.bones
for n in ('upperarm.R', 'upperarm.L'): pb[n].rotation_mode = 'XYZ'; pb[n].rotation_euler = (-2.75, 0, 0)
render(os.path.join(SHOT, f'pose_{SEX}_block.png'), (1.6, -2.6, 1.1), (0, 0, 0.9), 55, (600, 600))
render(os.path.join(SHOT, f'pose_{SEX}_block_side.png'), (3.2, -0.3, 0.9), (0, 0, 0.9), 55, (600, 600))
for n in ('upperarm.R', 'upperarm.L'): pb[n].rotation_euler = (0, 0, 0)
# 扣球姿勢：右手往前上方舉高、左手往前
pb['upperarm.R'].rotation_euler = (-2.6, 0, 0.4); pb['upperarm.L'].rotation_euler = (-1.2, 0, 0)
render(os.path.join(SHOT, f'pose_{SEX}_spike.png'), (1.9, -2.3, 1.2), (0, 0, 0.95), 55, (600, 600))
render(os.path.join(SHOT, f'pose_{SEX}_spike_back.png'), (-1.6, 2.6, 1.3), (0, 0, 0.95), 55, (600, 600))
for n in ('upperarm.R', 'upperarm.L'): pb[n].rotation_euler = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'avatar_{SEX}.blend'))
# ---- 輸出給網頁：骨架＋所有零件（網頁依外觀選擇顯示哪幾個） ----
import json
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]
for o in parts: o.hide_render = False; o.hide_set(False)
for o in hairs: o.hide_render = False
export_glb(os.path.join(OUT, f'avatar_{SEX}.glb'), [rig] + parts)
json.dump({'sex': SEX, 'armA': ARM_A, 'parts': sorted(o.name for o in parts), 'bones': list(JOINTS.keys()),
           'joints': {k: [list(v[0]), list(v[1])] for k, v in JOINTS.items()}, 'headC': list(HEAD_C), 'headR': HEAD_R,
           'note': 'Blender Z 朝上、面向 -Y；glb 已轉成 Y 朝上、面向 +Z。手臂是 A 字姿勢（往外張 armA 弧度）'},
          open(os.path.join(OUT, f'avatar_{SEX}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('EXPORTED', len(parts))
print('DONE')
