# Q 版頭型：圓臉但有蘋果肌、微收的下巴、淺眼窩、耳朵；五官貼圖由網頁畫（頭的 UV 在網頁載入時算）
import bpy, bmesh, math
from mathutils import Vector
from common import *


def gauss(d, w):
    return math.exp(-(d / w) ** 2)


def build_head(sex=0):
    fem = sex == 1
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=48, radius=1)
    R = HEAD_R
    eyes = [Vector((s * math.sin(0.36) * math.cos(0.06), -math.cos(0.36) * math.cos(0.06), -math.sin(0.06))) for s in (-1, 1)]
    cheeks = [Vector((s * 0.55, -0.72, -0.42)).normalized() for s in (-1, 1)]
    for v in bm.verts:
        d = v.co.normalized()   # 單位方向：-Y 是正前方
        k = 1.0
        # 下巴：下半部往內收，前面收成柔和的 V
        low = max(0.0, -d.z - 0.15)
        k -= 0.12 * low ** 1.5 * (1 + 0.6 * max(0, -d.y))
        x_shrink = 1 - (0.1 if fem else 0.07) * max(0.0, -d.z) ** 1.2
        # 蘋果肌
        for c in cheeks: k += (0.035 if fem else 0.028) * gauss((d - c).length, 0.32)
        # 淺眼窩
        for e in eyes: k -= 0.022 * gauss((d - e).length, 0.16)
        # 後腦飽滿一點
        k += 0.03 * max(0, d.y) * max(0, d.z + 0.3)
        p = d * k
        v.co = Vector((p.x * 1.04 * x_shrink * R, p.y * 0.98 * R, p.z * 0.95 * R)) + HEAD_C
    ob = mesh_obj('head', bm)
    # 耳朵
    for s in (-1, 1):
        e = bmesh.new(); bmesh.ops.create_uvsphere(e, u_segments=16, v_segments=12, radius=1)
        for v in e.verts: v.co = Vector((v.co.x * 0.026, v.co.y * 0.04, v.co.z * 0.052)) + HEAD_C + Vector((s * R * 1.02, 0.012, -0.02))
        me = bpy.data.meshes.new('ear'); e.to_mesh(me); e.free(); eo = bpy.data.objects.new('ear', me); bpy.context.collection.objects.link(eo)
        select_only(ob, eo); bpy.ops.object.join()
    # 小鼻子
    n = bmesh.new(); bmesh.ops.create_uvsphere(n, u_segments=14, v_segments=10, radius=1)
    for v in n.verts: v.co = Vector((v.co.x * 0.02, v.co.y * 0.016, v.co.z * 0.017)) + HEAD_C + Vector((0, -R * 0.965, -0.035))
    me = bpy.data.meshes.new('nose'); n.to_mesh(me); n.free(); no = bpy.data.objects.new('nose', me); bpy.context.collection.objects.link(no)
    select_only(ob, no); bpy.ops.object.join()
    sd = ob.modifiers.new('sub', 'SUBSURF'); sd.levels = 1; apply_mods(ob); smooth(ob)
    m = mat('face', '#F7D2B4', 0.32); bb = m.node_tree.nodes['Principled BSDF']   # 軟膠皮膚：亮面＋透光
    for k, v in (('Coat Weight', 0.25), ('Coat Roughness', 0.15), ('Subsurface Weight', 0.25), ('Subsurface Scale', 0.03)):
        if k in bb.inputs: bb.inputs[k].default_value = v
    ob.data.materials.append(m)
    return ob
