# 讀 models/avatar_{sex}.blend → 每個零件減面到適合網頁的面數 → 輸出 avatar_{sex}.glb
# 執行：blender --background models/avatar_0.blend --python export_web.py -- 0
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, json
from common import *

SEX = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0
TARGET = {'body': 6000, 'head': 3000, 'hair': 7000, 'top': 3500, 'collar': 600, 'pants': 2500, 'knee': 800, 'socks': 800, 'shoe': 800, 'headband': 600}
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]
for o in parts:
    key = next((k for k in TARGET if o.name.startswith(k)), None); tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if key and tris > TARGET[key]:
        select_only(o)
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = TARGET[key] / tris; d.use_collapse_triangulate = True
        while o.modifiers.find('dec') > 0: bpy.ops.object.modifier_move_up(modifier='dec')
        bpy.ops.object.modifier_apply(modifier='dec')
    o.hide_render = False; o.hide_set(False)
    print('PART', o.name, tris, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
# 貼圖不打包進 glb（網頁自己畫隊服、頭髮用頂點顏色）
for m in bpy.data.materials:
    if m.use_nodes:
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE': m.node_tree.nodes.remove(n)
select_only(rig, *parts)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'avatar_{SEX}.glb'), export_format='GLB', use_selection=True, export_skins=True,
                          export_yup=True, export_apply=False, export_animations=False, export_draco_mesh_compression_enable=False)
json.dump({'sex': SEX, 'armA': ARM_A, 'parts': sorted(o.name for o in parts), 'bones': list(JOINTS.keys()),
           'joints': {k: [list(v[0]), list(v[1])] for k, v in JOINTS.items()}, 'headC': list(HEAD_C), 'headR': HEAD_R,
           'note': 'Blender Z 朝上、面向 -Y；glb 已轉成 Y 朝上、面向 +Z。手臂是 A 字姿勢（往外張 armA 弧度）'},
          open(os.path.join(OUT, f'avatar_{SEX}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('EXPORTED', os.path.getsize(os.path.join(OUT, f'avatar_{SEX}.glb')))
