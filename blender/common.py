# Blender 共用工具：關節位置（跟網頁 avatar-toy.js 一致）、清場、材質、算繪、輸出
# 座標：Blender Z 朝上、角色面向 -Y（輸出 glTF 後會變成網頁的 Y 朝上、面向 +Z）
import bpy, bmesh, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models')
SHOT = os.path.join(ROOT, 'models', 'shots')
os.makedirs(SHOT, exist_ok=True)

# ---- 關節（公尺） ----
HIP_H, L1, KN_ANK = 0.62, 0.29, 0.27
SPINE_Z = 0.66
SH_X, SH_Z = 0.255, SPINE_Z + 0.34
UA, FA = 0.22, 0.19
HEAD_BASE = SPINE_Z + 0.41
HEAD_R = 0.27
HEAD_C = Vector((0, 0.025, HEAD_BASE + HEAD_R * 0.88 + 0.03))   # 頭的中心

ARM_A = 0.5   # A 字姿勢：建模時手臂往外張的角度（弧度）。網頁綁骨頭時補回來，站著照樣垂下
def arm_dir(s): return Vector((s * math.sin(ARM_A), 0, -math.cos(ARM_A)))
def arm_pt(s, d, sx=1.0): return Vector((s * SH_X * sx, 0, SH_Z)) + arm_dir(s) * d
def arm_dist(co, sx=1.0):
    best = 9
    for s in (-1, 1):
        a = arm_pt(s, -0.02, sx); b = arm_pt(s, UA + FA + 0.12, sx); ab = b - a; t = max(0, min(1, (co - a).dot(ab) / ab.length_squared))
        best = min(best, (co - (a + ab * t)).length)
    return best
def arm_param(co, sx=1.0):
    s = 1 if co.x > 0 else -1; return (co - arm_pt(s, 0, sx)).dot(arm_dir(s))

JOINTS = {   # 骨頭名稱 → (起點, 終點, 父骨頭)
    'root': ((0, 0, HIP_H - 0.06), (0, 0, SPINE_Z), None),
    'spine': ((0, 0, SPINE_Z), (0, 0, HEAD_BASE), 'root'),
    'head': ((0, 0.025, HEAD_BASE), (0, 0.025, HEAD_BASE + 0.5), 'spine'),
}
for s, n in ((-1, 'R'), (1, 'L')):   # R＝角色的右邊（-X）
    x = s * 0.095
    JOINTS[f'thigh.{n}'] = ((x, 0, HIP_H), (x, 0, HIP_H - L1), 'root')
    JOINTS[f'shin.{n}'] = ((x, 0, HIP_H - L1), (x, 0, HIP_H - L1 - KN_ANK), f'thigh.{n}')
    JOINTS[f'foot.{n}'] = ((x, 0, HIP_H - L1 - KN_ANK), (x, -0.13, 0.01), f'shin.{n}')
    JOINTS[f'upperarm.{n}'] = (tuple(arm_pt(s, 0)), tuple(arm_pt(s, UA)), 'spine')
    JOINTS[f'forearm.{n}'] = (tuple(arm_pt(s, UA)), tuple(arm_pt(s, UA + FA)), f'upperarm.{n}')
    JOINTS[f'hand.{n}'] = (tuple(arm_pt(s, UA + FA)), tuple(arm_pt(s, UA + FA + 0.12)), f'forearm.{n}')


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.62, sheen=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    c = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = rough
    if sheen and 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value = sheen
    return m


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob


def select_only(*obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]


def apply_mods(ob):
    select_only(ob)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)


def smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True


def armature():
    arm = bpy.data.armatures.new('rig'); ob = bpy.data.objects.new('rig', arm); bpy.context.collection.objects.link(ob)
    select_only(ob); bpy.ops.object.mode_set(mode='EDIT')
    for name, (h, t, parent) in JOINTS.items():
        b = arm.edit_bones.new(name); b.head = h; b.tail = t
    for name, (h, t, parent) in JOINTS.items():
        if parent: arm.edit_bones[name].parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bind_auto(rig, *obs):
    select_only(*obs, rig); bpy.context.view_layer.objects.active = rig
    for o in obs: o.select_set(True)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def bind_to(rig, ob, bone):   # 整個物件 100% 跟著一根骨頭（頭、頭髮）
    ob.parent = rig
    vg = ob.vertex_groups.new(name=bone); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    m = ob.modifiers.new('rig', 'ARMATURE'); m.object = rig


def render(path, cam_loc, look_at, lens=50, size=(900, 900)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.78, 0.7, 0.6, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    if 'cam' not in bpy.data.objects:
        cd = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(co); sc.camera = co
        sd = bpy.data.lights.new('sun', 'SUN'); sd.energy = 3.2; so = bpy.data.objects.new('sun', sd); bpy.context.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(-35))
        fd = bpy.data.lights.new('fill', 'SUN'); fd.energy = 1.0; fo = bpy.data.objects.new('fill', fd); bpy.context.collection.objects.link(fo); fo.rotation_euler = (math.radians(70), 0, math.radians(150))
        fl = bpy.data.meshes.new('floor'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6); bm.to_mesh(fl); fo2 = bpy.data.objects.new('floor', fl); bpy.context.collection.objects.link(fo2); fo2.data.materials.append(mat('floor', '#D9B48A', 0.6))
    co = bpy.data.objects['cam']; co.data.lens = lens; co.location = cam_loc
    d = Vector(look_at) - Vector(cam_loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)


def export_glb(path, obs):
    select_only(*obs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_skins=True, export_yup=True, export_apply=False, export_animations=False)


def smooth_weights(ob, repeat=12, factor=0.6):
    """骨頭權重做平滑過渡（腋下、肩膀不會被扯裂）"""
    select_only(ob)
    try:
        bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=factor, repeat=repeat, expand=0.0)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    except Exception as e:
        print('smooth_weights failed', e)
