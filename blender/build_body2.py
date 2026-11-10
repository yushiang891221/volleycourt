# Q 版身體（球形關節版）：身體分成軀幹、上臂、前臂、手、大腿、小腿幾段，每段整塊只跟一根骨頭動（不可能被扯破）；
# 每段在關節處是一顆以轉軸為圓心的圓球，繞圓心轉形狀不變，任何動作關節都不露縫。像軟膠公仔的關節。
# 執行：blender --background --factory-startup -t 4 --python build_body2.py -- [sex]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, mathutils
from mathutils import Vector
from common import *

SEX = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0
FEM = SEX == 1
K = 1.32   # Skin 修改器細分後會縮小，半徑先放大補回來


def skin_piece(name, nodes, edges, root=0):
    """nodes: [(位置, 半徑x, 半徑y)]（半徑是最後的大小，會自動乘 K）"""
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p, _, _ in nodes], edges, [])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    m = ob.modifiers.new('skin', 'SKIN'); m.use_smooth_shade = True
    for i, (_, rx, ry) in enumerate(nodes): me.skin_vertices[0].data[i].radius = (rx * K, ry * K)
    me.skin_vertices[0].data[root].use_root = True
    sd = ob.modifiers.new('sub', 'SUBSURF'); sd.levels = 2; apply_mods(ob)
    return ob


def ball(center, r, scale=(1, 1, 1)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1)
    for v in bm.verts: v.co = Vector((v.co.x * r * scale[0], v.co.y * r * scale[1], v.co.z * r * scale[2])) + Vector(center)
    return mesh_obj('ball', bm)


def finish(parts, name, bone=None, zblend=None, limb=None):
    """體素重建成一塊閉合網格、平滑、減面；整塊綁一根骨頭（軀幹另外依高度在 spine／root 之間漸變）"""
    select_only(*parts); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name
    r = ob.modifiers.new('re', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.0055; r.use_smooth_shade = True
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 6
    dc = ob.modifiers.new('dc', 'DECIMATE'); dc.ratio = 0.35
    apply_mods(ob); smooth(ob)
    if limb:   # 一整條手臂／腿：照位置平滑分配權重
        G = {}
        for v in ob.data.vertices:
            for bn, w in limb_weights(v.co, limb).items():
                if w > 0.001: (G.get(bn) or G.setdefault(bn, ob.vertex_groups.new(name=bn))).add([v.index], w, 'REPLACE')
    if bone:
        g = ob.vertex_groups.new(name=bone); g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    if zblend:   # 軀幹：腰以上跟 spine、骨盆跟 root，中間平滑漸變（彎腰時肚子平順地彎）
        gs, gr = ob.vertex_groups.new(name='spine'), ob.vertex_groups.new(name='root')
        lo, hi = zblend
        for v in ob.data.vertices:
            t = max(0.0, min(1.0, (v.co.z - lo) / (hi - lo))); t = t * t * (3 - 2 * t)
            if t > 0: gs.add([v.index], t, 'REPLACE')
            if t < 1: gr.add([v.index], 1 - t, 'REPLACE')
    return ob


def body_pieces():
    P = []
    # ---- 軀幹（不含手腳；肩膀、髖部會被上臂和大腿的關節球蓋住） ----
    n = [((0, 0, 0.64), 0.158 * (1.03 if FEM else 1), 0.125), ((0, 0, 0.72), 0.155 * (0.62 if FEM else 1), 0.122 * (0.84 if FEM else 1)),   # 上半身瘦一點（之前太厚太寬）   # 骨盆底提高（之前垂到兩腿中間像一包）；女生腰更細
         ((0, 0, 0.84), 0.175 * (0.85 if FEM else 1), 0.124 * (1.12 if FEM else 1)), ((0, 0, 0.955), 0.18 * (0.66 if FEM else 1), 0.116),   # 女生肩膀窄
         ((0, 0.01, 1.04), 0.054, 0.054), ((0, 0.02, 1.13), 0.046, 0.046),   # 脖子細一點、長一點（之前短粗）
         ((-SH_X + 0.05, 0, 0.99), 0.06 * (0.78 if FEM else 1), 0.06 * (0.78 if FEM else 1)), ((SH_X - 0.05, 0, 0.99), 0.06 * (0.78 if FEM else 1), 0.06 * (0.78 if FEM else 1))]   # 肩膀：從胸口長出去、跟軀幹是同一塊（平順的肩線，頂端跟上臂一樣高）
    torso = skin_piece('torso', n, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (3, 6), (3, 7)])
    if FEM:   # 胸部：表面平緩隆起
        for v in torso.data.vertices:
            c = v.co
            if c.y > 0.02 or not (0.74 < c.z < 0.98) or abs(c.x) > 0.2: continue
            def lobe(sx):
                dx, dz = c.x - sx * 0.075, c.z - 0.855; sz = 0.075 if dz > 0 else 0.05
                return math.exp(-(dx / 0.075) ** 2 - (dz / sz) ** 2)
            k = max(lobe(-1), lobe(1)) * 0.85 + 0.15 * (lobe(-1) + lobe(1)); c.y -= 0.032 * k * min(1.0, max(0.0, -c.y / 0.06))
    P.append(finish([torso], 'torso', zblend=(HIP_H, HIP_H + 0.24)))   # 腰部過渡加寬，彎腰時拉伸分散
    for s, side in ((-1, 'R'), (1, 'L')):
        sh, el, wr = arm_pt(s, 0), arm_pt(s, UA), arm_pt(s, UA + FA); f = 0.86 if FEM else 1.0   # 女生手腳細一點
        # 整條手臂一塊（肩膀關節球＋上臂＋前臂＋手），手肘、手腕沒有接縫線
        arm = skin_piece('arm', [(tuple(sh), 0.057 * f, 0.056 * f), (tuple(el), 0.045 * f, 0.045 * f), (tuple(el + (wr - el) * 0.3), 0.046 * f, 0.044 * f), (tuple(wr), 0.036 * f, 0.034 * f)], [(0, 1), (1, 2), (2, 3)])
        hb = bmesh.new(); bmesh.ops.create_uvsphere(hb, u_segments=24, v_segments=16, radius=1)
        for vv in hb.verts: vv.co = Vector((vv.co.x * 0.056, vv.co.y * 0.042, vv.co.z * 0.072))
        bmesh.ops.rotate(hb, verts=hb.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-s * ARM_A, 3, 'Y'))
        bmesh.ops.translate(hb, verts=hb.verts, vec=arm_pt(s, UA + FA + 0.05))
        th = bmesh.new(); bmesh.ops.create_uvsphere(th, u_segments=16, v_segments=10, radius=1)
        for vv in th.verts: vv.co = Vector((vv.co.x * 0.021, vv.co.y * 0.021, vv.co.z * 0.04))
        bmesh.ops.rotate(th, verts=th.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-s * 0.55, 3, 'Y'))
        bmesh.ops.translate(th, verts=th.verts, vec=arm_pt(s, UA + FA + 0.04) + Vector((-s * 0.045 * math.cos(ARM_A), -0.02, s * 0.045 * math.sin(ARM_A))))
        tm = bpy.data.meshes.new('th'); th.to_mesh(tm); th.free(); hb.from_mesh(tm)
        P.append(finish([arm, ball(sh, 0.055 * f), mesh_obj('hand', hb)], f'arm.{side}', limb=f'upperarm.{side}'))
        # 整條腿一塊（髖關節球＋大腿＋小腿），膝蓋沒有接縫線
        hip, kn, an = Vector((s * 0.095, 0, HIP_H)), Vector((s * 0.095, 0, HIP_H - L1)), Vector((s * 0.095, 0, HIP_H - L1 - KN_ANK))
        lg = skin_piece('leg', [(tuple(hip), 0.1 * f, 0.098 * f), (tuple(kn + Vector((0, -0.004, 0))), 0.062 * f, 0.062 * f), (tuple(kn + Vector((0, 0.012, -0.08))), 0.064 * f, 0.068 * f), (tuple(an), 0.04 * f, 0.042 * f)], [(0, 1), (1, 2), (2, 3)])
        P.append(finish([lg, ball(hip, 0.102 * f)], f'leg.{side}', limb=f'thigh.{side}'))
    return P


clear()
pieces = body_pieces()
for o in pieces: o.data.materials.append(mat('skin', '#F7D2B4', 0.55))
import head as H
headob = H.build_head(SEX)
rig = armature()
for o in pieces:
    o.parent = rig; m = o.modifiers.new('rig', 'ARMATURE'); m.object = rig
bind_to(rig, headob, 'head')
# 合成一個 body 物件（各段是分開的閉合塊，各自只跟自己的骨頭）
select_only(*pieces); bpy.ops.object.join(); body = bpy.context.view_layer.objects.active; body.name = 'body'
print('BODY verts', len(body.data.vertices))
render(os.path.join(SHOT, f'body_{SEX}.png'), (1.2, -3.2, 1.1), (0, 0, 0.85), 55)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'body_{SEX}.blend'))
