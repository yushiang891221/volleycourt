# 頭髮：髮帽（閉合殼）＋平滑曲線髮束（尾端收細）→ 體素重建熔成一整塊閉合網格 → 平滑
# 8 種：0 刺蝟頭 1 蓬鬆捲髮 2 紋理短髮 3 頭帶短髮 4 高馬尾 5 雙辮子 6 長直髮 7 鮑伯頭
import bpy, bmesh, math, random
from mathutils import Vector
from common import *

HS = (1.04, 0.98, 0.95)   # 頭的縮放（跟 head.py 一致）


def sph(pol, az, k=1.0):
    """頭表面上的點：pol＝離頭頂角度，az＝0 正前方（-Y）、正值往角色左邊（+X）"""
    R = HEAD_R * k
    return HEAD_C + Vector((math.sin(pol) * math.sin(az) * R * HS[0], -math.sin(pol) * math.cos(az) * R * HS[1], math.cos(pol) * R * HS[2]))


def out_dir(p):
    return (p - HEAD_C).normalized()


def cap(front, side, back, k=1.05, bangs=None, part=False):
    """髮帽：(az, t) 參數網格從頭頂長到髮線，邊緣平滑、往內收進頭皮"""
    def H(az):
        c = math.cos(az); h = side + (front - side) * c if c > 0 else side + (back - side) * -c
        if bangs and abs(az) < 0.95:
            n, amp = bangs; w = math.cos(az / 0.95 * math.pi / 2) ** 0.6; sv = 0.5 + 0.5 * math.cos(az * n * math.pi / 0.95); h += amp * w * sv ** 2.5
        return h
    NA, NT = 128, 40; bm = bmesh.new(); grid = []
    for i in range(NA):
        az = -math.pi + i / NA * 2 * math.pi; h = H(az); col = []
        for j in range(NT + 1):
            t = j / NT; pol = max(1e-4, t * h); kk = k - (k - 1.0) * 0.9 * max(0, (t - 0.85) / 0.15) ** 2
            if part and pol < 0.9: kk -= 0.012 * math.exp(-(az / 0.05) ** 2)
            col.append(bm.verts.new(sph(pol, az, kk)))
        grid.append(col)
    for i in range(NA):
        a, b = grid[i], grid[(i + 1) % NA]
        for j in range(NT):
            if j == 0: bm.faces.new((a[0], a[1], b[1]))
            else: bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    bmesh.ops.remove_doubles(bm, verts=[c[0] for c in grid], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_obj('cap', bm)
    so = ob.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.02; so.offset = -1; apply_mods(ob); smooth(ob)
    return ob


def strand(pts, r0, r1=0.004, flat=1.0):
    """平滑曲線髮束：從 r0 收細到 r1"""
    cu = bpy.data.curves.new('s', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = 4; cu.resolution_u = 10; cu.use_fill_caps = True
    q = [pts[0]]
    for p in pts[1:]:
        if (p - q[-1]).length > 0.004: q.append(p)   # 重疊的控制點會讓曲線爆掉，略過
    pts = q
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    n = len(pts)
    for i, (bp, p) in enumerate(zip(sp.bezier_points, pts)):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        t = i / (n - 1); bp.radius = r0 + (r1 - r0) * t ** 1.3
    ob = bpy.data.objects.new('strand', cu); bpy.context.collection.objects.link(ob)
    if flat != 1.0: ob.scale = (1, 1, 1)
    select_only(ob); bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def spike(pol, az, length, up, r0):
    b = sph(pol, az, 0.98); d = (out_dir(b) + Vector((0, 0, up))).normalized()
    return strand([b, b + d * length * 0.5 + out_dir(b) * 0.015, b + d * length], r0, 0.013)


def fringe(n, spread, end_pol, r0, k_end=1.09, curl=0.0):
    out = []
    for i in range(n):
        az = (i / (n - 1) - 0.5) * spread if n > 1 else 0
        out.append(strand([sph(0.35, az * 0.4, 1.0), sph(0.75, az * 0.85, 1.08), sph(end_pol - 0.1, az * 1.05, k_end), sph(end_pol + 0.04 + curl * 0.5, az * 1.12, k_end - 0.03 - curl * 0.3)], r0, 0.004))
    return out


def fuse(parts, name, voxel=0.0045):
    select_only(*parts); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name
    r = ob.modifiers.new('re', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.7; sm.iterations = 5
    dc = ob.modifiers.new('dc', 'DECIMATE'); dc.ratio = 0.3
    apply_mods(ob); smooth(ob)
    return ob


def build_hair(t):
    rnd = random.Random(t + 3); P = []
    if t == 0:   # 刺蝟頭
        P.append(cap(1.0, 1.5, 1.95, bangs=(5, 0.22)))
        for i in range(12): P.append(spike(0.45 + (i % 3) * 0.2, i * 2 * math.pi / 12 + 0.2, 0.12 + rnd.random() * 0.04, 0.6, 0.062))
        for i in range(4): P.append(spike(0.08, i * math.pi / 2, 0.13, 1.0, 0.066))
        P += fringe(5, 1.5, 1.12, 0.035, curl=-0.1)
    elif t == 1:   # 蓬鬆捲髮
        P.append(cap(1.02, 1.5, 1.95, k=1.06))
        for i in range(46):
            pol = 0.1 + math.sqrt(rnd.random()) * 1.35; az = rnd.random() * 2 * math.pi
            if pol > 1.0 and math.cos(az) > 0.5: continue
            b = sph(pol, az, 1.04); o = out_dir(b); tg = Vector((math.cos(az), math.sin(az), 0)) * (1 if rnd.random() < 0.5 else -1)
            P.append(strand([b, b + o * 0.05 + tg * 0.03, b + o * 0.05 + tg * 0.07 - Vector((0, 0, 0.02)), b + o * 0.02 + tg * 0.08], 0.032, 0.012))
        P += fringe(6, 1.4, 1.08, 0.032, curl=-0.15)
    elif t == 2:   # 紋理短髮：往前梳，前緣微翹
        P.append(cap(1.05, 1.5, 1.92, k=1.04, bangs=(7, 0.15)))
        for row in range(3):
            for i in range(10):
                az = i * 2 * math.pi / 10 + row * 0.3; p0 = 0.1 + row * 0.35; fwd = 1 if math.cos(az) > 0 else 0
                P.append(strand([sph(p0, az, 1.02), sph(p0 + 0.3, az, 1.1), sph(p0 + 0.55 + fwd * 0.12, az + 0.05, 1.1 + fwd * 0.04)], 0.042, 0.006))
    elif t == 3:   # 頭帶短髮（頭帶另外一個物件，網頁換隊伍色）
        P.append(cap(1.12, 1.5, 1.92, k=1.03))
        for i in range(10): P.append(spike(0.4 + (i % 2) * 0.2, i * 2 * math.pi / 10, 0.1, 0.7, 0.052))
    elif t == 4:   # 高馬尾
        P.append(cap(1.0, 1.55, 2.0, k=1.04, bangs=(4, 0.2)))
        tie = sph(0.95, math.pi, 1.06)
        for i in range(11):
            az = -1.5 + i * 0.3; P.append(strand([sph(1.0 + abs(az) * 0.25, az, 1.02), sph(0.55, az * 0.7, 1.08), sph(0.6, math.pi - az * 0.2, 1.08), tie], 0.04, 0.03))
        for i in range(6):
            a = i / 6 * 2 * math.pi; o = Vector((math.cos(a) * 0.02, 0, math.sin(a) * 0.02))
            P.append(strand([tie + o, tie + Vector((o.x, 0.1, 0.05 + o.z)), tie + Vector((o.x * 2, 0.17, -0.1)), tie + Vector((o.x * 2.4, 0.12, -0.3)), tie + Vector((o.x * 1.5, 0.06, -0.42))], 0.04, 0.006))
        for s in (-1, 1): P.append(strand([sph(0.95, s * 0.95, 1.05), sph(1.35, s * 1.02, 1.1), sph(1.75, s * 0.98, 1.07), sph(1.98, s * 0.88, 1.0)], 0.022, 0.006))
        P += fringe(4, 1.0, 1.14, 0.034)
    elif t == 5:   # 雙辮子：中分，耳後綁起，辮子一節一節
        P.append(cap(1.0, 1.62, 2.05, k=1.04, bangs=(6, 0.18), part=True))
        for s in (-1, 1):
            tie = sph(1.72, s * 1.85, 1.05)
            for i in range(7):
                az = s * (0.08 + i * 0.3); P.append(strand([sph(0.12, s * 0.05, 1.02), sph(0.6 + i * 0.05, az, 1.08), sph(1.3, s * (1.2 + i * 0.1), 1.08), tie], 0.04, 0.03))
            for k in range(7):
                bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=1); sc = 1 - k * 0.06; sw = (k % 2 * 2 - 1) * 0.012
                for v in bm.verts: v.co = tie + Vector((v.co.x * 0.048 * sc + s * 0.012 + sw, v.co.y * 0.044 * sc + k * 0.004, v.co.z * 0.062 * sc - 0.045 - k * 0.056))
                P.append(mesh_obj('lobe', bm))
            P.append(strand([tie + Vector((0, 0, -0.42)), tie + Vector((s * 0.01, -0.01, -0.47)), tie + Vector((s * 0.015, -0.02, -0.53))], 0.03, 0.006))
    elif t == 6:   # 長直髮：披在背後
        P.append(cap(1.0, 1.62, 1.95, k=1.04, bangs=(7, 0.2)))
        for i in range(22):
            az = 1.5 + (i / 21) * (2 * math.pi - 3.0); m = sph(1.45, az, 1.1); e = Vector((m.x * 0.85, m.y * 0.9 + 0.05, HEAD_C.z - 0.36 - rnd.random() * 0.06))
            P.append(strand([sph(0.15, az * 0.1, 1.0), sph(0.75, az, 1.07), m, m.lerp(e, 0.5) + Vector((0, 0.01, 0)), e], 0.045, 0.012))
        P += fringe(6, 1.3, 1.16, 0.032)
    else:   # 鮑伯頭
        P.append(cap(1.0, 1.95, 2.15, k=1.06, bangs=(9, 0.12)))
        for i in range(24):
            az = 0.9 + (i / 23) * (2 * math.pi - 1.8); m = sph(1.4, az, 1.12); e = sph(1.9, az, 0.98); e.z = HEAD_C.z - 0.17 - rnd.random() * 0.03
            P.append(strand([sph(0.2, az * 0.1, 1.0), sph(0.8, az, 1.09), m, e], 0.05, 0.02))
    ob = fuse(P, f'hair_{t}')
    ob.data.materials.append(mat('hair', '#4A2C1A', 0.5, sheen=0.4))
    extra = None
    if t == 3:
        bm = bmesh.new(); bmesh.ops.create_circle(bm, segments=64, radius=1)
        me = bpy.data.meshes.new('band'); bm.to_mesh(me); bm.free()
        band = bpy.data.objects.new('headband', me); bpy.context.collection.objects.link(band)
        bpy.ops.mesh.primitive_torus_add(major_radius=HEAD_R * 1.02, minor_radius=0.024, major_segments=72, minor_segments=12)
        band = bpy.context.view_layer.objects.active; band.name = 'headband_3'
        band.scale = (HS[0], HS[1], 1); band.rotation_euler = (-0.3, 0, 0); band.location = HEAD_C + Vector((0, 0.01, 0.1))
        select_only(band); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); smooth(band)
        band.data.materials.append(mat('accent', '#F07C24', 0.6)); extra = band
    return ob, extra
