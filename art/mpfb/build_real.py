# 寫實身體＋簡單臉（給貼圖五官）＋球衣球褲球鞋，輸出 glb 給網頁捏臉測試頁。
# 用法：blender --background --factory-startup -t 4 --python build_real.py -- m|f
import bpy, bmesh, os, sys, math, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import addon_utils
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SHOTS = os.path.join(HERE, "..", "shots")
OUT = os.path.join(ROOT, "assets", "models")
DATA = LocationService.get_user_data()

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SEX = argv[0] if argv else "m"
M = SEX == "m"

HAIRS = ["short02", "short04", "short01", "short03", "afro01", "ponytail01", "bob01", "bob02", "braid01", "long01"]
SKIN = ("young_asian_male", "young_asian_male.mhmat") if M else ("young_asian_female", "young_asian_female.mhmat")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

macro = {
    "gender": 1.0 if M else 0.0, "age": 0.5,
    "muscle": 0.88 if M else 0.72, "weight": 0.55 if M else 0.5,
    "proportions": 1.0, "height": 1.0 if M else 0.9,
    "cupsize": 0.5 if M else 0.8, "firmness": 0.5 if M else 0.75,
    "race": {"asian": 0.8, "caucasian": 0.15, "african": 0.05},
}
body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
if not M:
    # 女生：胸部間距調近（不然乳溝太寬）
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    TargetService.load_target(body, os.path.join(LocationService.get_mpfb_data("targets"), "breast", "breast-dist-decr.target.gz"), weight=0.85)
from bl_ext.user_default.mpfb.services.targetservice import TargetService as _TS
for _side in "lr":
    _TS.load_target(body, os.path.join(LocationService.get_mpfb_data("targets"), "eyes", f"{_side}-eye-scale-incr.target.gz"), weight=1.0)
# 手腕、前臂下半段加粗（使用者：手腕那一塊太細）。女生加少一點
_TD = LocationService.get_mpfb_data("targets")
_TS.load_target(body, os.path.join(_TD, "hands", "measure-wrist-circ-incr.target.gz"), weight=1.0 if M else 0.6)
for _side in "lr":
    _TS.load_target(body, os.path.join(_TD, "arms", f"{_side}-lowerarm-muscle-incr.target.gz"), weight=0.8 if M else 0.45)
    for _ax in ("horiz", "depth"):   # 前臂整段再粗一點（使用者第二次要求加粗）
        _TS.load_target(body, os.path.join(_TD, "arms", f"{_side}-lowerarm-scale-{_ax}-incr.target.gz"), weight=0.3 if M else 0.15)
# 臉往「寫實偏日系」調（使用者參考圖：眼睛大一點、鼻子小、嘴唇薄、下巴俐落、年輕）
FACE_STYLE = [
    ("head", "head-age-decr", 0.5), ("head", "head-oval", 0.4), ("chin", "chin-width-decr", 0.35),
    ("nose", "nose-scale-horiz-decr", 0.5), ("nose", "nose-flaring-decr", 0.5), ("nose", "nose-volume-decr", 0.4),
    ("nose", "nose-nostrils-width-decr", 0.4), ("nose", "nose-point-width-decr", 0.4),
    ("mouth", "mouth-scale-horiz-decr", 0.25), ("mouth", "mouth-lowerlip-volume-decr", 0.8), ("mouth", "mouth-upperlip-volume-decr", 0.8), ("mouth", "mouth-scale-vert-decr", 0.3),
    ("mouth", "mouth-lowerlip-height-decr", 0.3),
]
for _side in "lr":
    FACE_STYLE += [("eyes", f"{_side}-eye-height1-incr", 0.4), ("eyes", f"{_side}-eye-height2-incr", 0.6), ("eyes", f"{_side}-eye-height3-incr", 0.3),
                   ("eyes", f"{_side}-eye-trans-in", 0.25),
                   ("cheek", f"{_side}-cheek-volume-decr", 0.3)]
for _dir, _name, _w in FACE_STYLE:
    _TS.load_target(body, os.path.join(_TD, _dir, _name + ".target.gz"), weight=_w)
rig = HumanService.add_builtin_rig(body, "game_engine")
hair_objs = []
for h in HAIRS:
    before = set(bpy.data.objects)
    HumanService.add_mhclo_asset(os.path.join(DATA, "hair", h, h + ".mhclo"), body, asset_type="Hair", subdiv_levels=0)
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in new:
        o.name = "hair_" + h
        hair_objs.append((h, o))
before = set(bpy.data.objects)
HumanService.add_mhclo_asset(os.path.join(DATA, "clothes", "shoes05", "shoes05.mhclo"), body, asset_type="Clothes", subdiv_levels=0)
shoes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"][0]
shoes.name = "shoes"
BROWS = ["eyebrow001", "eyebrow004", "eyebrow006", "eyebrow008", "eyebrow010", "eyebrow012"]
def add_one(path, kind, name, subdiv=0):
    before = set(bpy.data.objects)
    HumanService.add_mhclo_asset(path, body, asset_type=kind, subdiv_levels=subdiv)
    o = [x for x in bpy.data.objects if x not in before and x.type == "MESH"][0]
    o.name = name
    return o
eyes = add_one(os.path.join(DATA, "eyes", "high-poly", "high-poly.mhclo"), "Eyes", "eyes")
lashes = add_one(os.path.join(DATA, "eyelashes", "eyelashes02", "eyelashes02.mhclo"), "Eyelashes", "lashes")
brow_objs = [(b, add_one(os.path.join(DATA, "eyebrows", b, b + ".mhclo"), "Eyebrows", "brow_" + b)) for b in BROWS]

def activate(o):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

def bake_mesh(o):
    """形狀鍵套用成固定形狀，除了骨架以外的修改器全部套用。"""
    activate(o)
    if o.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(o.modifiers):
        if m.type != "ARMATURE":
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception as e:
                print("MODFAIL", o.name, m.name, e)
                o.modifiers.remove(m)

# 先套用形狀鍵，趁輔助點還在，量出眼球中心、嘴巴中心
activate(body)
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
def group_center(name):
    gi = body.vertex_groups[name].index
    pts = [v.co.copy() for v in body.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    return sum(pts, Vector()) / len(pts)
EYE_L, EYE_R, MOUTH = group_center("joint-l-eye"), group_center("joint-r-eye"), group_center("lips")
print("EYES", EYE_L, EYE_R, "MOUTH", MOUTH)
for o in [body, shoes, eyes, lashes] + [x for _, x in hair_objs] + [x for _, x in brow_objs]:
    bake_mesh(o)

# 眼球有兩層：外層透明角膜（比較突出）＋裡層眼球。網頁用不透明材質，所以把外層角膜刪掉
def drop_cornea(o):
    bm = bmesh.new(); bm.from_mesh(o.data); seen = set(); comps = []
    for v in bm.verts:
        if v in seen: continue
        st, comp = [v], []
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); comp.append(x); st.extend(e.other_vert(x) for e in x.link_edges)
        comps.append(comp)
    kill = []
    for side in (1, -1):
        cs = [c for c in comps if (sum(v.co.x for v in c) / len(c)) * side > 0]
        if len(cs) >= 2:
            kill += min(cs, key=lambda c: min(v.co.y for v in c))   # 最前面那層＝角膜
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(o.data); bm.free()
    print("CORNEA_DROPPED", len(kill))
drop_cornea(eyes)
MW = body.matrix_world
def bone_w(name):
    b = rig.data.bones[name]
    return rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local

def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

# ---------------- 臉：前方抹平成蛋形，給貼圖五官 ----------------
vg = {g.name: g.index for g in body.vertex_groups}
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.verify()
uvl = bm.loops.layers.uv.active
HEAD, EARS, NECK = vg["head"], vg.get("ears"), vg["neck_01"]

def gw(v, i):
    return v[dl].get(i, 0.0) if i is not None else 0.0

headv = [v for v in bm.verts if gw(v, HEAD) > 0.5 and gw(v, EARS) < 0.05]
xs = [v.co.x for v in headv]; ys = [v.co.y for v in headv]; zs = [v.co.z for v in headv]
# 前後深度不算鼻子、嘴唇（只看兩側 3 cm 以外的點），蛋形才不會被鼻尖撐出來
back = max(ys)
front_y = min(v.co.y for v in headv if abs(v.co.x) > 0.03)
C = Vector(((min(xs) + max(xs)) / 2, (back + front_y) / 2, (min(zs) + max(zs)) / 2))
R = Vector(((max(xs) - min(xs)) / 2, (back - front_y) / 2, (max(zs) - min(zs)) / 2))
print("HEADC", C, "HEADR", R)

def ell(p):
    n = Vector(((p.x - C.x) / R.x, (p.y - C.y) / R.y, (p.z - C.z) / R.z))
    d = n.normalized()
    return C + Vector((d.x * R.x, d.y * R.y, d.z * R.z)), d

def face_w(p):
    _, d = ell(p)
    front = -d.y
    return smooth01(0.22, 0.62, front) * smooth01(-1.02, -0.9, d.z), front, d

# 臉頰的皮膚 UV（填起來的臉用同一塊顏色，避免嘴唇顏色殘留）
cheek = min((v for v in headv if v.co.x > 0), key=lambda v: abs(face_w(v.co)[1] - 0.45) + abs(face_w(v.co)[2].z + 0.15))
FORE_UV = cheek.link_loops[0][uvl].uv.copy()

FLAT_FACE = True   # 2026-11-23 使用者要輕Q版動漫五官 → 整平＋臉片畫五官。True＝：整平眼嘴、用貼圖五官；False＝立體眼球＋睫毛＋眉毛
if FLAT_FACE:
    # ---- 保留寫實臉型，只把眼睛、嘴巴那一小塊整平（給貼圖五官） ----
    def ell2(p, c, rx, rz):
        return math.sqrt(((p.x - c.x) / rx) ** 2 + ((p.z - c.z) / rz) ** 2)
    EYES = [EYE_L, EYE_R]
    lips_front = min(v.co.y for v in bm.verts if ell2(v.co, MOUTH, 0.024, 0.01) < 1 and v.co.y < C.y)
    kill = []
    for v in bm.verts:
        if v.co.y > C.y:
            continue
        if any(ell2(v.co, e, 0.017, 0.011) < 1 and v.co.y > e.y - 0.007 for e in EYES):
            kill.append(v)
        elif ell2(v.co, MOUTH, 0.028, 0.012) < 1 and v.co.y > lips_front + 0.006:
            kill.append(v)
    print("FACE_KILL", len(kill))
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    near = lambda p: any(ell2(p, e, 0.03, 0.022) < 1 for e in EYES) or ell2(p, MOUTH, 0.04, 0.025) < 1
    bnd = [e for e in bm.edges if e.is_boundary and all(near(v.co) for v in e.verts)]
    old_faces = set(bm.faces)
    res = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
    nostril = [f for f in res["faces"] if len(f.verts) <= 8]
    bmesh.ops.delete(bm, geom=nostril, context="FACES_ONLY")
    patch = [f for f in res["faces"] if f.is_valid]
    print("PATCH_FACES", len(patch), [len(f.verts) for f in patch][:8])
    tri = bmesh.ops.triangulate(bm, faces=patch, quad_method="BEAUTY", ngon_method="BEAUTY")
    patch = list(tri["faces"])
    newv = set()
    for _ in range(2):
        edges = list({e for f in patch if f.is_valid for e in f.edges if all(near(v.co) for v in e.verts)})
        r = bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
        newv |= {el for el in r["geom_inner"] + r["geom_split"] if isinstance(el, bmesh.types.BMVert)}
        newv = {v for v in newv if v.is_valid}
        patch = list({f for v in newv for f in v.link_faces})
    bmesh.ops.triangulate(bm, faces=[f for f in patch if f.is_valid and len(f.verts) > 4])
    newv = {v for v in newv if v.is_valid}
    patch_set = {f for f in bm.faces if any(v in newv for v in f.verts)} | {f for f in res["faces"] if f.is_valid}
    # 整平：眼睛、嘴巴附近做 Taubin 平滑（不會整個縮進去），越外圍越少
    def sw(p):
        w = 0.0
        for e in EYES:
            w = max(w, 1 - smooth01(1.15, 2.1, ell2(p, e, 0.021, 0.014)))
        w = max(w, 1 - smooth01(1.1, 1.9, ell2(p, MOUTH, 0.03, 0.017)))
        return w
    region = [v for v in bm.verts if v.co.y < C.y and (v in newv or sw(v.co) > 0)]
    wt = {v: (1.0 if v in newv else sw(v.co)) for v in region}
    for it in range(110):
        for lam in (0.6, -0.62):
            upd = {}
            for v in region:
                nb = [e.other_vert(v).co for e in v.link_edges]
                if nb:
                    avg = sum(nb, Vector()) / len(nb)
                    upd[v] = v.co + (avg - v.co) * lam * wt[v]
            for v, c in upd.items():
                v.co = c
    # 鼻子：縮小一點（插畫風的鼻子很小）
    NOSE = Vector((0.0, (EYE_L.y + MOUTH.y) / 2, (EYE_L.z + MOUTH.z) / 2 + 0.006))
    nw = {v: (1 - smooth01(0.7, 1.5, ell2(v.co, NOSE, 0.022, 0.03))) for v in bm.verts if v.co.y < C.y}
    nreg = [v for v, w in nw.items() if w > 0]
    for it in range(45):
        upd = {}
        for v in nreg:
            nb = [e.other_vert(v).co for e in v.link_edges]
            if nb:
                upd[v] = v.co + (sum(nb, Vector()) / len(nb) - v.co) * 0.6 * nw[v]
        for v, c in upd.items():
            v.co = c
    # 嘴唇：再做一般平滑（會往內收），把鼓起來的嘴唇壓平
    mw = {v: 1 - smooth01(0.9, 1.7, ell2(v.co, MOUTH, 0.03, 0.016)) for v in region}
    mreg = [v for v in region if mw[v] > 0]
    for it in range(40):
        upd = {}
        for v in mreg:
            nb = [e.other_vert(v).co for e in v.link_edges]
            if nb:
                upd[v] = v.co + (sum(nb, Vector()) / len(nb) - v.co) * 0.5 * mw[v]
        for v, c in upd.items():
            v.co = c
    for v in newv:
        v[dl].clear()
        v[dl][HEAD] = 1.0
    for f in bm.faces:
        # 新補的面 UV 都是 0，改成臉頰的皮膚
        cc = f.calc_center_median()
        inside = cc.y < C.y and (any(ell2(cc, e, 0.022, 0.015) < 1 for e in EYES) or ell2(cc, MOUTH, 0.03, 0.013) < 1)
        if inside:
            for l in f.loops:
                l[uvl].uv = FORE_UV
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(body.data); bm.free()
    body.data.update()
else:
    bm.free()

# 臉片（透明貼圖放五官）：取頭前方的面，往外推 1.5 mm，正面投影 UV
def make_face_decal():
    bm = bmesh.new(); bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.verify()
    keep = set()
    for f in bm.faces:
        ok = True
        for v in f.verts:
            if v[dl].get(HEAD, 0.0) < 0.9:
                ok = False; break
            w, front, d = face_w(v.co)
            if front < 0.25 or d.z < -0.75 or d.z > 0.8:
                ok = False; break
        if ok:
            keep.add(f)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * 0.0015
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[uv].uv = (0.5 + (p.x - C.x) / (2 * R.x), 0.5 + (p.z - C.z) / (2 * R.z))
    me = bpy.data.meshes.new("face")
    bm.to_mesh(me); bm.free()
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[0])
    o = bpy.data.objects.new("face", me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = rig; o.matrix_world = body.matrix_world.copy()
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    g = o.vertex_groups.new(name="head")
    g.add([v.index for v in me.vertices], 1.0, "REPLACE")
    m = o.modifiers.new("Armature", "ARMATURE"); m.object = rig
    for p in me.polygons:
        p.use_smooth = True
    return o

face = make_face_decal() if FLAT_FACE else None

# ---------------- 球衣、球褲 ----------------
bones = set(rig.data.bones.keys())
vg = {g.name: g.index for g in body.vertex_groups}
gname = {i: n for n, i in vg.items()}
th_h, th_t = bone_w("thigh_l")
nk_h, _ = bone_w("neck_01")
HIP_Z = th_h.z
HEM_Z = HIP_Z + 0.07          # 球衣下擺
WAIST_Z = HIP_Z + 0.13        # 褲頭
NECK_Z = nk_h.z - 0.012
ARM = {"upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"}

def dom(v):
    best, bw = None, 0
    for g in v.groups:
        n = gname.get(g.group)
        if n in bones and g.weight > bw:
            best, bw = n, g.weight
    return best

def tpar(p, bn):
    h, t = bone_w(bn)
    d = t - h
    return (p - h).dot(d) / d.length_squared

wmat = body.matrix_world
FING = ("index", "middle", "ring", "pinky", "thumb")
EPS = 1e-4
nk_y = nk_h.y
NECK_N = Vector((0, -0.45, 1)).normalized()
NECK_P = Vector((0, nk_y, NECK_Z))
def arm_plane(sd):
    h, t = bone_w("upperarm_" + sd); return h + (t - h) * 0.42, (t - h).normalized()
def leg_plane(sd):
    h, t = bone_w("thigh_" + sd); return h + (t - h) * 0.40, (t - h).normalized()

def member(kind, p, d):
    if d is None or d.startswith(FING) or d in ("head",) or d.startswith(("calf", "foot", "ball", "lowerarm", "hand")):
        return False
    if kind == "j":
        if (p - NECK_P).dot(NECK_N) > EPS:
            return False
        if d.startswith("upperarm"):
            P, N = arm_plane(d[-1]); return (p - P).dot(N) <= EPS
        if d.startswith("thigh"):
            return False
        return p.z >= HEM_Z - EPS
    else:
        if p.z > WAIST_Z + EPS or d.startswith(("upperarm", "clavicle", "neck")):
            return False
        if d.startswith("thigh"):
            P, N = leg_plane(d[-1]); return (p - P).dot(N) <= EPS
        return True

def dom_dict(dv):
    best, bw = None, 0
    for gi, w in dv.items():
        n = gname.get(gi)
        if n in bones and w > bw:
            best, bw = n, w
    return best

cover_j, cover_s = set(), set()
for v in body.data.vertices:
    p = wmat @ v.co
    d = dom_dict({g.group: g.weight for g in v.groups})
    if member("j", p, d): cover_j.add(v.index)
    if member("s", p, d): cover_s.add(v.index)

def upper_hull(pts):
    pts = sorted(pts)
    h = []
    for p in pts:
        while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) >= 0:
            h.pop()
        h.append(p)
    return h

def hull_at(h, x):
    if x <= h[0][0]: return h[0][1]
    for a, b in zip(h, h[1:]):
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / max(b[0] - a[0], 1e-9); return a[1] + (b[1] - a[1]) * t
    return h[-1][1]

def drape_front(bm, vdom):
    """球衣正面像布一樣撐開：橫向用凸包跨過乳溝，胸部以下自然往下垂（不貼著下胸緣）。"""
    cy = bone_w("spine_03")[0].y
    fr = [v for v in bm.verts if v.co.y < cy and HEM_Z < v.co.z < NECK_Z - 0.02 and not (vdom(v) or "").startswith(("upperarm", "clavicle"))]
    # 橫向：每 1 cm 一層，用正面輪廓的上凸包
    bins = {}
    for v in fr:
        bins.setdefault(int(v.co.z / 0.01), []).append(v)
    for vs in bins.values():
        if len(vs) < 3: continue
        h = upper_hull([(v.co.x, -v.co.y) for v in vs])
        for v in vs:
            f = hull_at(h, v.co.x)
            if -v.co.y < f: v.co.y = -f
    # 縱向：每 1 cm 一欄，從最凸的地方往下，布最多以 0.3 的斜率往內收
    cols = {}
    for v in fr:
        cols.setdefault(int(v.co.x / 0.01), []).append(v)
    for vs in cols.values():
        vs.sort(key=lambda v: -v.co.z)
        top = max(vs, key=lambda v: -v.co.y)
        best_f, best_z = -top.co.y, top.co.z
        for v in vs:
            if v.co.z >= top.co.z: continue
            fmin = best_f - (best_z - v.co.z) * 0.3
            if -v.co.y < fmin: v.co.y = -fmin
            if -v.co.y > fmin: best_f, best_z = -v.co.y, v.co.z
    inner = [v for v in fr if not v.is_boundary]
    for _ in range(3):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)

def make_cloth(name, kind, offset, smooth_it, solid):
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.transform(wmat)
    dl = bm.verts.layers.deform.verify()
    def vdom(v):
        d = dom_dict(dict(v[dl].items()))
        if d is None:
            for e in v.link_edges:
                d = dom_dict(dict(e.other_vert(v)[dl].items()))
                if d: break
        return d
    def faces_where(fn):
        fs = [f for f in bm.faces if any(fn(v) for v in f.verts)]
        es = list({e for f in fs for e in f.edges}); vs = list({v for f in fs for v in f.verts})
        return fs + es + vs
    def cut(geom, co, no):
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)
    not_arm = lambda v: not (vdom(v) or "").startswith(("upperarm", "lowerarm", "hand") + FING)
    if kind == "j":
        cut(faces_where(lambda v: v.co.z > NECK_Z - 0.1 and not_arm(v)), NECK_P, NECK_N)
        cut(faces_where(not_arm), Vector((0, 0, HEM_Z)), Vector((0, 0, 1)))
        for sd in "lr":
            P, N = arm_plane(sd)
            cut(faces_where(lambda v: (vdom(v) or "") == "upperarm_" + sd), P, N)
    else:
        cut(faces_where(not_arm), Vector((0, 0, WAIST_Z)), Vector((0, 0, 1)))
        for sd in "lr":
            P, N = leg_plane(sd)
            cut(faces_where(lambda v: (vdom(v) or "") == "thigh_" + sd), P, N)
    keep = {v for v in bm.verts if member(kind, v.co, vdom(v))}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v in keep for v in f.verts)], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    # 抹掉肌肉、乳頭等細節
    for _ in range(smooth_it):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * offset
    if kind == "j":
        drape_front(bm, vdom)
    bm.transform(wmat.inverted())
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = rig; o.matrix_world = body.matrix_world.copy()
    # 頂點權重是照索引複製過來的，要建同樣順序的頂點群組名稱才會綁到骨頭
    for g in body.vertex_groups:
        o.vertex_groups.new(name=g.name)
    # 圓柱投影 UV：正面 u=0.75、背面 u=0.25、v＝下擺到領口
    uv = me.uv_layers.active
    zlo, zhi = (HEM_Z, NECK_Z) if kind == "j" else (th_h.z - 0.25, WAIST_Z)
    for poly in me.polygons:
        us = []
        for li in poly.loop_indices:
            p = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(p.x, -p.y)
            u = (a / (2 * math.pi) + 0.75) % 1.0
            vv = (p.z - zlo) / (zhi - zlo)
            uv.data[li].uv = (u, vv); us.append(u)
        if max(us) - min(us) > 0.5:
            for li in poly.loop_indices:
                if uv.data[li].uv[0] < 0.5:
                    uv.data[li].uv[0] += 1.0
    if solid:
        s = o.modifiers.new("solid", "SOLIDIFY"); s.thickness = solid; s.offset = -1
        activate(o); bpy.ops.object.modifier_apply(modifier="solid")
    m = o.modifiers.new("Armature", "ARMATURE"); m.object = rig
    for p in me.polygons:
        p.use_smooth = True
    me.validate()
    return o

jersey = make_cloth("jersey", "j", 0.013, 6, 0.004)
shorts = make_cloth("shorts", "s", 0.009, 4, 0.004)

# 衣服底下的身體刪掉（留邊界兩圈，避免動作時穿出來）
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
covered = {v for v in bm.verts if v.index in cover_j or v.index in cover_s}
for _ in range(2):
    covered = {v for v in covered if all(e.other_vert(v) in covered for e in v.link_edges)}
bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in covered for v in f.verts)], context="FACES_ONLY")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data); bm.free()

# ---------------- 材質（簡單 PBR，網頁會再換色） ----------------
def read_tex(mhmat):
    d = os.path.dirname(mhmat)
    for line in open(mhmat, encoding="utf-8", errors="ignore"):
        m = re.match(r"diffuseTexture\s+(\S+)", line)
        if m:
            return os.path.join(d, os.path.basename(m.group(1)))
    return None

def simple_mat(o, name, tex=None, color=(1, 1, 1, 1), rough=0.6, alpha=False, size=1024):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    if tex and os.path.isfile(tex):
        img = bpy.data.images.load(tex)
        if img.size[0] > size:
            img.scale(size, size)
        if name == "skin":   # 皮膚細節柔化（縮小再放大），不要那麼寫實
            img.scale(640, 640); img.scale(size, size)
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img
        nt.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            nt.links.new(n.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.blend_method = "HASHED" if hasattr(mat, "blend_method") else None
    o.data.materials.clear()
    o.data.materials.append(mat)

simple_mat(body, "skin", read_tex(os.path.join(DATA, "skins", *SKIN)), rough=0.55, size=2048)
for h, o in hair_objs:
    simple_mat(o, "hair_" + h, read_tex(os.path.join(DATA, "hair", h, h + ".mhmat")), rough=0.5, alpha=True)
simple_mat(shoes, "shoes", read_tex(os.path.join(DATA, "clothes", "shoes05", "shoes05.mhmat")), rough=0.6)
simple_mat(eyes, "eyes", os.path.join(DATA, "eyes", "materials", "brown_eye.png"), rough=0.15)
simple_mat(lashes, "lashes", read_tex(os.path.join(DATA, "eyelashes", "eyelashes02", "eyelashes02.mhmat")), rough=0.6, alpha=True)
for b, o in brow_objs:
    simple_mat(o, "brow_" + b, read_tex(os.path.join(DATA, "eyebrows", b, b + ".mhmat")), rough=0.7, alpha=True)
for b, o in brow_objs[1:]:
    o.hide_render = True
simple_mat(jersey, "jersey", color=(0.95, 0.95, 0.95, 1), rough=0.7)
simple_mat(shorts, "shorts", color=(0.1, 0.1, 0.12, 1), rough=0.7)
if face: simple_mat(face, "face", color=(1, 1, 1, 1), rough=0.6)

# ---------------- 拍照檢查 ----------------
scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE"
scn.render.resolution_x = 800; scn.render.resolution_y = 1000
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scn.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
if face: face.hide_render = True
for h, o in hair_objs[1:]:
    o.hide_render = True

def shoot(name, target, dist, yaw_deg, lens=50):
    t = Vector(target); yaw = math.radians(yaw_deg)
    cam.location = t + Vector((math.sin(yaw) * dist, -math.cos(yaw) * dist, 0))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    scn.render.filepath = os.path.join(SHOTS, f"real_{SEX}_{name}.png")
    bpy.ops.render.render(write_still=True)

hz = (rig.matrix_world @ rig.data.bones["head"].head_local).z
top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
print("HEIGHT", round(top, 3))
shoot("a_front", (0, 0, top * 0.5), 5.6, 0)
shoot("b_34", (0, 0, top * 0.5), 5.6, 35)
shoot("c_back", (0, 0, top * 0.5), 5.6, 180)
shoot("d_face", (0, 0, hz + 0.08), 1.3, 20)

# ---------------- 輸出 glb ----------------
if face: face.hide_render = False
for h, o in hair_objs:
    o.hide_render = False
for x in bpy.context.selected_objects:
    x.select_set(False)
rig.select_set(True)
for o in rig.children:
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
path = os.path.join(OUT, f"real_{SEX}.glb")
bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_skins=True,
                          export_morph=False, export_animations=False, export_yup=True,
                          export_image_format="WEBP", export_image_quality=85, export_apply=False)
print("EXPORTED", path, os.path.getsize(path))
import json
# 頭部蛋形（換成 glTF 的 Y 朝上座標：x, z, -y），網頁長頭髮用
g3 = lambda v: [v.x, v.z, -v.y]
json.dump({"headC": [C.x, C.z, -C.y], "headR": [R.x, R.z, R.y], "eyeL": g3(EYE_L), "eyeR": g3(EYE_R), "mouth": g3(MOUTH)}, open(os.path.join(OUT, f"real_{SEX}.json"), "w"))
print("DONE")
