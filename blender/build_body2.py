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


def finish(parts, name, bone=None, zblend=None):
    """體素重建成一塊閉合網格、平滑、減面；整塊綁一根骨頭（軀幹另外依高度在 spine／root 之間漸變）"""
    select_only(*parts); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name
    r = ob.modifiers.new('re', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.0055; r.use_smooth_shade = True
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 6
    dc = ob.modifiers.new('dc', 'DECIMATE'); dc.ratio = 0.35
    apply_mods(ob); smooth(ob)
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
    n = [((0, 0, 0.56), 0.165 * (1.03 if FEM else 1), 0.13), ((0, 0, 0.72), 0.165 * (0.8 if FEM else 1), 0.13 * (0.88 if FEM else 1)),
         ((0, 0, 0.84), 0.19 * (0.95 if FEM else 1), 0.135 * (1.12 if FEM else 1)), ((0, 0, 0.955), 0.195 * (0.86 if FEM else 1), 0.125),
         ((0, 0.01, 1.04), 0.065, 0.065), ((0, 0.02, 1.12), 0.05, 0.05)]
    torso = skin_piece('torso', n, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)])
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
        sh, el, wr = arm_pt(s, 0), arm_pt(s, UA), arm_pt(s, UA + FA)
        # 上臂：肩膀關節球（以肩膀轉軸為圓心）＋到手肘
        up = skin_piece('ua', [(tuple(sh), 0.05, 0.049), (tuple(el), 0.048, 0.048)], [(0, 1)])
        P.append(finish([up, ball(sh, 0.066 * (0.94 if FEM else 1))], f'arm_upper.{side}', bone=f'upperarm.{side}'))   # 關節球小一點，肩膀只是微微圓起
        # 前臂：手肘關節球＋到手腕
        fo = skin_piece('fa', [(tuple(el), 0.05, 0.05), (tuple(wr), 0.044, 0.04)], [(0, 1)])
        P.append(finish([fo, ball(el, 0.058)], f'arm_fore.{side}', bone=f'forearm.{side}'))
        # 手掌（手套狀）＋拇指，跟 hand 骨頭
        hb = bmesh.new(); bmesh.ops.create_uvsphere(hb, u_segments=24, v_segments=16, radius=1)
        for vv in hb.verts: vv.co = Vector((vv.co.x * 0.056, vv.co.y * 0.042, vv.co.z * 0.072))
        bmesh.ops.rotate(hb, verts=hb.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-s * ARM_A, 3, 'Y'))
        bmesh.ops.translate(hb, verts=hb.verts, vec=arm_pt(s, UA + FA + 0.05))
        th = bmesh.new(); bmesh.ops.create_uvsphere(th, u_segments=16, v_segments=10, radius=1)
        for vv in th.verts: vv.co = Vector((vv.co.x * 0.021, vv.co.y * 0.021, vv.co.z * 0.04))
        bmesh.ops.rotate(th, verts=th.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-s * 0.55, 3, 'Y'))
        bmesh.ops.translate(th, verts=th.verts, vec=arm_pt(s, UA + FA + 0.04) + Vector((-s * 0.045 * math.cos(ARM_A), -0.02, s * 0.045 * math.sin(ARM_A))))
        tm = bpy.data.meshes.new('th'); th.to_mesh(tm); th.free(); hb.from_mesh(tm)
        P.append(finish([mesh_obj('hand', hb), ball(wr, 0.044)], f'hand.{side}', bone=f'hand.{side}'))
        # 大腿：髖關節球＋到膝蓋；小腿：膝關節球＋到腳踝
        hip, kn, an = Vector((s * 0.095, 0, HIP_H)), Vector((s * 0.095, 0, HIP_H - L1)), Vector((s * 0.095, 0, HIP_H - L1 - KN_ANK))
        tg = skin_piece('th', [(tuple(hip), 0.09, 0.088), (tuple(kn + Vector((0, -0.004, 0))), 0.068, 0.07)], [(0, 1)])
        P.append(finish([tg, ball(hip, 0.112)], f'leg_thigh.{side}', bone=f'thigh.{side}'))
        sn = skin_piece('sh', [(tuple(kn), 0.066, 0.068), (tuple(kn + Vector((0, 0.008, -0.1))), 0.066, 0.068), (tuple(an), 0.05, 0.05)], [(0, 1), (1, 2)])
        P.append(finish([sn, ball(kn, 0.074)], f'leg_shin.{side}', bone=f'shin.{side}'))
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
