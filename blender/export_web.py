# 讀 models/avatar_{sex}.blend → 每個零件減面到適合網頁的面數 → 輸出 avatar_{sex}.glb
# 執行：blender --background models/avatar_0.blend --python export_web.py -- 0
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, json
from common import *

SEX = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0
# 護膝不減面（原本 6300 面）：減到 2500 面時大三角形在膝蓋大彎（蹲低 112°）會切進皮膚，護膝上冒出一塊塊白斑
TARGET = {'body': 6000, 'head': 3000, 'hair': 9000, 'top': 7000, 'collar': 1200, 'pants': 20000, 'knee': 7000, 'socks': 1500, 'shoe': 1200, 'headband': 600}
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]
for o in parts:
    key = next((k for k in TARGET if o.name.startswith(k)), None); tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if key and tris > TARGET[key]:
        select_only(o)
        import bmesh   # 邊界和銳利的邊（髮塊下緣、衣服切口）權重 0：減面時保留，不會變鋸齒
        bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
        ha = 1.4 if key == 'hair' else 0.8   # 頭髮髮塊尖端很多，門檻太低會把主體減光（後腦露頭皮）
        hard = {v.index for e in bm.edges if e.is_boundary or (len(e.link_faces) == 2 and e.calc_face_angle(0) > ha) for v in e.verts}; bm.free()
        g = o.vertex_groups.new(name='dec'); g.add([i for i in range(len(o.data.vertices)) if i not in hard], 1.0, 'REPLACE')
        if hard: g.add(list(hard), 0.0, 'REPLACE')
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = TARGET[key] / tris; d.use_collapse_triangulate = True; d.vertex_group = 'dec'; d.vertex_group_factor = 4 if key == 'hair' else 20
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
