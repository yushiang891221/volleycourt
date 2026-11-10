# 衣服：從身體網格「長」出來（依骨頭權重選區域 → 平面切出乾淨的邊 → 往外推 → 加厚度 → 複製身體的骨頭權重）
# 每件衣服兩個材質：cloth（主色，網頁依隊伍換色）、trim（滾邊）
import bpy, bmesh, math
from mathutils import Vector
from common import *
from common import _ss


def dominant(body):
    names = [g.name for g in body.vertex_groups]; out = []
    for v in body.data.vertices:
        best, bw = None, 0
        for g in v.groups:
            if g.weight > bw: best, bw = names[g.group], g.weight
        out.append(best or 'root')
    return out


ARM = {'upperarm.R': 'arm_u', 'upperarm.L': 'arm_u', 'forearm.R': 'arm_f', 'forearm.L': 'arm_f', 'hand.R': 'hand', 'hand.L': 'hand'}
REG = ['torso', 'arm_u', 'arm_f', 'hand', 'thigh', 'shin', 'foot']


def region(co, dom):
    # 球形關節版：身體每段整塊只跟一根骨頭，所以直接看這個點屬於哪根骨頭
    b = (dom or 'spine').split('.')[0]
    return {'upperarm': 'arm_u', 'forearm': 'arm_f', 'hand': 'hand', 'thigh': 'thigh', 'shin': 'shin', 'foot': 'foot'}.get(b, 'torso')


def make(body, name, keep, cuts, gap, thick=0.007, flare=None, trim_w=0.018, colors=('cloth', 'trim'), cols=('#F07C24', '#1C1C21'), extra=None, plain=False):
    """keep：留下哪些區域；cuts：[(平面點, 平面法線(切掉那側), 只切哪些區域 or None, 這條邊要不要滾邊)]"""
    dom = dominant(body)
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    L = bm.verts.layers.int.new('reg'); BL = bm.verts.layers.int.new('bone'); BN = list(JOINTS.keys())
    for v in bm.verts: v[L] = REG.index(region(v.co, dom[v.index])); v[BL] = BN.index(dom[v.index]) if dom[v.index] in BN else BN.index('spine')
    ok = {REG.index(r) for r in keep}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v[L] in ok for v in f.verts)], context='FACES')
    trims = []
    for co, no, only, trim in cuts:
        fn = only if callable(only) else None
        oid = None if (only is None or fn) else {REG.index(r) for r in only}
        sel = lambda f: (fn(f.calc_center_median()) if fn else (oid is None or all(v[L] in oid for v in f.verts)))
        geom = [f for f in bm.faces if sel(f)]
        if not geom: continue
        g = list(set(geom + [e for f in geom for e in f.edges] + [v for f in geom for v in f.verts]))
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=co, plane_no=no, clear_outer=True)
        if trim:
            trims.append((Vector(co), Vector(no)))
        if trim and not plain:
            geom = [f for f in bm.faces if sel(f)]
            g = list(set(geom + [e for f in geom for e in f.edges] + [v for f in geom for v in f.verts]))
            bmesh.ops.bisect_plane(bm, geom=g, plane_co=Vector(co) - Vector(no).normalized() * trim_w, plane_no=no)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0008, edges=bm.edges[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # 只留夠大的塊（去掉切剩的小碎片）
    seen, best = set(), set()
    for f in bm.faces:
        if f in seen: continue
        comp, st = [], [f]; seen.add(f)
        while st:
            x = st.pop(); comp.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y not in seen: seen.add(y); st.append(y)
        if len(comp) > 40: best.update(comp)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in best], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    edge = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    for _ in range(12):
        new = {}
        for v in edge:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2: new[v] = v.co * 0.4 + (nb[0].co + nb[1].co) * 0.3
        for v, c in new.items(): v.co = c
    bm.verts.index_update(); edge_idx = {v.index for v in edge}
    bm.normal_update()
    # 滾邊：切口和第二刀之間的面（只算靠近該切口邊界的，避免誤判到別處）
    for f in bm.faces: f.material_index = 0
    for co, no in ([] if plain else trims):
        nn = Vector(no).normalized()
        edge_v = {v for e in bm.edges if e.is_boundary for v in e.verts if abs((v.co - co).dot(nn)) < 0.003}
        near = set(edge_v)
        for _ in range(10): near |= {e.other_vert(v) for v in list(near) for e in v.link_edges}
        for f in bm.faces:
            if all(v in near for v in f.verts) and -trim_w - 0.001 < (f.calc_center_median() - co).dot(nn) <= 0.001: f.material_index = 1
    # 往外推的方向先平均（身體網格是不規則三角形，直接用會推出毛邊）
    nm = {v: v.normal.copy() for v in bm.verts}
    for _ in range(5):
        nm = {v: (nm[v] + sum((nm[e.other_vert(v)] for e in v.link_edges), Vector())).normalized() for v in bm.verts}
    # 往外推：靠近滾邊切口加一點喇叭
    for v in bm.verts:
        g = gap
        if flare:
            for co, no in trims: g += flare * max(0, 1 - abs((v.co - co).dot(no)) / 0.06)
        if extra: g += extra(v.co)
        v.co += nm[v] * g
    for _ in range(8):   # 推完再把邊界拉直一次
        new = {}
        for v in edge:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2: new[v] = v.co * 0.4 + (nb[0].co + nb[1].co) * 0.3
        for v, c in new.items(): v.co = c
    dl = bm.verts.layers.deform.active   # 身體原本的權重資料不要帶到衣服上（下面會照段落重新設定）
    if dl: bm.verts.layers.deform.remove(dl)
    ob = mesh_obj(name, bm)
    ob.data.materials.append(mat(colors[0], cols[0], 0.78)); ob.data.materials.append(mat(colors[1], cols[1], 0.75))
    # 骨頭權重直接照來源那段身體：手腳整塊一根骨頭；軀幹依高度在 spine／root 漸變（跟身體一樣），衣服和身體完全一起動
    att = ob.data.attributes.get('bone'); G = {}
    for v in ob.data.vertices:
        bn = BN[att.data[v.index].value] if att else 'spine'
        if bn in ('spine', 'root'):
            t = max(0.0, min(1.0, (v.co.z - HIP_H) / 0.24)); t = t * t * (3 - 2 * t)
            for n_, w_ in (('spine', t), ('root', 1 - t)):
                if w_ > 0: (G.get(n_) or G.setdefault(n_, ob.vertex_groups.new(name=n_))).add([v.index], w_, 'REPLACE')
        elif limb_weights(v.co, bn) if '.' in bn else None:   # 手臂／腿：跟身體一樣平滑過渡（袖子、褲管在手肘膝蓋跟著彎）
            for n_, w_ in limb_weights(v.co, bn).items():
                if w_ > 0.001: (G.get(n_) or G.setdefault(n_, ob.vertex_groups.new(name=n_))).add([v.index], w_, 'REPLACE')
        else:
            (G.get(bn) or G.setdefault(bn, ob.vertex_groups.new(name=bn))).add([v.index], 1.0, 'REPLACE')
    inner = ob.vertex_groups.new(name='inner'); inner.add([v.index for v in ob.data.vertices if v.index not in edge_idx], 1.0, 'REPLACE')
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 9; sm.vertex_group = 'inner'   # 邊界不參與平滑，切口保持乾淨
    apply_mods(ob)
    push_out(ob, body, min(gap, 0.006))   # 平滑會把肩膀、脖子這些凸的地方磨得往內縮：身體會從領口邊緣冒出小三角形，推回身體外面
    so = ob.modifiers.new('so', 'SOLIDIFY'); so.thickness = thick; so.offset = -1; so.use_even_offset = False; so.material_offset_rim = 0 if plain else 1
    apply_mods(ob); smooth(ob); sharp_rims(ob)
    return ob


def push_out(ob, body, clear):
    """衣服每一點至少在身體外面 clear 公尺（照最近的身體表面法線推出去）"""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for v in ob.data.vertices:
        hit = tree.find_nearest(v.co)
        if hit[0] is None: continue
        d = (v.co - hit[0]).dot(hit[1])
        if d < clear: v.co += hit[1] * (clear - d)
    ob.data.update()


def sharp_rims(ob, ang=0.9):
    """加厚後的切口（領口、袖口、下擺、褲頭）直角邊標硬邊：外面那圈自己打光，不會被邊緣法線帶出鋸齒亮紋"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > ang: e.smooth = False
    bm.to_mesh(ob.data); bm.free()


def tops(body, sex):
    out = []
    near = lambda c: (c.x ** 2 + (c.y - 0.01) ** 2) ** 0.5 < 0.13 and c.z > 0.93
    neck = [((0, -0.02, 1.03), (0, -0.35, 1), near, True)]   # 前低後高（真的球衣是前面 V 領較低、背後較高）
    loose = lambda co: 0.003 * max(0, min(1, (0.9 - co.z) / 0.25)) + 0.01 * max(0, min(1, (0.78 - co.z) / 0.1))   # 下半身寬鬆、褲頭那段離身體多一點（不會被短褲穿出來）
    for kind in range(4):   # 0 無袖 1 短袖 2 長袖 3 短版
        keep = {'torso', 'arm_u'} | ({'arm_f'} if kind == 2 else set())
        hem_z = 0.8 if kind == 3 else 0.58   # 球形關節版舉手不會拉起球衣，下擺不用太長（太長蹲低時大腿會頂出來）
        cuts = neck + [((0, 0, hem_z), (0, 0, -1), {'torso'}, True)]
        if kind == 0:
            for s in (-1, 1): cuts.append(((s * 0.2, 0, 0.98), (s, 0, 0.35), {'torso', 'arm_u'}, True))
        elif kind in (1, 3):
            for s in (-1, 1): cuts.append((tuple(arm_pt(s, 0.1 if kind == 3 else 0.125)), tuple(arm_dir(s)), (lambda c, s=s: arm_dist(c) < 0.1 and c.x * s > 0.12), True))
        else:
            for s in (-1, 1): cuts.append((tuple(arm_pt(s, UA + FA - 0.035)), tuple(arm_dir(s)), (lambda c, s=s: arm_dist(c) < 0.1 and c.x * s > 0.12), True))
        ob = make(body, f'top_{kind}', keep, cuts, 0.009, flare=0.005, extra=loose, plain=True)   # 貼身一點（之前看起來胖）
        import jersey as J
        # 下擺綁在骨盆：腰以下的頂點逐漸改成只跟 root 動（舉手時下擺留在褲頭上，不露腰）
        vg = {g.name: g for g in ob.vertex_groups}
        if 'root' not in vg: vg['root'] = ob.vertex_groups.new(name='root')
        for v in ob.data.vertices:
            z = v.co.z
            if z > 0.74: continue
            snap = [(g.group, g.weight) for g in v.groups]
            if any(ob.vertex_groups[gi].name.startswith(('upperarm', 'forearm', 'hand')) for gi, w in snap): continue   # 袖子（長袖手腕比腰低）不能綁到骨盆
            k = min(1, max(0, (0.74 - z) / 0.12))
            for gi, w in snap:
                ob.vertex_groups[gi].add([v.index], w * (1 - k), 'REPLACE')
            vg['root'].add([v.index], k + sum(w for gi, w in snap if ob.vertex_groups[gi].name == 'root') * (1 - k), 'REPLACE')
        # 改成 A 字姿勢後，袖子和衣身保持相連、權重平滑過渡（rigid_sleeves 會在肩膀留下切口，舉手時破圖）
        collar = neck_trim(ob)
        J.unwrap(ob); ob.data.materials.clear(); ob.data.materials.append(J.kit_material('kit_orange', J.kit_image('kit_orange', '#F07C24', '#1C1C21', '#FFFFFF', 10, '#1C1C21')))
        out.append(ob)
        if collar: collar.name = f'collar_{kind}'; out.append(collar)
    return out


def _shell(name, nodes, edges, top_z, hem_z, thick, body=None):
    """用 Skin 修改器做一整塊平滑的褲子（腰→骨盆→兩條褲管），切掉上下開口、加厚度。沒有分層、沒有接縫"""
    K = 1.32
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p, _, _ in nodes], edges, [])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    m = ob.modifiers.new('skin', 'SKIN'); m.use_smooth_shade = True
    for i, (_, rx, ry) in enumerate(nodes): me.skin_vertices[0].data[i].radius = (rx * K, ry * K)
    me.skin_vertices[0].data[0].use_root = True
    sd = ob.modifiers.new('sub', 'SUBSURF'); sd.levels = 3; apply_mods(ob)   # 夠細：膝蓋彎的時候大面不會切進腿裡
    bm = bmesh.new(); bm.from_mesh(ob.data)
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=(0, 0, top_z), plane_no=(0, 0, 1), clear_outer=True)
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=(0, 0, hem_z), plane_no=(0, 0, -1), clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    edge = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    for _ in range(6):   # 開口邊拉順
        new = {}
        for v in edge:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2: new[v] = Vector((v.co.x * 0.4 + (nb[0].co.x + nb[1].co.x) * 0.3, v.co.y * 0.4 + (nb[0].co.y + nb[1].co.y) * 0.3, v.co.z))
        for v, c in new.items(): v.co = c
    if body is not None:   # 褲頭像鬆緊帶：最上面 3.5 cm 往內收到身體外 1.1 cm（加厚度後內面離身體約 4 mm）——蹲下從上面看不到褲頭和身體之間的縫
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get(); tree = BVHTree.FromObject(body, dg)
        for v in bm.verts:
            w = _ss(v.co.z, top_z - 0.035, top_z - 0.005)
            r = math.hypot(v.co.x, v.co.y)
            if w <= 0 or r < 1e-4: continue
            d = Vector((v.co.x / r, v.co.y / r, 0)); hit = tree.ray_cast(Vector((0, 0, v.co.z)), d)
            if hit[0] is None: continue
            rb = hit[3]; nr = r - max(0.0, r - (rb + 0.011)) * w
            v.co.x, v.co.y = d.x * nr, d.y * nr
    bm.to_mesh(ob.data); bm.free()
    # 權重：腰以上照身體（spine/root 漸變）；褲管從髖往下漸漸改跟大腿（長褲再照膝蓋分大腿/小腿）
    G = {}
    def add(n, i, w):
        if w > 0.001: (G.get(n) or G.setdefault(n, ob.vertex_groups.new(name=n))).add([i], w, 'REPLACE')
    for v in ob.data.vertices:
        c = v.co; side = 'L' if c.x > 0 else 'R'
        back = max(0.0, min(1.0, c.y / 0.1))   # 屁股那側（+Y）早一點跟大腿動：蹲下時褲子後面整片撐開，不會在褲管口夾成一條
        wl = _ss(HIP_H + 0.02 + 0.08 * back - c.z, 0.0, 0.1 + 0.06 * back) * _ss(abs(c.x), 0.0, 0.035)
        t = _ss(c.z, HIP_H, HIP_H + 0.24)
        add('spine', v.index, (1 - wl) * t); add('root', v.index, (1 - wl) * (1 - t))
        for n, w in limb_weights(c, f'thigh.{side}').items(): add(n, v.index, wl * w)
    ob.data.materials.append(mat('pants', '#1C1C21', 0.78)); ob.data.materials.append(mat('ptrim', '#F07C24', 0.75))
    so = ob.modifiers.new('so', 'SOLIDIFY'); so.thickness = thick; so.offset = -1; so.use_even_offset = False
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.4; sm.iterations = 3
    apply_mods(ob); smooth(ob); sharp_rims(ob)   # 褲頭、褲管口的直角邊標成硬邊
    return ob


def pants(body, sex=0):
    F = sex == 1; f = 0.86 if F else 1.0
    def legs(g, long):
        x = 0.095; out = []
        for s in (-1, 1):
            out += [((s * x, 0, HIP_H - 0.02), 0.1 * f * (1.03 if F else 1) + g, 0.098 * f + g), ((s * x, 0, HIP_H - 0.08), 0.092 * f + g, 0.09 * f + g)]
            if long: out += [((s * x, -0.004, HIP_H - L1), 0.062 * f + g, 0.062 * f + g), ((s * x, 0.012, HIP_H - L1 - 0.08), 0.064 * f + g, 0.068 * f + g), ((s * x, 0, 0.05), 0.04 * f + g, 0.042 * f + g)]
            else: out += [((s * x, 0, HIP_H - 0.22), 0.068 * f + g, 0.068 * f + g)]
        return out
    res = []
    for kind, g, hem in ((0, 0.016, HIP_H - 0.16), (1, 0.022, 0.11)):
        # 兩條褲管直接從腰分出去（中間不放骨盆節點：那裡會多一團，蹲下時從褲底凸出來）
        # 褲頭要比腰那圈身體寬一點（男生側面原本窄 1.4 公分、女生前後只差 1～2 公釐）：身體才不會從褲頭穿出來變鋸齒
        top = [((0, 0, HIP_H + 0.13), (0.155 * 0.62 + 0.014 if F else 0.185) + g, (0.122 * 0.84 + 0.016 if F else 0.134) + g)]
        lg = legs(g, kind == 1); n = len(lg) // 2
        nodes = top + lg
        edges = []
        for side in range(2):
            b = 1 + side * n; edges += [(0, b)] + [(b + i, b + i + 1) for i in range(n - 1)]
        res.append(_shell(f'pants_{kind}', nodes, edges, HIP_H + 0.1, hem, 0.007, body))
    return res


def hide_under_pants(body):
    """短褲和長褲都會蓋住的那段身體直接刪掉：蹲低時褲子怎麼彎都不會被身體穿出來"""
    names = {g.index: g.name for g in body.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(body.data); dl = bm.verts.layers.deform.active
    def gone(v):
        ws = v[dl] if dl else {}
        dom = names.get(max(ws.items(), key=lambda kv: kv[1])[0], '') if ws else ''
        if dom.startswith(('upperarm', 'forearm', 'hand')): return False
        if dom.startswith('thigh'): return v.co.z > HIP_H - 0.06   # 大腿留到褲管裡面一段：蹲下時從褲管口看進去不會透空
        return HIP_H - 0.13 < v.co.z < HIP_H + 0.05   # 褲頭在 HIP_H+0.1：裡面留 5 公分身體，蹲下從褲頭往裡看是皮膚、不是切口
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(gone(v) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data); bm.free(); body.data.update()


def kneepads(body):
    out = []
    for kind in (0, 1):
        ob = make(body, f'knee_{kind}', {'thigh', 'shin'},
                  [((0, 0, HIP_H - L1 + 0.06), (0, 0, 1), None, False), ((0, 0, HIP_H - L1 - 0.065), (0, 0, -1), None, False)], 0.016, thick=0.012, colors=('pad' + str(kind), 'pad' + str(kind)), cols=(('#24262C', '#F2F2EE')[kind],) * 2, plain=True)
        out.append(ob)
    return out


def socks(body):
    return make(body, 'socks', {'shin', 'foot'}, [((0, 0, 0.19), (0, 0, 1), None, True)], 0.004, thick=0.004, colors=('sock', 'sock2'), cols=('#F6F6F2', '#F6F6F2'), plain=True)


def shoes():
    out = []
    for s, n in ((-1, 'R'), (1, 'L')):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts: v.co = Vector((v.co.x * 0.125, v.co.y * 0.22, v.co.z * 0.11))
        ob = mesh_obj('shoe' + n, bm)
        sd = ob.modifiers.new('sd', 'SUBSURF'); sd.levels = 3; apply_mods(ob)
        bm = bmesh.new(); bm.from_mesh(ob.data)
        for v in bm.verts:   # 鞋頭圓、鞋跟收、鞋底平
            c = v.co
            if c.y < 0: c.z += 0.012 * (c.y / -0.1) ** 2 * (1 if c.z > 0 else -0.2)
            if c.z < -0.03: c.z = -0.03 + (c.z + 0.03) * 0.3
        bm.to_mesh(ob.data); bm.free()
        ob.location = (s * 0.095, -0.035, 0.05); select_only(ob); bpy.ops.object.transform_apply(location=True)
        ob.data.materials.append(mat('shoe', '#E0483E', 0.5)); ob.data.materials.append(mat('sole', '#F4F4F0', 0.6))
        for p in ob.data.polygons:
            if p.center.z < 0.022: p.material_index = 1
        smooth(ob); out.append((ob, 'foot.' + n))
    a, b = out
    return a, b


def rigid_sleeves(ob):
    """袖子和衣身在肩膀接縫分開：袖子 100% 跟手臂、衣身不受手臂影響（舉手不會把布扯開）"""
    import jersey as J
    me = ob.data; arm = [J.is_arm(v.co) for v in me.vertices]
    names = {g.index: g.name for g in ob.vertex_groups}
    for n in ('upperarm.R', 'upperarm.L', 'forearm.R', 'forearm.L', 'spine'):
        if n not in [g.name for g in ob.vertex_groups]: ob.vertex_groups.new(name=n)
    G = {g.name: g for g in ob.vertex_groups}
    for v in me.vertices:
        snap = [(names.get(g.group, ob.vertex_groups[g.group].name), g.weight) for g in v.groups]
        for g in list(v.groups): ob.vertex_groups[g.group].remove([v.index])
        if arm[v.index]:
            side = 'L' if v.co.x > 0 else 'R'; bone = ('forearm.' if v.co.z < SH_Z - UA else 'upperarm.') + side
            G[bone].add([v.index], 1.0, 'REPLACE')
        else:
            keep = [(n, w) for n, w in snap if n.split('.')[0] not in ('upperarm', 'forearm', 'hand')]; tot = sum(w for _, w in keep)
            if tot <= 0: G['spine'].add([v.index], 1.0, 'REPLACE')
            else:
                for n, w in keep: G[n].add([v.index], w / tot, 'REPLACE')
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    cut = [e for e in bm.edges if arm[e.verts[0].index] != arm[e.verts[1].index]]
    bmesh.ops.split_edges(bm, edges=cut); bm.to_mesh(me); bm.free()


def neck_trim(ob, r=0.011, color='#1C1C21'):
    """沿領口邊界做一圈圓滑的滾邊條（取代畫在貼圖上的領口色，邊緣乾淨）"""
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    edges = [e for e in bm.edges if e.is_boundary and all(v.co.z > 0.93 and (v.co.x ** 2 + (v.co.y - 0.01) ** 2) ** 0.5 < 0.17 for v in e.verts)]
    if not edges: bm.free(); return None
    # 找出最長的一圈：從任一邊界點沿邊界走
    adj = {}
    for e in edges:
        a, b = e.verts; adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    start = max(adj, key=lambda v: v.co.y); loop = [start]; prev = None; cur = start
    for _ in range(len(adj) + 2):
        nx = [w for w in adj[cur] if w is not prev]
        if not nx: break
        prev, cur = cur, nx[0]
        if cur is start: break
        loop.append(cur)
    pts = [v.co.copy() for v in loop]; bm.free()
    if len(pts) < 8: return None
    for _ in range(6): pts = [pts[i] * 0.5 + (pts[i - 1] + pts[(i + 1) % len(pts)]) * 0.25 for i in range(len(pts))]
    cu = bpy.data.curves.new('collar', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 4; cu.resolution_u = 4
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p_, c in zip(sp.points, pts): p_.co = (c.x, c.y, c.z + 0.004, 1)
    sp.use_cyclic_u = True
    co = bpy.data.objects.new('collar', cu); bpy.context.collection.objects.link(co)
    select_only(co); bpy.ops.object.convert(target='MESH'); co = bpy.context.view_layer.objects.active; smooth(co)
    co.data.materials.append(mat('collar', color, 0.6))
    vg = co.vertex_groups.new(name='spine'); vg.add(list(range(len(co.data.vertices))), 1.0, 'REPLACE')
    return co
