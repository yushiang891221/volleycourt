# 8 種髮型（第 3 版做法）：0 刺蝟頭 1 蓬鬆捲髮 2 側分短髮 3 頭帶短髮 4 高馬尾 5 雙辮子 6 長直髮 7 鮑伯頭
import bpy, bmesh, math, random
from mathutils import Vector
from common import *
from hair import sph, HS
import hair3 as H3
from hair3 import chunk, volume

S = lambda pol, az, k: sph(pol, az, k)
UPV = Vector((0, 0, 1))


def lean(pol, az, length, up=0.6, k0=1.1, w=0.075, th=0.04, curl=0.02, bend=0.0):
    """往外往上翹的髮塊（刺）：沿頭表面往頭頂方向走、同時離開頭皮"""
    p0 = S(pol, az, k0); n = (p0 - HEAD_C).normalized()
    up_t = (UPV - n * UPV.dot(n)).normalized() if abs(n.z) < 0.98 else Vector((math.sin(az), -math.cos(az), 0))
    d = (n * 0.55 + up_t * up).normalized()
    side = n.cross(up_t).normalized()
    p1 = p0 + d * length * 0.5 + side * bend * 0.5; p2 = p0 + d * length + side * bend + n * 0.01
    return chunk([p0, p1, p2], w, th, curl=curl, root_w=0.7)


def back_layer(P, n=9, k=1.13, end=1.85, w=0.075):
    for i in range(n):
        az = math.pi + (i - (n - 1) / 2) * (2.6 / (n - 1)) / 1.0
        P.append(chunk([S(0.25, az * 0.6, k), S(0.95, az, k), S(1.45, az, k - 0.05), S(end, az + 0.05, 1.03)], w, 0.03, curl=0.012))


def temples(P, k=1.13, end=1.5):
    for s in (-1, 1):
        for j in range(3):
            az = s * (0.75 + j * 0.22)
            P.append(chunk([S(0.55, az * 0.8, k), S(0.95, az, k), S(1.3, az + s * 0.05, k - 0.06), S(end + 0.05 * j, az + s * 0.08, 1.02)], 0.07, 0.032, curl=0.012))


def ears(P, end=1.62):
    for s in (-1, 1):
        for j in range(2):
            az = s * (1.25 + j * 0.3)
            P.append(chunk([S(1.0, az, 1.1), S(1.35, az + s * 0.05, 1.06), S(end, az + s * 0.1, 1.02)], 0.055, 0.025, curl=0.008))


def fringe(P, n, spread, end=1.08, k=1.16, w=0.07, sweep=0.0, curl=0.025):
    for i in range(n):
        az = (i / (n - 1) - 0.5) * spread if n > 1 else 0
        P.append(chunk([S(0.3, az * 0.3 + sweep * 0.3, k), S(0.7, az * 0.8 + sweep * 0.6, k + 0.02), S(end - 0.12, az + sweep, k - 0.01), S(end, az * 1.05 + sweep * 1.2, 1.1)], w, 0.034, curl=curl))


def tie_ring(P, at, normal, r=0.034):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.014, major_segments=32, minor_segments=10)
    t = bpy.context.view_layer.objects.active; t.location = at
    t.rotation_euler = normal.to_track_quat('Z', 'Y').to_euler(); P.append(t)


def finish(P, name):
    for o in P:
        if o.name.startswith('chunk'):
            sd = o.modifiers.new('sd', 'SUBSURF'); sd.levels = 1; apply_mods(o)
    for o in P:   # 沒有頂點顏色的零件（辮子、髮圈）補上，不然合併後會變黑
        if o.type == 'MESH' and 'Col' not in o.data.color_attributes:
            ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            for d in ca.data: d.color = (0.85, 0.85, 0.85, 1)
    select_only(*P); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name; smooth(ob)
    ob.data.materials.clear(); ob.data.materials.append(H3.glossy_hair_mat()); H3.angel_ring(ob)
    return ob


def build(t):
    rnd = random.Random(20 + t); P = []
    if t == 0:   # 刺蝟頭：頭頂一圈往上往外翹的大刺，前面幾撮往上
        P.append(volume(0.85, 1.2, 1.6, k_top=1.16, k_edge=0.97)); back_layer(P); temples(P); ears(P)
        for i in range(8):
            az = i * 2 * math.pi / 8 + 0.3 + (rnd.random() - 0.5) * 0.35
            P.append(lean(0.5 + (rnd.random() - 0.5) * 0.25, az, 0.11 + rnd.random() * 0.07, up=0.35 + rnd.random() * 0.4, w=0.085 + rnd.random() * 0.02, bend=(rnd.random() - 0.5) * 0.08))
        for i in range(4): P.append(lean(0.2 + rnd.random() * 0.1, i * 1.6 + rnd.random(), 0.13 + rnd.random() * 0.05, up=0.6, w=0.09, bend=(rnd.random() - 0.5) * 0.06))
        for i in range(3): P.append(lean(0.8, (i - 1) * 0.42 + 0.1, 0.1 + rnd.random() * 0.03, up=0.7, k0=1.12, w=0.075, curl=0.03, bend=0.03))
    elif t == 1:   # 蓬鬆捲髮：很多短的 C 字捲
        P.append(volume(0.85, 1.25, 1.65, k_top=1.2, k_edge=0.97)); temples(P, k=1.16); ears(P)
        for i in range(72):   # 捲塊小而多、大小不一（之前太大顆像巧克力球）
            pol = 0.12 + math.sqrt(rnd.random()) * 1.42; az = rnd.random() * 2 * math.pi; dz = 0.16 if rnd.random() < 0.5 else -0.16
            if pol > 0.95 and math.cos(az) > 0.6: continue
            sz = 0.7 + rnd.random() * 0.5
            P.append(chunk([S(pol, az, 1.16), S(pol + 0.14 * sz, az + dz * sz, 1.16 + 0.06 * sz), S(pol + 0.22 * sz, az + dz * 0.3 * sz, 1.13)], 0.042 * sz, 0.028 * sz, curl=0.016, root_w=0.8))
        fringe(P, 5, 1.3, end=1.02, k=1.2, w=0.06, curl=0.04)
    elif t == 2:   # 側分短髮（參考圖）
        ob = H3.style_sweep(); ob.name = 'hair_2'; ob.data.materials.clear(); ob.data.materials.append(H3.glossy_hair_mat()); H3.angel_ring(ob); return ob
    elif t == 3:   # 頭帶短髮：頭帶上面短刺
        P.append(volume(0.95, 1.25, 1.6, k_top=1.12, k_edge=0.97)); back_layer(P, k=1.1, end=1.8); ears(P)
        for i in range(9): P.append(lean(0.42 + rnd.random() * 0.2, i * 2 * math.pi / 9 + rnd.random() * 0.3, 0.07 + rnd.random() * 0.05, up=0.4 + rnd.random() * 0.4, w=0.075, bend=(rnd.random() - 0.5) * 0.06))
        bpy.ops.mesh.primitive_torus_add(major_radius=HEAD_R * 1.05, minor_radius=0.026, major_segments=72, minor_segments=12)
        band = bpy.context.view_layer.objects.active; band.name = 'headband_3'; band.scale = (HS[0], HS[1], 1); band.rotation_euler = (-0.3, 0, 0); band.location = HEAD_C + Vector((0, 0.01, 0.1))
        select_only(band); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); smooth(band); band.data.materials.append(mat('accent', '#F07C24', 0.5))
        for s in (-1, 1):
            for j in range(2): P.append(chunk([S(0.7, s * (0.8 + j * 0.3), 1.1), S(1.1, s * (0.85 + j * 0.3), 1.08), S(1.45, s * (0.9 + j * 0.3), 1.02)], 0.065, 0.03))
    elif t == 4:   # 高馬尾：往後梳到後腦上方綁起，馬尾 S 形垂下
        P.append(volume(0.85, 1.3, 2.5, k_top=1.1, k_edge=0.97, p=4)); tie = S(0.95, math.pi, 1.1)
        for i in range(12):
            az = -1.65 + i * 0.3
            P.append(chunk([S(1.0 + abs(az) * 0.22, az, 1.08), S(0.55, az * 0.75, 1.12), S(0.75, math.pi - az * 0.25, 1.12), tie], 0.075, 0.03, curl=0.0, root_w=0.8))
        for i in range(6):
            a = i / 6 * 2 * math.pi; o = Vector((math.cos(a) * 0.022, 0, math.sin(a) * 0.022))
            P.append(chunk([tie + o, tie + Vector((o.x, 0.1, 0.05 + o.z)), tie + Vector((o.x * 2, 0.18, -0.1)), tie + Vector((o.x * 2.4, 0.15, -0.3)), tie + Vector((o.x * 1.6, 0.09, -0.44 - rnd.random() * 0.04))], 0.045, 0.04, curl=0.015, root_w=0.9))
        fringe(P, 4, 1.0, end=1.1, w=0.07, sweep=0.15)
        for s in (-1, 1): P.append(chunk([S(0.9, s * 0.95, 1.1), S(1.35, s * 1.02, 1.12), S(1.75, s * 0.98, 1.08), S(2.02, s * 0.88, 1.02)], 0.035, 0.02, curl=0.01))
        tie_ring(P, tie, Vector((0, 0.4, 1)).normalized() * -1)
    elif t == 5:   # 雙辮子：中分往兩側梳到耳後，一節一節的辮子
        P.append(volume(0.85, 1.4, 2.5, k_top=1.1, k_edge=0.97, p=4))   # 女生髮型主體包到後頸
        for s in (-1, 1):
            tie = S(1.72, s * 1.85, 1.08)
            for i in range(7):
                az = s * (0.1 + i * 0.32)
                P.append(chunk([S(0.12, s * 0.05, 1.1), S(0.65 + i * 0.04, az, 1.13), S(1.3, s * (1.15 + i * 0.1), 1.1), tie], 0.075, 0.03, curl=0.0, root_w=0.8))
            for k in range(7):
                bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1); sc = 1 - k * 0.06; sw = (k % 2 * 2 - 1) * 0.012
                for v in bm.verts: v.co = tie + Vector((v.co.x * 0.05 * sc + s * 0.012 + sw, v.co.y * 0.046 * sc + k * 0.004, v.co.z * 0.065 * sc - 0.05 - k * 0.058))
                P.append(mesh_obj('lobe', bm))
            P.append(chunk([tie + Vector((0, 0, -0.43)), tie + Vector((s * 0.01, -0.01, -0.49)), tie + Vector((s * 0.015, -0.02, -0.56))], 0.03, 0.025, curl=0.01, root_w=1))
            tie_ring(P, tie + Vector((0, 0, -0.035)), Vector((0, 0, 1)))
        fringe(P, 6, 1.2, end=1.1, w=0.065)
    elif t == 6:   # 長直髮：頭頂順下來，長髮塊垂到背後（舉手不會穿過）
        P.append(volume(0.85, 1.4, 2.5, k_top=1.12, k_edge=0.97, p=4)); temples(P, end=1.55)
        for i in range(14):
            az = 1.45 + i * (2 * math.pi - 2.9) / 13; m = S(1.55, az, 1.12)
            e1 = Vector((m.x * 0.95, max(m.y, 0.08) + 0.04, HEAD_C.z - 0.22)); e2 = Vector((m.x * 0.85, max(m.y, 0.1) + 0.06, HEAD_C.z - 0.44 - rnd.random() * 0.05))
            P.append(chunk([S(0.2, az * 0.3, 1.12), S(0.9, az, 1.13), m, e1, e2], 0.08, 0.035, curl=0.01, root_w=0.7))
        fringe(P, 7, 1.5, end=1.12, w=0.065, curl=0.01)
    else:   # 鮑伯頭：到下巴長度、髮尾往內收
        P.append(volume(0.85, 1.5, 2.5, k_top=1.14, k_edge=0.97, p=4))
        for i in range(16):
            az = 0.85 + i * (2 * math.pi - 1.7) / 15
            P.append(chunk([S(0.2, az * 0.3, 1.14), S(0.9, az, 1.16), S(1.5, az, 1.15), S(1.95, az, 1.04)], 0.085, 0.036, curl=-0.03, root_w=0.7))
        fringe(P, 8, 1.6, end=1.1, w=0.062, curl=0.005)
    return finish(P, f'hair_{t}')
