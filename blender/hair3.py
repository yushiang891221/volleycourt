# 頭髮第 3 版：有厚度的頭髮主體（撐出份量）＋從主體長出的大髮塊（外凸內平、根窄中寬、尾端圓尖微翹）
# 光澤：低粗糙度＋透明塗層。先做參考圖的男生側分髮型（style 'sweep'）
import bpy, bmesh, math, random
from mathutils import Vector
from common import *
from hair import sph, HS

C0 = HEAD_C


def frame_at(p, t_vec):
    n = (p - C0).normalized()
    if abs(n.dot(t_vec)) > 0.97: n = Vector((0, 0, 1)) if abs(t_vec.z) < 0.9 else Vector((1, 0, 0))   # 髮塊朝外長時避免退化
    n = (n - t_vec * n.dot(t_vec)).normalized(); b = t_vec.cross(n).normalized()
    return n, b


POP_W, POP_T = 1.3, 1.6   # 泡泡瑪特風：髮束粗大


def chunk(ctrl, w0, th0, curl=0.02, seg=24, ring=14, root_w=0.5):
    w0 *= POP_W; th0 *= POP_T
    """一片髮塊：ctrl 是頭表面的控制點（Vector）。橫切面外凸內平（瓦片狀），寬 w0、厚 th0；尾端收圓尖、往外微翹 curl"""
    from mathutils import geometry
    pts = [ctrl[0]] + ctrl + [ctrl[-1]]
    path = []
    for i in range(1, len(pts) - 2):   # Catmull-Rom
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(8):
            u = k / 8
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    path.append(ctrl[-1])
    # 依弧長重新取樣
    L = [0]
    for a, b in zip(path, path[1:]): L.append(L[-1] + (b - a).length)
    tot = L[-1]; samp = []
    for i in range(seg + 1):
        s = tot * i / seg; j = max(0, min(len(L) - 2, next((k for k in range(len(L) - 1) if L[k + 1] >= s), len(L) - 2)))
        f = (s - L[j]) / max(1e-6, L[j + 1] - L[j]); samp.append(path[j].lerp(path[j + 1], f))
    bm = bmesh.new(); rings = []; CL = bm.verts.layers.float_color.new('Col')
    for i, p in enumerate(samp):
        t = i / seg
        tv = (samp[min(seg, i + 1)] - samp[max(0, i - 1)]).normalized()
        n, b = frame_at(p, tv)
        width = w0 * (root_w + (1 - root_w) * math.sin(min(1, t / 0.35) * math.pi / 2)) * (1 - t ** 2.4) ** 0.6
        thick = th0 * (1 - t ** 1.8) ** 0.7 + 0.002
        p = p + n * (curl * t ** 3)   # 尾端往外翹
        r = []
        for j in range(ring):
            a = j / ring * 2 * math.pi; ca, sa = math.cos(a), math.sin(a)
            out = (sa if sa > 0 else sa * 0.35) * thick   # 外凸內平
            vv = bm.verts.new(p + b * ca * width + n * out)
            ao = (0.45 + 0.55 * min(1, t / 0.55) ** 0.8) * (1.0 if sa > -0.2 else 0.7) * (0.85 + 0.15 * abs(ca) ** 0.5 if sa > 0 else 1)
            vv[CL] = (ao, ao, ao, 1); r.append(vv)
        rings.append(r)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % ring], rings[i + 1][(j + 1) % ring], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(samp[-1] + (samp[-1] - samp[-2]).normalized() * 0.004); tip[CL] = (1, 1, 1, 1)
    for j in range(ring): bm.faces.new((rings[-1][j], rings[-1][(j + 1) % ring], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_obj('chunk', bm)


def volume(front, side, back, k_top=1.16, k_edge=1.02, p=1.6):   # p 越大：越晚才收進頭皮（女生髮型用 4，包到後頸）
    """頭髮主體：從頭頂到髮線的厚殼，頭頂撐最高、往髮線慢慢收進頭皮，底下封住（看不到空心）"""
    NA, NT = 96, 36; bm = bmesh.new(); outer = []; CL = bm.verts.layers.float_color.new('Col')
    def H(az):
        c = math.cos(az); return side + (front - side) * c if c > 0 else side + (back - side) * -c
    for i in range(NA):
        az = -math.pi + i / NA * 2 * math.pi; h = H(az); col = []
        for j in range(NT + 1):
            t = j / NT; pol = max(1e-3, t * h)
            k = k_edge + (k_top - k_edge) * (1 - t ** p) ** 1.2
            col.append(bm.verts.new(sph(pol, az, k)))
        outer.append(col)
    inner = [[bm.verts.new(sph(max(1e-3, j / NT * H(-math.pi + i / NA * 2 * math.pi)), -math.pi + i / NA * 2 * math.pi, 0.985)) for j in range(NT + 1)] for i in range(NA)]
    for i in range(NA):
        a, b = outer[i], outer[(i + 1) % NA]; ia, ib = inner[i], inner[(i + 1) % NA]
        for j in range(NT):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j])); bm.faces.new((ib[j], ib[j + 1], ia[j + 1], ia[j]))
        bm.faces.new((a[NT], ia[NT], ib[NT], b[NT]))
    for v in bm.verts: v[CL] = (0.62, 0.62, 0.62, 1)   # 主體顏色接近髮色（太暗會從髮塊縫隙露出深色）
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_obj('vol', bm); sd = ob.modifiers.new('sd', 'SUBSURF'); sd.levels = 1; apply_mods(ob)
    return ob


def S(pol, az, k): return sph(pol, az, k)


def style_sweep():
    """參考圖：男生蓬鬆側分（往角色左邊梳），前面有一撮斜蓋額頭，耳上有短髮塊"""
    rnd = random.Random(11); P = [volume(0.82, 1.2, 1.6, k_top=1.15, k_edge=0.97)]   # 主體縮在髮塊底下，邊緣提早收進頭皮，看不到切邊
    # 太陽穴兩側：補髮塊蓋住主體縮小後的空隙
    for s in (-1, 1):
        for j in range(3):
            az = s * (0.75 + j * 0.22)
            P.append(chunk([S(0.55, az * 0.8, 1.14), S(0.95, az, 1.13), S(1.3, az + s * 0.05, 1.07), S(1.5 + 0.05 * j, az + s * 0.08, 1.02)], 0.07, 0.032, curl=0.012))
    # 後腦：從頭頂往後往下，貼著主體
    for i in range(9):
        az = math.pi + (i - 4) * 0.36
        P.append(chunk([S(0.25, az * 0.6, 1.13), S(0.95, az, 1.13), S(1.45, az, 1.08), S(1.85, az + 0.05, 1.03)], 0.075, 0.03, curl=0.012))
    # 頭頂：從分線（右邊）往左側、往後梳，蓬起來
    part = -0.55
    for i in range(7):
        a0 = part + 0.05; a1 = 0.2 + i * 0.32
        P.append(chunk([S(0.55, part - 0.05, 1.12), S(0.32, (part + a1) * 0.45, 1.2 + 0.01 * (i % 2)), S(0.7, a1, 1.19), S(1.2, a1 + 0.15, 1.12), S(1.45, a1 + 0.25, 1.06)], 0.085, 0.04, curl=0.02))
    # 分線右側：短短往右下
    for i in range(3):
        a1 = part - 0.35 - i * 0.3
        P.append(chunk([S(0.6, part, 1.12), S(0.95, a1, 1.14), S(1.35, a1 - 0.05, 1.08)], 0.075, 0.035, curl=0.02))
    # 前面瀏海：從頭頂往前、斜斜蓋到額頭左邊，尾端翹
    for i, (az0, az1, e) in enumerate([(-0.3, 0.15, 1.06), (-0.1, 0.45, 1.04), (0.1, 0.7, 1.02), (-0.45, -0.15, 1.02)]):
        P.append(chunk([S(0.45, az0 * 0.5, 1.18), S(0.75, az0, 1.2), S(e - 0.15, (az0 + az1) / 2, 1.17), S(e, az1, 1.12)], 0.075, 0.035, curl=0.03))
    # 耳朵上方：短髮塊往下
    for s in (-1, 1):
        for j in range(2):
            az = s * (1.25 + j * 0.3)
            P.append(chunk([S(1.0, az, 1.1), S(1.35, az + s * 0.05, 1.06), S(1.62, az + s * 0.1, 1.02)], 0.055, 0.025, curl=0.008))
    # 頭頂幾撮翹起來的（亂中有序）
    for i in range(3):
        az = 0.3 + i * 0.5
        P.append(chunk([S(0.5, az, 1.18), S(0.35, az + 0.4, 1.28), S(0.45, az + 0.8, 1.3)], 0.05, 0.03, curl=0.03))
    for o in P:
        if o.name.startswith('chunk'):
            sd = o.modifiers.new('sd', 'SUBSURF'); sd.levels = 1; apply_mods(o)
    select_only(*P); bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = 'hair_sweep'; smooth(ob)
    return ob


def glossy_hair_mat(color='#4A2E22'):   # 軟膠亮面：低粗糙度＋透明塗層＋一點透光
    m = mat('hair3', color, 0.24)
    b = m.node_tree.nodes['Principled BSDF']; nt = m.node_tree
    if not any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        A = [i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'][0]; Bi = [i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA'][0]; Ro = [o for o in mix.outputs if o.type == 'RGBA'][0]
        A.default_value = b.inputs['Base Color'].default_value[:]
        nt.links.new(vc.outputs['Color'], Bi); nt.links.new(Ro, b.inputs['Base Color'])
    for k, v in (('Coat Weight', 0.7), ('Coat Roughness', 0.08), ('Subsurface Weight', 0.12), ('Subsurface Scale', 0.02), ('Specular IOR Level', 0.65)):
        if k in b.inputs: b.inputs[k].default_value = v
    return m


def angel_ring(ob, band_z=None, width=0.045, gain=0.9):
    import math
    me = ob.data; col = me.color_attributes.get('Col')
    if not col: return
    z0 = HEAD_C.z + 0.13 if band_z is None else band_z
    for v in me.vertices:
        n = v.normal; c = v.co
        if n.z < 0.05: continue
        f = math.exp(-((c.z - z0) / width) ** 2) * min(1, n.z * 1.6) * max(0, (c - HEAD_C).normalized().dot(n))
        if f > 0.01:
            r, g, b, a = col.data[v.index].color; k = 1 + gain * f; col.data[v.index].color = (min(1.6, r * k), min(1.6, g * k), min(1.6, b * k), a)
