# 頭髮第 2 版：髮流場長出上百束扁平髮束（層層疊）＋髮絲貼圖（髮根暗→髮尾亮、中段光澤帶）＋底下一層頭皮髮帽
# 0 刺蝟亂髮 1 蓬鬆捲髮 2 往上梳油頭 3 頭帶短髮 4 高馬尾 5 雙辮子 6 長直髮（齊瀏海） 7 鮑伯頭
import bpy, bmesh, math, random, os
from mathutils import Vector
from common import *
from hair import sph, cap, HS

UP = Vector((0, 0, 1)); BACK = Vector((0, 1, 0))


def surf_r(n):
    return HEAD_R / math.sqrt((n.x / HS[0]) ** 2 + (n.y / HS[1]) ** 2 + (n.z / HS[2]) ** 2)


def push_out(p, k):
    d = p - HEAD_C; n = d.normalized(); r = surf_r(n) * k
    return HEAD_C + n * r if d.length < r else p


def hair_texture():
    img = bpy.data.images.get('hair_strands')
    if img: return img
    W, H = 128, 512; img = bpy.data.images.new('hair_strands', W, H)
    rnd = random.Random(7); cols = []
    v = 0.8
    for x in range(W):   # 每一欄是一根細髮絲：亮度隨機但相鄰相關
        v += (rnd.random() - 0.5) * 0.35; v = max(0.55, min(1.0, v)); cols.append(v)
    px = []
    for y in range(H):
        t = y / (H - 1)   # 0＝髮根 1＝髮尾
        base = 0.62 + 0.38 * t ** 0.7
        hl = 0.35 * math.exp(-((t - 0.42) / 0.08) ** 2)   # 光澤帶
        for x in range(W):
            c = cols[x]; s = base * (0.75 + 0.25 * c) + hl * c ** 3
            s = min(1.0, s); px += [s, s, s, 1.0]
    img.pixels = px; img.filepath_raw = os.path.join(OUT, 'hair_strands.png'); img.file_format = 'PNG'; img.save()
    return img


def hair_mat():
    m = bpy.data.materials.get('hair2')
    if m: return m
    m = mat('hair2', '#6B4126', 0.45); nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = hair_texture()
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    A = [i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'][0]; Bi = [i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA'][0]; Ro = [o for o in mix.outputs if o.type == 'RGBA'][0]
    A.default_value = nt.nodes['Principled BSDF'].inputs['Base Color'].default_value[:]
    nt.links.new(tex.outputs['Color'], Bi); nt.links.new(Ro, nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m


PROFILE = None
def profile():
    global PROFILE
    if PROFILE and PROFILE.name in bpy.data.objects: return PROFILE
    bpy.ops.curve.primitive_bezier_circle_add(radius=1); PROFILE = bpy.context.view_layer.objects.active; PROFILE.name = 'hair_profile'
    PROFILE.scale = (1.0, 0.42, 1); select_only(PROFILE); bpy.ops.object.transform_apply(scale=True); PROFILE.hide_render = True
    return PROFILE


def ribbon(pts, r0, r1=0.003, uoff=0.0):
    """扁平髮束：沿控制點的平滑曲線，橫切面扁橢圓，從 r0 收細到 r1；UV：v 沿長度、u 繞一圈"""
    q = [pts[0]]
    for p in pts[1:]:
        if (p - q[-1]).length > 0.004: q.append(p)
    pts = q
    if len(pts) < 2: return None
    cu = bpy.data.curves.new('h', 'CURVE'); cu.dimensions = '3D'; cu.bevel_mode = 'OBJECT'; cu.bevel_object = profile(); cu.use_fill_caps = True; cu.resolution_u = 8; cu.twist_mode = 'Z_UP'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, (bp, p) in enumerate(zip(sp.bezier_points, pts)):
        t = i / (len(pts) - 1); bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'; bp.radius = r0 + (r1 - r0) * t ** 1.4
    ob = bpy.data.objects.new('h', cu); bpy.context.collection.objects.link(ob)
    select_only(ob); bpy.ops.object.convert(target='MESH'); ob = bpy.context.view_layer.objects.active
    # UV：投影到折線求沿長度的位置
    segs, acc = [], 0.0
    for a, b in zip(pts, pts[1:]): L = (b - a).length; segs.append((a, b, acc, L)); acc += L
    me = ob.data; uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co; best = (1e9, 0, None)
            for a, b, s0, L in segs:
                t = max(0, min(1, (co - a).dot(b - a) / (L * L))); pr = a + (b - a) * t; d = (co - pr).length
                if d < best[0]: best = (d, s0 + t * L, pr)
            side = (co - best[2]); ang = math.atan2(side.dot(Vector((1, 0, 0)).cross(UP)), side.dot(UP)) if side.length > 1e-6 else 0
            uv.data[li].uv = (uoff + 0.08 * ang / (2 * math.pi), best[1] / acc)
    return ob


def grow(pol, az, n, step, dirf, k0=1.02, k1=1.12, hang=False):
    p = sph(pol, az, k0); pts = [p]
    for i in range(1, n):
        t = i / (n - 1); d = dirf(p, t).normalized(); nrm = (p - HEAD_C).normalized()
        p = p + d * step; p = push_out(p, k0 + (k1 - k0) * math.sin(min(1, t * 1.6) * math.pi / 2))
        if hang and p.z < HEAD_C.z - 0.12: p.y = max(p.y, 0.15)   # 長髮：脖子以下垂在背後，舉手不會穿過
        pts.append(p.copy())
    return pts


def roots(n, region, seed):
    """在頭皮上均勻撒點（黃金角螺旋），region(pol, az) 決定要不要"""
    out, ga = [], math.pi * (3 - math.sqrt(5)); r = random.Random(seed)
    for i in range(n * 3):
        z = 1 - (i + 0.5) / (n * 3) * 2; pol = math.acos(z); az = (i * ga) % (2 * math.pi) - math.pi
        if region(pol, az): out.append((pol + (r.random() - 0.5) * 0.03, az + (r.random() - 0.5) * 0.03))
    return out


def build_hair2(t):
    rnd = random.Random(100 + t); S = []
    tang_back = lambda p: (BACK - (p - HEAD_C).normalized() * BACK.dot((p - HEAD_C).normalized()))
    if t == 0:   # 刺蝟亂髮：朝外朝上、方向有亂度
        c = cap(1.0, 1.5, 1.95, k=1.02, bangs=(5, 0.18))
        for pol, az in roots(55, lambda p, a: p < 1.25 - 0.25 * math.cos(a), 1):
            j = Vector(((rnd.random() - 0.5) * 0.6, (rnd.random() - 0.5) * 0.6, 0))
            S.append((grow(pol, az, 5, 0.032 + rnd.random() * 0.012, lambda p, tt, j=j: (p - HEAD_C).normalized() * 0.7 + UP * 0.6 + j + BACK * 0.15, 1.01, 1.12), 0.024))
    elif t == 1:   # 蓬鬆捲髮：短的波浪捲
        c = cap(1.02, 1.5, 1.95, k=1.03)
        for pol, az in roots(70, lambda p, a: p < 1.35 - 0.3 * math.cos(a), 2):
            ph = rnd.random() * 6.28; side = Vector((math.cos(az), -math.sin(az), 0)) * 0 + Vector((-math.sin(az + 1.57), math.cos(az + 1.57), 0))
            S.append((grow(pol, az, 6, 0.022, lambda p, tt, ph=ph, side=side: (p - HEAD_C).normalized() * 0.3 + side * math.sin(ph + tt * 9) * 0.9 + Vector((0, 0, -0.3)), 1.02, 1.1), 0.022))
    elif t == 2:   # 往上梳油頭：前面往上往後翻、兩側往後服貼
        c = cap(1.05, 1.5, 1.92, k=1.02)
        for pol, az in roots(80, lambda p, a: p < 1.3 - 0.25 * math.cos(a), 3):
            front = max(0, math.cos(az)) * (1 if pol < 1.1 else 0)
            if front > 0.3:   # 前額：先往上翹再往後倒
                S.append((grow(pol, az, 7, 0.034, lambda p, tt: UP * (1.2 - tt * 1.4) + tang_back(p) * (0.4 + tt) , 1.02, 1.22), 0.026))
            else:
                S.append((grow(pol, az, 6, 0.032, lambda p, tt: tang_back(p) + UP * 0.15 - (p - HEAD_C).normalized() * 0.1, 1.01, 1.07), 0.024))
    elif t == 3:   # 頭帶短髮：短而往上
        c = cap(1.12, 1.5, 1.92, k=1.02)
        for pol, az in roots(45, lambda p, a: p < 0.95, 4):
            S.append((grow(pol, az, 4, 0.03, lambda p, tt: (p - HEAD_C).normalized() * 0.6 + UP * 0.7 + BACK * 0.2, 1.01, 1.12), 0.022))
    elif t == 4:   # 高馬尾：全部往綁髮處梳，馬尾往下垂
        c = cap(1.0, 1.55, 2.0, k=1.025, bangs=(4, 0.18)); tie = sph(0.95, math.pi, 1.08)
        for pol, az in roots(70, lambda p, a: p < 1.45 - 0.35 * math.cos(a), 5):
            S.append((grow(pol, az, 7, 0.05, lambda p, tt: (tie - p), 1.02, 1.05), 0.026))
        for i in range(14):
            a = rnd.random() * 6.28; rr = rnd.random() * 0.03; o = Vector((math.cos(a) * rr, 0, math.sin(a) * rr))
            S.append(([tie + o, tie + Vector((o.x, 0.09, 0.05 + o.z)), tie + Vector((o.x * 2, 0.16, -0.1)), tie + Vector((o.x * 2.4, 0.13, -0.3)), tie + Vector((o.x * 1.6 + (rnd.random() - 0.5) * 0.04, 0.08, -0.42 - rnd.random() * 0.05))], 0.02))
        for s in (-1, 1):
            for j in range(3): S.append(([sph(0.95, s * (0.9 + j * 0.06), 1.05), sph(1.35, s * (1.0 + j * 0.05), 1.1), sph(1.75, s * (0.98 + j * 0.04), 1.07), sph(2.0, s * (0.88 + j * 0.03), 1.0)], 0.014))
    elif t == 5:   # 雙辮子：中分往兩側梳到耳後
        c = cap(1.0, 1.62, 2.05, k=1.025, bangs=(6, 0.16), part=True)
        for s in (-1, 1):
            tie = sph(1.72, s * 1.85, 1.06)
            for pol, az in roots(40, lambda p, a, s=s: p < (1.5 if math.cos(a) < 0.4 else 0.95) and a * s > 0.04, 6 + s):
                S.append((grow(pol, az, 7, 0.05, lambda p, tt, tie=tie: tie - p, 1.02, 1.05), 0.026))
    elif t == 6:   # 長直髮：從頭頂順下來垂到背後，齊瀏海
        c = cap(1.0, 1.6, 1.95, k=1.025)
        for pol, az in roots(80, lambda p, a: p < 1.3 and abs(a) > 0.75, 7):
            S.append((grow(pol, az, 12, 0.055, lambda p, tt: Vector((0, 0.15, -1)) + (p - HEAD_C).normalized() * 0.25 * (1 - tt), 1.03, 1.1, hang=True), 0.03))
        for i in range(16):   # 齊瀏海
            az = (i / 15 - 0.5) * 1.7; S.append(([sph(0.3, az * 0.3, 1.02), sph(0.8, az * 0.85, 1.09), sph(1.12, az, 1.09), sph(1.2, az * 1.02, 1.06)], 0.022))
    else:   # 鮑伯頭：到下巴長度、髮尾往內收
        c = cap(1.0, 1.9, 2.1, k=1.03)
        for pol, az in roots(80, lambda p, a: p < 1.3 and abs(a) > 0.7, 8):
            S.append((grow(pol, az, 9, 0.045, lambda p, tt: Vector((0, 0.05, -1)) + (p - HEAD_C).normalized() * (0.35 - tt * 0.9), 1.03, 1.13), 0.032))
        for i in range(16):
            az = (i / 15 - 0.5) * 1.8; S.append(([sph(0.3, az * 0.3, 1.02), sph(0.8, az * 0.85, 1.1), sph(1.1, az, 1.1), sph(1.18, az * 1.02, 1.07)], 0.022))
    obs = [c]
    for pts, r0 in S:
        o = ribbon(pts, r0 * 1.45 * (0.85 + rnd.random() * 0.3), 0.009, uoff=rnd.random())
        if o: obs.append(o)
    uv = c.data.uv_layers.new(name='UVMap')
    for d in uv.data: d.uv = (rnd.random(), 0.05)   # 頭皮那層用髮根的暗色
    if t == 5:   # 辮子：一節一節
        for s in (-1, 1):
            tie = sph(1.72, s * 1.85, 1.06)
            for k in range(7):
                bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=1); sc = 1 - k * 0.06; sw = (k % 2 * 2 - 1) * 0.012
                for v in bm.verts: v.co = tie + Vector((v.co.x * 0.046 * sc + s * 0.012 + sw, v.co.y * 0.042 * sc + k * 0.004, v.co.z * 0.06 * sc - 0.045 - k * 0.056))
                lo = mesh_obj('lobe', bm); u2 = lo.data.uv_layers.new(name='UVMap')
                for i, d in enumerate(u2.data): d.uv = (rnd.random() * 0.2, 0.2 + 0.6 * (i % 7) / 7)
                obs.append(lo)
    select_only(*obs); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = f'hair_{t}'
    smooth(ob); ob.data.materials.clear(); ob.data.materials.append(hair_mat())
    extra = None
    if t == 3:
        bpy.ops.mesh.primitive_torus_add(major_radius=HEAD_R * 1.03, minor_radius=0.024, major_segments=72, minor_segments=12)
        band = bpy.context.view_layer.objects.active; band.name = 'headband_3'
        band.scale = (HS[0], HS[1], 1); band.rotation_euler = (-0.3, 0, 0); band.location = HEAD_C + Vector((0, 0.01, 0.1))
        select_only(band); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); smooth(band)
        band.data.materials.append(mat('accent', '#F07C24', 0.6)); extra = band
    return ob, extra
