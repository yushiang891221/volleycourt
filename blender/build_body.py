# Q 版身體（約 3 頭身）：骨架線＋Skin 修改器長出身體 → 細分 → 跟手掌一起體素重建成一塊閉合網格 → 平滑
# 執行：blender --background --factory-startup --python build_body.py -- [sex]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from common import *

SEX = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0
FEM = SEX == 1


def skin_body():
    # (位置, 半徑x, 半徑y)：半徑 y 是前後厚度
    sx = 0.86 if FEM else 1.0   # 女生肩膀窄
    pts, edges = [], []
    def v(p, rx, ry=None):
        K = 1.32   # 細分後會縮小，半徑先放大補回來
        pts.append((Vector(p), rx * K, (ry if ry is not None else rx) * K)); return len(pts) - 1
    # 軀幹
    pel = v((0, 0, 0.6), 0.175 * (1.03 if FEM else 1), 0.135)
    w1 = v((0, 0, 0.72), 0.165 * (0.8 if FEM else 1), 0.13 * (0.88 if FEM else 1))   # 女生腰細
    ch = v((0, 0, 0.84), 0.19 * (0.95 if FEM else 1), 0.135 * (1.12 if FEM else 1))
    up = v((0, 0, 0.95), 0.18 * sx, 0.125)
    nk = v((0, 0.01, 1.04), 0.065, 0.065)
    nt = v((0, 0.02, 1.12), 0.05, 0.05)
    edges += [(pel, w1), (w1, ch), (ch, up), (up, nk), (nk, nt)]
    for s in (-1, 1):
        # 肩膀：從上胸往外，三角肌自然往下垂
        sh0 = v((s * 0.14 * sx, 0, 0.975), 0.085, 0.08)
        dl = v(tuple(arm_pt(s, 0.02, sx)), 0.07, 0.068)
        el = v(tuple(arm_pt(s, UA, sx)), 0.054, 0.054)
        wr = v(tuple(arm_pt(s, UA + FA + 0.01, sx)), 0.046, 0.042)
        edges += [(up, sh0), (sh0, dl), (dl, el), (el, wr)]
        # 腿
        hp = v((s * 0.095, 0, HIP_H - 0.04), 0.095, 0.092)
        kn = v((s * 0.095, -0.004, HIP_H - L1), 0.07, 0.072)
        cf = v((s * 0.095, 0.008, HIP_H - L1 - 0.1), 0.068, 0.07)
        an = v((s * 0.095, 0, HIP_H - L1 - KN_ANK + 0.0), 0.05, 0.05)
        edges += [(pel, hp), (hp, kn), (kn, cf), (cf, an)]
    me = bpy.data.meshes.new('skinbody'); me.from_pydata([p for p, _, _ in pts], edges, []); ob = bpy.data.objects.new('body', me); bpy.context.collection.objects.link(ob)
    m = ob.modifiers.new('skin', 'SKIN'); m.use_smooth_shade = True
    for i, (_, rx, ry) in enumerate(pts): me.skin_vertices[0].data[i].radius = (rx, ry)
    me.skin_vertices[0].data[pel].use_root = True
    sd = ob.modifiers.new('sub', 'SUBSURF'); sd.levels = 2; sd.render_levels = 2
    apply_mods(ob)
    return ob


def mitten(s):
    # 手套狀手掌＋拇指（從手腕往下）
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1)
    for vv in bm.verts: vv.co = Vector((vv.co.x * 0.056, vv.co.y * 0.042, vv.co.z * 0.072))
    import mathutils
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-s * ARM_A, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=arm_pt(s, UA + FA + 0.05, 0.86 if FEM else 1))
    t = bmesh.new(); bmesh.ops.create_uvsphere(t, u_segments=16, v_segments=10, radius=1)
    for vv in t.verts: vv.co = Vector((vv.co.x * 0.021, vv.co.y * 0.021, vv.co.z * 0.04))
    bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(-s * 0.55, 3, 'Y'))
    bmesh.ops.translate(t, verts=t.verts, vec=arm_pt(s, UA + FA + 0.04, 0.86 if FEM else 1) + Vector((-s * 0.045 * math.cos(ARM_A), -0.02, -s * 0.045 * math.sin(ARM_A) * -1)))
    me = bpy.data.meshes.new('th'); t.to_mesh(me); t.free()
    bm.from_mesh(me)
    return mesh_obj('hand', bm)


clear()
body = skin_body()
hands = [mitten(s) for s in (-1, 1)]

select_only(body, *hands); bpy.ops.object.join()
# 體素重建：整個身體變成一塊閉合網格（關節不會有接縫），再平滑
r = body.modifiers.new('remesh', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.0055; r.use_smooth_shade = True
sm = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH') if False else body.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 6
dc = body.modifiers.new('dec', 'DECIMATE'); dc.ratio = 0.35
apply_mods(body); smooth(body)
if FEM:   # 胸部：在身體表面做平緩隆起（範圍寬、邊緣漸變、中間相連；上緣平緩、下緣較明顯），不是兩顆球
    import math
    for v in body.data.vertices:
        c = v.co
        if c.y > 0.02 or not (0.74 < c.z < 0.98) or abs(c.x) > 0.2: continue
        def lobe(sx):
            dx, dz = c.x - sx * 0.075, c.z - 0.855
            sz = 0.075 if dz > 0 else 0.05   # 上面拉長（平緩）、下面收短（有下緣）
            return math.exp(-(dx / 0.075) ** 2 - (dz / sz) ** 2)
        k = max(lobe(-1), lobe(1)) * 0.85 + 0.15 * (lobe(-1) + lobe(1))
        front = min(1.0, max(0.0, -c.y / 0.06))
        c.y -= 0.032 * k * front
    sm2 = body.modifiers.new('sm2', 'SMOOTH'); sm2.factor = 0.5; sm2.iterations = 3; apply_mods(body); smooth(body)
body.data.materials.append(mat('skin', '#F7D2B4', 0.55))

import head as H
headob = H.build_head(SEX)
rig = armature()
bind_auto(rig, body); bind_to(rig, headob, 'head')
# 修正自動權重：離手臂中心線太遠的頂點（例如屁股側邊）不受手臂骨頭影響
ARMS = [g.index for g in body.vertex_groups if g.name.split('.')[0] in ('upperarm', 'forearm', 'hand')]
ax = SH_X * (0.92 if FEM else 1)
for v in body.data.vertices:
    far = arm_dist(v.co, 0.86 if FEM else 1) > 0.095 and v.co.z < SH_Z - 0.02
    if not far: continue
    snap = [(g.group, g.weight) for g in v.groups]; gs = [(gi, w) for gi, w in snap if gi not in ARMS]; tot = sum(w for _, w in gs)
    for gi, w in snap:
        if gi in ARMS: body.vertex_groups[gi].remove([v.index])
    if tot > 0:
        for gi, w in gs: body.vertex_groups[gi].add([v.index], w / tot, 'REPLACE')
    else: body.vertex_groups['spine' if v.co.z > HIP_H else 'root'].add([v.index], 1.0, 'REPLACE')
body.parent = rig
smooth_weights(body, repeat=45, factor=0.6)   # 過渡範圍約 10 公分：舉手時腋下不會被扯破
print('BODY verts', len(body.data.vertices))
render(os.path.join(SHOT, f'body_{SEX}.png'), (1.2, -3.2, 1.1), (0, 0, 0.85), 55)
render(os.path.join(SHOT, f'body_{SEX}_side.png'), (3.4, 0, 0.95), (0, 0, 0.85), 55)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'body_{SEX}.blend'))
