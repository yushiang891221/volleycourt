# 球館元件素材庫：每個模組在 Blender 裡建模（倒角、軟墊、細節），排開後一起烘焙「物件自己的」環境光遮蔽（AO）到一張圖集，
# 匯出成 models/gym-kit.glb 與 models/gym-kit-ao.jpg。網站載入後依長度重複擺模組（置物櫃一格 40 cm、沙發一座 70 cm…），不拉伸。
#
# 用法（在 repo 根目錄）：
#   <blender.exe> -b --factory-startup -P tools/blender/build_assets.py -- . [AO 樣本數]
#
# 座標：模組本地座標 (x 寬, y 上, z 深)，正面朝 -z、原點在地面中心，和 gym.html 的 three.js 物件一致。
# Blender 是 Z 朝上：(X, Y, Z) = (x, -z, y)。glTF 匯出時轉回 Y 朝上，三者就對齊了。
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.abspath(args[0] if args else '.')
SAMPLES = int(args[1]) if len(args) > 1 else 160
OUT = os.path.join(ROOT, 'models')
ATLAS = 3072

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ───── 材質：名稱就是網站端的材質角色（navy、leather、wood…），這裡的顏色只給烘焙與預覽用 ─────
ROLES = {
    'navy': (0.03, 0.05, 0.11, 0.55, 0.1), 'navy_pad': (0.04, 0.06, 0.13, 0.7, 0), 'leather': (0.35, 0.18, 0.07, 0.5, 0),
    'cushion': (0.05, 0.07, 0.11, 0.7, 0), 'wood': (0.45, 0.3, 0.17, 0.5, 0), 'chrome': (0.8, 0.8, 0.82, 0.2, 1),
    'darksteel': (0.03, 0.03, 0.035, 0.45, 0.6), 'white': (0.85, 0.86, 0.87, 0.35, 0), 'red': (0.6, 0.06, 0.05, 0.4, 0),
    'green': (0.05, 0.4, 0.15, 0.4, 0), 'ceramic': (0.9, 0.9, 0.9, 0.15, 0), 'quartz': (0.85, 0.84, 0.82, 0.25, 0),
    'rubber': (0.02, 0.02, 0.02, 0.8, 0), 'leaf': (0.06, 0.2, 0.05, 0.6, 0), 'pot': (0.75, 0.7, 0.62, 0.8, 0),
    'ball_y': (0.85, 0.65, 0.05, 0.45, 0), 'ball_b': (0.05, 0.15, 0.45, 0.45, 0), 'ball_w': (0.9, 0.9, 0.88, 0.45, 0),
    'screen': (0.02, 0.05, 0.08, 0.2, 0), 'glass': (0.6, 0.7, 0.75, 0.05, 0), 'emit': (1, 1, 1, 0.3, 0), 'aluminium': (0.7, 0.71, 0.72, 0.35, 0.8),
    'can_r': (0.7, 0.1, 0.08, 0.3, 0.6), 'can_g': (0.1, 0.5, 0.25, 0.3, 0.6), 'can_y': (0.85, 0.6, 0.05, 0.3, 0.6), 'can_w': (0.85, 0.85, 0.85, 0.3, 0.6),
    'plastic': (0.82, 0.83, 0.84, 0.45, 0), 'fabric_w': (0.85, 0.84, 0.82, 0.95, 0), 'curtain': (0.3, 0.2, 0.12, 0.9, 0),
    'stainless': (0.75, 0.76, 0.78, 0.3, 0.9), 'canvas': (0.08, 0.1, 0.16, 0.85, 0),
    'laminate': (0.55, 0.53, 0.49, 0.45, 0),
}
MATS = {}
for name, (r, g, b, rough, metal) in ROLES.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    MATS[name] = m


# ───── 幾何工具（本地座標 x, y 上, z 深）─────
def to_b(x, y, z):
    return Vector((x, -z, y))


class Part:
    """一個模組的零件清單；finish() 合併成一個物件（多材質）。"""

    def __init__(self, name):
        self.name = name
        self.objs = []

    def _obj(self, bm, mat, bevel=0.0, seg=2, subsurf=0, smooth_angle=35):
        me = bpy.data.meshes.new(f'{self.name}_p{len(self.objs)}')
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(me.name, me)
        scene.collection.objects.link(o)
        me.materials.append(MATS[mat])
        if bevel > 0:
            md = o.modifiers.new('bv', 'BEVEL')
            md.width = bevel
            md.segments = seg
            md.limit_method = 'ANGLE'
            md.angle_limit = math.radians(40)
        if subsurf:
            md = o.modifiers.new('ss', 'SUBSURF')
            md.levels = subsurf
            md.render_levels = subsurf
        o['smooth_angle'] = smooth_angle
        self.objs.append(o)
        return o

    def box(self, cx, cy, cz, w, h, d, mat, bevel=0.006, seg=2, subsurf=0, rot=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
        if rot:   # (軸, 角度) 繞模組本地軸旋轉
            ax, ang = rot
            axis = {'x': 'X', 'y': 'Z', 'z': 'Y'}[ax]
            sgn = -1 if ax == 'z' else 1
            bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(sgn * ang, 3, axis))
        bmesh.ops.translate(bm, verts=bm.verts, vec=to_b(cx, cy, cz))
        return self._obj(bm, mat, bevel, seg, subsurf)

    def cyl(self, cx, cy, cz, r, h, mat, seg=24, r2=None, axis='y', bevel=0.0):
        """圓柱（axis = 'y' 直立、'x' 或 'z' 橫放）；(cx, cy, cz) 是中心。"""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        if axis == 'x':
            bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
        elif axis == 'z':
            bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=to_b(cx, cy, cz))
        return self._obj(bm, mat, bevel, 2, 0, smooth_angle=60)

    def tube(self, a, b, r, mat, seg=12):
        """兩點之間的圓管（鋼管框架）。"""
        A, B = to_b(*a), to_b(*b)
        d = B - A
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=q.to_matrix())
        bmesh.ops.translate(bm, verts=bm.verts, vec=(A + B) / 2)
        return self._obj(bm, mat, 0, 2, 0, smooth_angle=70)

    def sphere(self, cx, cy, cz, r, mat, seg=20, scale=(1, 1, 1)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=r)
        bmesh.ops.scale(bm, vec=Vector((scale[0], scale[2], scale[1])), verts=bm.verts)
        bmesh.ops.translate(bm, verts=bm.verts, vec=to_b(cx, cy, cz))
        return self._obj(bm, mat, 0, 2, 0, smooth_angle=80)

    def leaf(self, base, angle, tilt, length, width, mat):
        """一片葉子：中肋稍微彎的菱形面（雙面），從 base 往 angle 方向伸出。"""
        bm = bmesh.new()
        pts = [(0, 0, 0), (width / 2, 0.02, length * 0.4), (0, -0.01 + 0.06 * length, length), (-width / 2, 0.02, length * 0.4)]
        vs = [bm.verts.new(Vector(p)) for p in pts]
        mid = bm.verts.new(Vector((0, 0.035, length * 0.45)))
        for f in [(vs[0], vs[1], mid), (vs[1], vs[2], mid), (vs[2], vs[3], mid), (vs[3], vs[0], mid)]:
            bm.faces.new(f)
        rot = Matrix.Rotation(angle, 3, 'Z') @ Matrix.Rotation(-tilt, 3, 'X')
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
        bmesh.ops.translate(bm, verts=bm.verts, vec=to_b(*base))
        o = self._obj(bm, mat, 0, 2, 0, smooth_angle=80)
        sol = o.modifiers.new('sol', 'SOLIDIFY')
        sol.thickness = 0.004
        return o

    def finish(self):
        for o in self.objs:
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            old = o.data
            o.modifiers.clear()
            o.data = me
            bpy.data.meshes.remove(old)
            ang = math.radians(o['smooth_angle'])
            bm = bmesh.new()
            bm.from_mesh(o.data)
            for f in bm.faces:
                f.smooth = True
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > ang:
                    e.smooth = False
            bm.to_mesh(o.data)
            bm.free()
        target = self.objs[0]
        if len(self.objs) > 1:
            with bpy.context.temp_override(active_object=target, selected_editable_objects=self.objs, selected_objects=self.objs):
                bpy.ops.object.join()
        target.name = self.name
        target.data.name = self.name
        world_uv(target)
        return target


def world_uv(obj):
    """UV0：依面朝向投影，1 單位 = 1 m（網站的貼圖 repeat 用公尺換算，與牆、地板一致）。"""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            lp[uv].uv = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
    bm.to_mesh(me)
    bm.free()


# ───── 模組 ─────
MODULES = []


def module(fn):
    MODULES.append(fn)
    return fn


@module
def locker_col():
    """置物櫃一格：寬 40、高 190、深 50 cm。門板、通風槽、把手、號碼牌、內縮底座。"""
    p = Part('locker_col')
    p.box(0, 0.05, 0.02, 0.38, 0.1, 0.44, 'darksteel', 0.003)
    p.box(0, 1.0, 0, 0.398, 1.8, 0.5, 'navy', 0.004)
    p.box(0, 1.0, -0.256, 0.372, 1.74, 0.018, 'navy', 0.006, 3)
    for k in range(4):
        p.box(0, 1.72 - k * 0.035, -0.267, 0.24, 0.012, 0.006, 'darksteel', 0.0)
        p.box(0, 0.3 + k * 0.035, -0.267, 0.24, 0.012, 0.006, 'darksteel', 0.0)
    p.cyl(0.14, 1.02, -0.29, 0.009, 0.15, 'chrome', 12)
    for y in (0.96, 1.08):
        p.cyl(0.14, y, -0.277, 0.006, 0.026, 'chrome', 8, axis='z')
    p.box(0, 1.5, -0.267, 0.07, 0.035, 0.004, 'aluminium', 0.002)
    return p.finish()


@module
def sofa_seat():
    """沙發一座（寬 70、深 90 cm）：軟墊座墊＋靠墊＋底座框，正面 -z。"""
    p = Part('sofa_seat')
    p.box(0, 0.17, 0, 0.7, 0.18, 0.9, 'leather', 0.02, 3)
    p.box(0, 0.33, -0.07, 0.68, 0.16, 0.66, 'leather', 0.05, 3, subsurf=1)
    p.box(0, 0.5, 0.36, 0.7, 0.62, 0.16, 'leather', 0.03, 3)
    p.box(0, 0.6, 0.24, 0.66, 0.42, 0.17, 'leather', 0.06, 3, subsurf=1, rot=('x', -0.18))
    return p.finish()


@module
def sofa_arm():
    p = Part('sofa_arm')
    p.box(0, 0.36, 0, 0.17, 0.56, 0.9, 'leather', 0.05, 4, subsurf=1)
    for z in (-0.38, 0.38):
        p.cyl(0, 0.04, z, 0.025, 0.08, 'darksteel', 12, r2=0.018)
    return p.finish()


@module
def bench_frame():
    """長椅一組腳架（高 42、深 40 cm）：方管框，座板另外以木條鋪。"""
    p = Part('bench_frame')
    for z in (-0.17, 0.17):
        p.box(0, 0.2, z, 0.04, 0.4, 0.04, 'darksteel', 0.004)
    p.box(0, 0.385, 0, 0.04, 0.03, 0.4, 'darksteel', 0.004)
    p.box(0, 0.015, 0, 0.05, 0.03, 0.42, 'darksteel', 0.004)
    for z in (-0.18, 0.18):
        p.cyl(0, 0.003, z, 0.022, 0.006, 'rubber', 12)
    return p.finish()


@module
def stool():
    p = Part('stool')
    p.cyl(0, 0.44, 0, 0.18, 0.06, 'cushion', 32, bevel=0.02)
    p.cyl(0, 0.21, 0, 0.022, 0.4, 'chrome', 16)
    p.cyl(0, 0.012, 0, 0.17, 0.024, 'chrome', 32, bevel=0.006)
    p.cyl(0, 0.16, 0, 0.12, 0.012, 'chrome', 24)
    return p.finish()


@module
def cafe_table():
    p = Part('cafe_table')
    p.cyl(0, 0.725, 0, 0.45, 0.035, 'wood', 48, bevel=0.008)
    p.cyl(0, 0.36, 0, 0.035, 0.7, 'darksteel', 16)
    p.cyl(0, 0.012, 0, 0.26, 0.024, 'darksteel', 32, bevel=0.006)
    return p.finish()


@module
def net_post():
    """排球網柱：鋼管、深藍防護套（拉鍊）、配重底座＋兩輪、搖柄。"""
    p = Part('net_post')
    p.cyl(0, 1.33, 0, 0.045, 2.6, 'chrome', 20)
    p.cyl(0, 0.98, 0, 0.13, 1.9, 'navy_pad', 32, bevel=0.03)
    p.box(0, 0.98, -0.13, 0.012, 1.8, 0.008, 'darksteel', 0)
    p.cyl(0, 0.04, 0, 0.32, 0.08, 'darksteel', 40, bevel=0.01)
    for x in (-0.28, 0.28):
        p.cyl(x, 0.06, 0.24, 0.05, 0.035, 'rubber', 20, axis='x')
    p.box(0, 1.15, 0.16, 0.08, 0.12, 0.06, 'darksteel', 0.006)
    p.cyl(0.07, 1.15, 0.2, 0.01, 0.12, 'chrome', 8, axis='x')
    return p.finish()


@module
def referee_chair():
    p = Part('referee_chair')
    for x in (-0.3, 0.3):
        p.tube((x, 0, -0.42), (x, 1.62, -0.28), 0.022, 'chrome')
        p.tube((x, 0, 0.36), (x, 1.62, 0.3), 0.022, 'chrome')
    for k in range(1, 5):
        z = -0.42 + 0.14 * k / 5 * 0.25
        p.box(0, k * 0.32, -0.42 + k * 0.028, 0.6, 0.03, 0.09, 'darksteel', 0.004)
    p.box(0, 1.63, 0, 0.78, 0.05, 0.74, 'wood', 0.008)
    p.box(0, 1.92, 0.36, 0.78, 0.42, 0.06, 'navy_pad', 0.02, 3)
    for x in (-0.38, 0.38):
        p.box(x, 1.85, 0, 0.05, 0.3, 0.7, 'navy_pad', 0.02, 3)
    return p.finish()


@module
def ball_cart():
    """球車 100×60 cm：鋼管框、腳輪，球另外排（網站端）；這裡含底層的球。"""
    p = Part('ball_cart')
    w, d = 0.98, 0.58
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            p.tube((x, 0.1, z), (x, 0.98, z), 0.012, 'chrome')
            p.cyl(x, 0.045, z, 0.04, 0.03, 'rubber', 16, axis='x')
    for y in (0.16, 0.98):
        for (a, b) in [((-w / 2, y, -d / 2), (w / 2, y, -d / 2)), ((-w / 2, y, d / 2), (w / 2, y, d / 2)), ((-w / 2, y, -d / 2), (-w / 2, y, d / 2)), ((w / 2, y, -d / 2), (w / 2, y, d / 2))]:
            p.tube(a, b, 0.011, 'chrome')
    p.box(0, 0.165, 0, w, 0.01, d, 'darksteel', 0)
    cols = ['ball_y', 'ball_b', 'ball_w']
    k = 0
    for layer in range(3):
        for i in range(4):
            for j in range(2):
                x = -w / 2 + 0.14 + i * (w - 0.28) / 3 + (0.05 if layer % 2 else 0)
                z = -d / 2 + 0.15 + j * (d - 0.3) + (0.04 if layer % 2 else 0)
                p.sphere(x, 0.28 + layer * 0.2, z, 0.105, cols[k % 3], 20)
                k += 1
    return p.finish()


@module
def vending():
    """販賣機 100×80×180：圓角機身、內縮展示窗（飲料一排排）、投幣面板、取物口。"""
    p = Part('vending')
    p.box(0, 0.9, 0, 1.0, 1.8, 0.8, 'red', 0.02, 3)
    p.box(-0.12, 1.08, -0.39, 0.64, 1.3, 0.04, 'screen', 0.01)
    for r in range(5):
        y = 0.55 + r * 0.24
        p.box(-0.12, y - 0.075, -0.4, 0.6, 0.012, 0.06, 'aluminium', 0)
        for k in range(6):
            p.cyl(-0.4 + k * 0.11, y, -0.42, 0.03, 0.12, ['can_r', 'can_g', 'can_y', 'can_w'][(r + k) % 4], 14)
    p.box(-0.12, 1.08, -0.44, 0.64, 1.3, 0.008, 'glass', 0)
    p.box(0.36, 1.1, -0.41, 0.2, 0.5, 0.02, 'darksteel', 0.006)
    for r in range(3):
        for c in range(3):
            p.box(0.31 + c * 0.05, 1.22 - r * 0.05, -0.425, 0.035, 0.035, 0.01, 'aluminium', 0.003)
    p.box(-0.12, 0.2, -0.41, 0.5, 0.14, 0.03, 'darksteel', 0.01)
    p.box(0, 0.03, 0, 0.96, 0.06, 0.76, 'darksteel', 0)
    return p.finish()


@module
def water():
    p = Part('water')
    p.box(0, 0.5, 0, 0.5, 1.0, 0.5, 'white', 0.02, 3)
    p.box(0, 0.62, -0.21, 0.36, 0.26, 0.1, 'darksteel', 0.01)
    p.box(0, 0.52, -0.23, 0.32, 0.03, 0.12, 'aluminium', 0.004)
    for x in (-0.07, 0.07):
        p.box(x, 0.74, -0.27, 0.05, 0.05, 0.05, 'chrome', 0.008)
    p.cyl(0, 1.2, 0, 0.15, 0.38, 'glass', 32, bevel=0.04)
    p.cyl(0, 1.03, 0, 0.06, 0.06, 'glass', 24)
    return p.finish()


@module
def plant():
    """盆栽：錐形盆＋土＋約 40 片葉子（位置用固定種子，每次一樣）。"""
    import random
    rnd = random.Random(20261023)
    p = Part('plant')
    p.cyl(0, 0.21, 0, 0.24, 0.42, 'pot', 40, r2=0.19, bevel=0.01)
    p.cyl(0, 0.41, 0, 0.21, 0.02, 'rubber', 32)
    for i in range(42):
        a = rnd.random() * math.tau
        h = 0.42 + rnd.random() * 0.8
        r0 = 0.02 + rnd.random() * 0.06
        p.leaf((math.cos(a) * r0, h, math.sin(a) * r0), a, 0.4 + rnd.random() * 0.9, 0.22 + rnd.random() * 0.14, 0.1 + rnd.random() * 0.05, 'leaf')
    for i in range(6):
        a = i / 6 * math.tau
        p.tube((0, 0.4, 0), (math.cos(a) * 0.08, 1.0 + (i % 3) * 0.12, math.sin(a) * 0.08), 0.008, 'leaf', 6)
    return p.finish()


@module
def toilet():
    p = Part('toilet')
    p.sphere(0, 0.3, -0.05, 0.2, 'ceramic', 24, scale=(0.95, 0.75, 1.35))
    p.cyl(0, 0.17, 0.02, 0.13, 0.34, 'ceramic', 24, r2=0.16)
    p.cyl(0, 0.42, -0.06, 0.2, 0.03, 'white', 32, bevel=0.01)
    p.box(0, 0.6, 0.24, 0.42, 0.42, 0.18, 'ceramic', 0.03, 3)
    p.box(0, 0.83, 0.24, 0.44, 0.04, 0.2, 'ceramic', 0.01)
    p.cyl(0.12, 0.86, 0.24, 0.025, 0.02, 'chrome', 16)
    return p.finish()


@module
def sink():
    """洗手台一格 60 cm：檯面、嵌入式面盆、龍頭（檯面網站端可以接長）。"""
    p = Part('sink')
    p.box(0, 0.86, 0, 0.6, 0.04, 0.5, 'quartz', 0.006)
    # 檯上碗型面盆：外徑 40 cm、高 13 cm，碗口內縮一圈
    p.cyl(0, 0.945, -0.02, 0.2, 0.13, 'ceramic', 40, r2=0.2, bevel=0.03)
    p.cyl(0, 1.0, -0.02, 0.16, 0.02, 'darksteel', 32)
    p.tube((0, 0.88, 0.18), (0, 1.1, 0.18), 0.015, 'chrome')
    p.tube((0, 1.1, 0.18), (0, 1.08, 0.05), 0.013, 'chrome')
    p.box(0, 0.42, 0.2, 0.56, 0.8, 0.06, 'white', 0.01)
    return p.finish()


@module
def shower():
    """淋浴頭＋龍頭（掛牆，背面在 +z）。"""
    p = Part('shower')
    p.tube((0, 1.1, 0.2), (0, 2.05, 0.2), 0.014, 'chrome')
    p.tube((0, 2.05, 0.2), (0, 2.05, 0.02), 0.014, 'chrome')
    p.cyl(0, 2.02, 0.0, 0.11, 0.025, 'chrome', 32, bevel=0.006)
    p.cyl(0, 1.1, 0.2, 0.06, 0.08, 'chrome', 24, axis='z')
    p.box(0, 1.1, 0.165, 0.05, 0.015, 0.06, 'chrome', 0.004)
    return p.finish()


@module
def crash_pad():
    """牆面防撞墊一片：寬 120、高 195、厚 6 cm，圓角軟包。"""
    p = Part('crash_pad')
    p.box(0, 1.055, 0, 1.18, 1.95, 0.06, 'navy_pad', 0.025, 4)
    p.box(0, 0.08, 0.02, 1.18, 0.02, 0.02, 'darksteel', 0)
    return p.finish()


@module
def shelf_bay():
    """器材層架一跨：寬 100、高 200、深 50 cm，四層鋼板＋角鋼立柱。"""
    p = Part('shelf_bay')
    for x in (-0.48, 0.48):
        for z in (-0.23, 0.23):
            p.box(x, 1.0, z, 0.035, 2.0, 0.035, 'darksteel', 0.003)
    for k in range(4):
        y = 0.12 + k * 0.58
        p.box(0, y, 0, 0.99, 0.025, 0.5, 'darksteel', 0.004)
        p.box(0, y + 0.03, -0.24, 0.96, 0.035, 0.01, 'darksteel', 0)
    return p.finish()


@module
def counter_mid():
    """櫃台中段一節 60 cm：深藍本體、正面直木條（檯面由網站整條鋪）。正面（客人側）朝 -z。"""
    p = Part('counter_mid')
    p.box(0, 0.55, 0.02, 0.6, 1.0, 0.62, 'navy', 0.003)
    p.box(0, 0.025, 0.04, 0.6, 0.05, 0.56, 'darksteel', 0)
    for i in range(6):
        p.box(-0.25 + i * 0.1, 0.55, -0.31, 0.06, 0.9, 0.035, 'wood', 0.006)
    # 檯面不放在模組裡：網站端整條鋪一片，才不會每 60 cm 一道接縫
    return p.finish()


@module
def counter_end():
    p = Part('counter_end')
    p.box(0, 0.55, -0.02, 0.06, 1.1, 0.76, 'navy', 0.01, 3)
    return p.finish()


@module
def aircon():
    """壁掛冷氣（寬 120、背面 +z 貼牆）：圓角機身、出風口導風板、指示燈。"""
    p = Part('aircon')
    p.box(0, 0.21, 0, 1.2, 0.36, 0.3, 'white', 0.05, 4)
    p.box(0, 0.06, -0.06, 1.1, 0.05, 0.16, 'darksteel', 0.01)
    p.box(0, 0.06, -0.12, 1.08, 0.015, 0.08, 'white', 0.005, rot=('x', 0.4))
    p.box(0.48, 0.3, -0.152, 0.06, 0.012, 0.004, 'emit', 0)
    return p.finish()


@module
def extinguisher():
    p = Part('extinguisher')
    p.cyl(0, 0.27, 0, 0.08, 0.46, 'red', 28, bevel=0.03)
    p.sphere(0, 0.5, 0, 0.08, 'red', 20, scale=(1, 0.5, 1))
    p.cyl(0, 0.56, 0, 0.022, 0.06, 'darksteel', 12)
    p.box(0.03, 0.6, 0, 0.1, 0.012, 0.03, 'darksteel', 0.003)
    p.tube((0.02, 0.56, 0), (0.09, 0.3, -0.04), 0.008, 'rubber')
    p.box(0, 0.01, 0.02, 0.24, 0.02, 0.22, 'darksteel', 0.004)
    return p.finish()


@module
def led_strip():
    """LED 條燈 240 cm：鋁擠型外殼、端蓋、乳白發光面（朝下）、吊線扣。"""
    p = Part('led_strip')
    p.box(0, 0.035, 0, 2.4, 0.06, 0.12, 'aluminium', 0.006)
    p.box(0, 0.002, 0, 2.38, 0.006, 0.1, 'emit', 0)
    for x in (-1.2, 1.2):
        p.box(x, 0.035, 0, 0.01, 0.065, 0.125, 'darksteel', 0.002)
    for x in (-0.95, 0.95):
        p.cyl(x, 0.075, 0, 0.012, 0.02, 'chrome', 10)
    return p.finish()


# ───── 現有球館相片裡看到的物件（龍蝦、排丘、就醬瘋、排郎）─────
def x_legs(p, w, d, h, mat, r=0.014, inset=0.06):
    """折疊家具的 X 型腳：兩側各一組交叉管。"""
    for sx in (-1, 1):
        x = sx * (w / 2 - inset)
        p.tube((x, 0.01, -d / 2 + inset), (x, h, d / 2 - inset), r, mat)
        p.tube((x, 0.01, d / 2 - inset), (x, h, -d / 2 + inset), r, mat)
    p.tube((-w / 2 + inset, 0.04, 0), (w / 2 - inset, 0.04, 0), r * 0.8, mat)


@module
def fold_table():
    """白色折疊桌 180×75 cm：吹塑桌面（圓邊）、灰色鋼管 U 型腳＋撐桿。"""
    p = Part('fold_table')
    p.box(0, 0.715, 0, 1.8, 0.05, 0.75, 'plastic', 0.02, 3)
    p.box(0, 0.68, 0, 1.7, 0.02, 0.65, 'plastic', 0.004)
    for sx in (-1, 1):
        x = sx * 0.72
        p.tube((x, 0.0, -0.3), (x, 0.69, -0.3), 0.014, 'aluminium')
        p.tube((x, 0.0, 0.3), (x, 0.69, 0.3), 0.014, 'aluminium')
        p.tube((x, 0.05, -0.3), (x, 0.05, 0.3), 0.012, 'aluminium')
        p.tube((x, 0.68, 0.0), (x * 0.4, 0.68, 0.0), 0.01, 'aluminium')
        for z in (-0.3, 0.3):
            p.cyl(x, 0.006, z, 0.018, 0.012, 'rubber', 10)
    return p.finish()


@module
def fold_chair():
    """白色折疊椅：塑膠座板與靠背、鋼管交叉腳。正面 -z。"""
    p = Part('fold_chair')
    p.box(0, 0.45, -0.02, 0.42, 0.03, 0.4, 'plastic', 0.012, 3)
    p.box(0, 0.68, 0.21, 0.42, 0.24, 0.025, 'plastic', 0.01, 3, rot=('x', -0.12))
    for sx in (-0.2, 0.2):
        p.tube((sx, 0.0, 0.24), (sx, 0.82, 0.19), 0.011, 'aluminium')
        p.tube((sx, 0.0, -0.2), (sx, 0.45, 0.08), 0.011, 'aluminium')
    p.tube((-0.2, 0.43, -0.2), (0.2, 0.43, -0.2), 0.009, 'aluminium')
    p.tube((-0.2, 0.1, 0.23), (0.2, 0.1, 0.23), 0.009, 'aluminium')
    return p.finish()


@module
def camp_chair():
    """木製露營折疊椅：板條座面與靠背、X 型木腳。正面 -z。"""
    p = Part('camp_chair')
    for k in range(5):
        p.box(0, 0.42, -0.2 + k * 0.085, 0.46, 0.022, 0.07, 'wood', 0.006, 2)
    for k in range(4):
        p.box(0, 0.52 + k * 0.085, 0.27 + k * 0.012, 0.46, 0.07, 0.022, 'wood', 0.006, 2, rot=('x', -0.2))
    for sx in (-0.255, 0.255):
        p.box(sx, 0.4, 0.0, 0.035, 0.035, 0.62, 'wood', 0.006)
        p.box(sx, 0.36, 0.06, 0.035, 0.8, 0.035, 'wood', 0.006, rot=('x', 0.55))
        p.box(sx, 0.32, -0.06, 0.035, 0.68, 0.035, 'wood', 0.006, rot=('x', -0.55))
        p.box(sx, 0.62, 0.3, 0.035, 0.5, 0.035, 'wood', 0.006, rot=('x', -0.2))
    p.cyl(0.255, 0.3, 0, 0.012, 0.08, 'darksteel', 10, axis='x')
    p.cyl(-0.255, 0.3, 0, 0.012, 0.08, 'darksteel', 10, axis='x')
    return p.finish()


@module
def camp_table():
    """木製露營小桌 60×60 cm：板條桌面、X 型腳。"""
    p = Part('camp_table')
    for k in range(6):
        p.box(0, 0.585, -0.25 + k * 0.1, 0.6, 0.022, 0.09, 'wood', 0.005, 2)
    p.box(0, 0.56, 0, 0.56, 0.03, 0.04, 'wood', 0.004)
    for sx in (-0.24, 0.24):
        p.box(sx, 0.29, 0, 0.035, 0.66, 0.035, 'wood', 0.006, rot=('z', 0.42))
        p.box(sx, 0.29, 0, 0.035, 0.66, 0.035, 'wood', 0.006, rot=('z', -0.42))
    return p.finish()


@module
def desk():
    """辦公桌 140×70：白色桌面、鋼腳、螢幕、鍵盤、主機。正面（坐的人那側）朝 -z。"""
    p = Part('desk')
    p.box(0, 0.735, 0, 1.4, 0.03, 0.7, 'plastic', 0.006)
    for sx in (-0.66, 0.66):
        for sz in (-0.3, 0.3):
            p.box(sx, 0.36, sz, 0.035, 0.72, 0.035, 'aluminium', 0.004)
        p.box(sx, 0.7, 0, 0.035, 0.035, 0.62, 'aluminium', 0.004)
    p.box(-0.2, 0.98, 0.18, 0.56, 0.34, 0.025, 'darksteel', 0.008)
    p.box(-0.2, 0.98, 0.165, 0.53, 0.31, 0.005, 'screen', 0.0)
    p.box(-0.2, 0.8, 0.21, 0.05, 0.14, 0.03, 'darksteel', 0.004)
    p.box(-0.2, 0.755, 0.2, 0.2, 0.012, 0.16, 'darksteel', 0.004)
    p.box(-0.2, 0.757, -0.08, 0.42, 0.015, 0.14, 'darksteel', 0.004)
    p.box(0.18, 0.755, -0.08, 0.07, 0.02, 0.11, 'darksteel', 0.008)
    p.box(0.5, 0.22, 0.08, 0.2, 0.44, 0.42, 'darksteel', 0.008)
    p.box(0.5, 0.36, -0.135, 0.15, 0.08, 0.005, 'aluminium', 0)
    return p.finish()


@module
def office_chair():
    p = Part('office_chair')
    p.box(0, 0.47, 0, 0.48, 0.08, 0.46, 'cushion', 0.03, 3)
    p.box(0, 0.8, 0.23, 0.44, 0.52, 0.06, 'cushion', 0.03, 3, rot=('x', -0.1))
    p.cyl(0, 0.27, 0, 0.025, 0.36, 'chrome', 16)
    for k in range(5):
        a = k / 5 * math.tau
        p.tube((0, 0.07, 0), (math.cos(a) * 0.3, 0.05, math.sin(a) * 0.3), 0.018, 'darksteel')
        p.sphere(math.cos(a) * 0.3, 0.03, math.sin(a) * 0.3, 0.03, 'rubber', 10)
    for sx in (-0.26, 0.26):
        p.box(sx, 0.62, 0.02, 0.04, 0.03, 0.26, 'darksteel', 0.008)
    return p.finish()


@module
def cubby_col():
    """木格置物櫃一欄：寬 40、高 150、深 35 cm，五格。"""
    p = Part('cubby_col')
    for sx in (-0.19, 0.19):
        p.box(sx, 0.75, 0, 0.02, 1.5, 0.35, 'wood', 0.003)
    for k in range(6):
        p.box(0, 0.01 + k * 0.296, 0, 0.36, 0.018, 0.35, 'wood', 0.003)
    p.box(0, 0.75, 0.17, 0.38, 1.48, 0.008, 'wood', 0)
    return p.finish()


@module
def shoe_rack():
    """鞋架 60 cm：黑色鐵管四層斜架。"""
    p = Part('shoe_rack')
    for sx in (-0.29, 0.29):
        for sz in (-0.13, 0.13):
            p.tube((sx, 0, sz), (sx, 1.0, sz), 0.008, 'darksteel')
    for k in range(4):
        y = 0.12 + k * 0.24
        for zz in (-0.12, 0.0, 0.12):
            p.tube((-0.29, y + (0.03 if zz > 0 else 0.0) - zz * 0.25, zz), (0.29, y + (0.03 if zz > 0 else 0.0) - zz * 0.25, zz), 0.006, 'darksteel')
    for k in range(3):
        p.box(-0.12 + k * 0.13, 0.17 + k * 0.24, 0, 0.1, 0.07, 0.26, 'red' if k == 1 else 'white', 0.02, 2)
    return p.finish()


@module
def fridge():
    """玻璃門冷藏櫃 55×55×130：門框、玻璃、層板、飲料、把手、底部散熱格柵。"""
    p = Part('fridge')
    p.box(0, 0.65, 0.02, 0.55, 1.3, 0.51, 'white', 0.015, 3)
    p.box(0, 0.67, -0.25, 0.52, 1.18, 0.035, 'darksteel', 0.01)
    for k in range(4):
        y = 0.22 + k * 0.28
        p.box(0, y, -0.02, 0.44, 0.01, 0.4, 'glass', 0)
        for j in range(4):
            p.cyl(-0.15 + j * 0.1, y + 0.1, -0.12, 0.03, 0.19, ['can_r', 'can_g', 'can_y', 'can_w'][(k + j) % 4], 14)
    p.box(0, 0.67, -0.27, 0.46, 1.1, 0.006, 'glass', 0)
    p.box(0.23, 0.75, -0.29, 0.02, 0.4, 0.02, 'chrome', 0.004)
    p.box(0, 0.05, -0.25, 0.5, 0.06, 0.02, 'darksteel', 0)
    return p.finish()


@module
def stand_ac():
    """落地冷氣 55×38×180：圓角機身、上方出風導葉、中段面板與顯示、下方進風格柵。"""
    p = Part('stand_ac')
    p.box(0, 0.9, 0, 0.55, 1.8, 0.38, 'white', 0.06, 4)
    for k in range(7):
        p.box(0, 1.35 + k * 0.05, -0.19, 0.44, 0.012, 0.03, 'aluminium', 0.003, rot=('x', 0.35))
    p.box(0, 1.0, -0.195, 0.4, 0.22, 0.01, 'plastic', 0.004)
    p.box(0, 1.05, -0.2, 0.12, 0.04, 0.005, 'screen', 0)
    for k in range(10):
        p.box(0, 0.2 + k * 0.035, -0.192, 0.42, 0.012, 0.01, 'darksteel', 0)
    return p.finish()


@module
def floor_fan():
    """立扇：底座、伸縮立桿、馬達、扇葉、前後網罩（圓環＋輻條）。"""
    p = Part('floor_fan')
    p.cyl(0, 0.03, 0, 0.2, 0.05, 'darksteel', 32, r2=0.17, bevel=0.01)
    p.cyl(0, 0.5, 0, 0.018, 0.9, 'chrome', 12)
    p.cyl(0, 1.02, 0.07, 0.07, 0.16, 'darksteel', 20, axis='z')
    for k in range(3):
        a = k / 3 * math.tau
        p.box(math.cos(a) * 0.1, 1.02 + math.sin(a) * 0.1, -0.03, 0.08, 0.17, 0.008, 'plastic', 0.0, rot=('z', a + 0.3))
    for r in (0.06, 0.13, 0.2):
        bm_r = r
        n = 28
        for k in range(n):
            a1, a2 = k / n * math.tau, (k + 1) / n * math.tau
            for zc in (-0.07, 0.03):
                p.tube((math.cos(a1) * bm_r, 1.02 + math.sin(a1) * bm_r, zc), (math.cos(a2) * bm_r, 1.02 + math.sin(a2) * bm_r, zc), 0.0035, 'darksteel', 6)
    for k in range(12):
        a = k / 12 * math.tau
        p.tube((0, 1.02, -0.08), (math.cos(a) * 0.2, 1.02 + math.sin(a) * 0.2, -0.07), 0.003, 'darksteel', 5)
    return p.finish()


@module
def curtain_booth():
    """更衣簾 120×100：L 型鋼管框，布簾有皺褶（波浪面）。"""
    p = Part('curtain_booth')
    for x in (-0.6, 0.6):
        p.tube((x, 0, -0.5), (x, 2.1, -0.5), 0.016, 'chrome')
    p.tube((-0.6, 2.08, -0.5), (0.6, 2.08, -0.5), 0.016, 'chrome')
    p.tube((0.6, 2.08, -0.5), (0.6, 2.08, 0.5), 0.016, 'chrome')
    # 皺褶簾：沿 x 的正弦波面
    bm = bmesh.new()
    nx, ny = 48, 2
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = -0.58 + 1.16 * i / nx
            z = -0.5 + 0.035 * math.sin(i / nx * math.tau * 8)
            y = 0.08 + 1.95 * j / ny
            row.append(bm.verts.new(to_b(x, y, z)))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    o = p._obj(bm, 'curtain', 0, 2, 0, smooth_angle=80)
    sol = o.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.01
    return p.finish()


@module
def banner_panel():
    """牆面布幕一幅：寬 160、高 360 cm，上下穿桿、布面微微下垂。"""
    p = Part('banner_panel')
    p.box(0, 1.8, 0, 1.58, 3.56, 0.012, 'fabric_w', 0.004)
    p.cyl(0, 3.62, 0.0, 0.016, 1.62, 'aluminium', 12, axis='x')
    p.cyl(0, 0.0, 0.0, 0.014, 1.6, 'aluminium', 12, axis='x')
    for x in (-0.7, 0.7):
        p.cyl(x, 3.66, 0.02, 0.012, 0.03, 'darksteel', 8)
    return p.finish()


@module
def net_pole():
    """隔網立柱：鋼管、底座配重、頂部掛網鉤。"""
    p = Part('net_pole')
    p.cyl(0, 2.5, 0, 0.03, 5.0, 'darksteel', 16)
    p.cyl(0, 0.04, 0, 0.2, 0.08, 'darksteel', 24, bevel=0.01)
    for y in (1.0, 2.5, 4.0, 4.9):
        p.box(0, y, 0.04, 0.03, 0.03, 0.06, 'chrome', 0.004)
    return p.finish()


@module
def prefab_door():
    """組合屋門：門框、門片（上方百葉通風）、把手。寬 80、高 205 cm，正面 -z。"""
    p = Part('prefab_door')
    p.box(0, 1.03, 0, 0.9, 2.1, 0.07, 'aluminium', 0.004)
    p.box(0, 1.02, -0.03, 0.8, 2.02, 0.04, 'white', 0.006, 2)
    for k in range(5):
        p.box(0, 1.65 + k * 0.05, -0.055, 0.5, 0.012, 0.012, 'aluminium', 0.002, rot=('x', 0.4))
    p.box(0.3, 1.0, -0.07, 0.12, 0.02, 0.02, 'chrome', 0.004)
    return p.finish()


@module
def ball_basket():
    """可折疊球籃：鋁管 X 腳、深藍帆布籃、上面一層排球（藍黃）。"""
    p = Part('ball_basket')
    x_legs(p, 0.62, 0.62, 0.62, 'aluminium', 0.012, 0.04)
    for (a, b) in [((-0.3, 0.62, -0.3), (0.3, 0.62, -0.3)), ((-0.3, 0.62, 0.3), (0.3, 0.62, 0.3)), ((-0.3, 0.62, -0.3), (-0.3, 0.62, 0.3)), ((0.3, 0.62, -0.3), (0.3, 0.62, 0.3))]:
        p.tube(a, b, 0.012, 'aluminium')
    p.box(0, 0.45, 0, 0.6, 0.34, 0.6, 'canvas', 0.03, 2)
    for i in range(3):
        for j in range(3):
            p.sphere(-0.18 + i * 0.18, 0.68, -0.18 + j * 0.18, 0.1, 'ball_y' if (i + j) % 2 else 'ball_b', 18)
    return p.finish()


@module
def steel_sink():
    """不鏽鋼洗手台：水槽、立水龍頭、四支腳、下層棚板。"""
    p = Part('steel_sink')
    p.box(0, 0.86, 0, 0.6, 0.04, 0.5, 'stainless', 0.004)
    p.box(0, 0.78, 0, 0.42, 0.14, 0.36, 'stainless', 0.008)
    p.box(0, 0.9, 0.24, 0.6, 0.1, 0.02, 'stainless', 0.003)
    p.tube((0, 0.88, 0.18), (0, 1.12, 0.18), 0.014, 'chrome')
    p.tube((0, 1.12, 0.18), (0, 1.1, 0.04), 0.012, 'chrome')
    for sx in (-0.27, 0.27):
        for sz in (-0.22, 0.22):
            p.cyl(sx, 0.38, sz, 0.018, 0.76, 'stainless', 12)
    p.box(0, 0.2, 0, 0.56, 0.02, 0.46, 'stainless', 0.003)
    return p.finish()


@module
def purifier():
    """淨水器（桌上型）：白色機身、出水口、水盤。"""
    p = Part('purifier')
    p.box(0, 0.22, 0, 0.26, 0.44, 0.38, 'white', 0.03, 3)
    p.box(0, 0.3, -0.19, 0.18, 0.12, 0.02, 'screen', 0.005)
    p.cyl(0, 0.2, -0.17, 0.012, 0.05, 'chrome', 10)
    p.box(0, 0.02, -0.15, 0.2, 0.03, 0.1, 'darksteel', 0.005)
    return p.finish()


# ───── 台灣球館常見設備 ─────
@module
def package_ac():
    """箱型冷氣（落地大台，5～10 冷凍噸）120×60×190：上方出風格柵、控制面板、下方進風百葉、底座。正面 -z。"""
    p = Part('package_ac')
    p.box(0, 0.98, 0, 1.2, 1.86, 0.6, 'white', 0.02, 3)
    p.box(0, 0.04, 0, 1.16, 0.08, 0.56, 'darksteel', 0.004)
    for k in range(12):
        p.box(-0.5 + k * 0.091, 1.78, -0.302, 0.012, 0.22, 0.03, 'darksteel', 0.0)
    p.box(0, 1.78, -0.29, 1.1, 0.24, 0.008, 'darksteel', 0)
    p.box(0, 1.4, -0.302, 1.1, 0.42, 0.006, 'plastic', 0.003)
    for k in range(4):
        p.box(0, 1.27 + k * 0.08, -0.307, 1.06, 0.006, 0.006, 'aluminium', 0)
    p.box(0.35, 1.02, -0.305, 0.22, 0.14, 0.01, 'screen', 0.004)
    for r in range(3):
        for c in range(2):
            p.box(0.28 + c * 0.05, 0.85 - r * 0.045, -0.306, 0.035, 0.03, 0.008, 'aluminium', 0.002)
    for k in range(16):
        p.box(0, 0.16 + k * 0.034, -0.302, 1.06, 0.012, 0.02, 'plastic', 0.0, rot=('x', 0.5))
    return p.finish()


@module
def wall_fan():
    """工業壁扇 20 吋：壁掛架、搖頭馬達、扇葉、網罩。背面 +z 貼牆。"""
    p = Part('wall_fan')
    p.box(0, 0, 0.27, 0.16, 0.22, 0.03, 'darksteel', 0.01)
    p.tube((0, 0, 0.26), (0, -0.05, 0.12), 0.018, 'darksteel')
    p.cyl(0, -0.08, 0.06, 0.08, 0.2, 'darksteel', 20, axis='z')
    for k in range(3):
        a = k / 3 * math.tau
        p.box(math.cos(a) * 0.12, -0.08 + math.sin(a) * 0.12, -0.08, 0.1, 0.2, 0.008, 'aluminium', 0.0, rot=('z', a + 0.3))
    for r in (0.08, 0.17, 0.26):
        n = 32
        for k in range(n):
            a1, a2 = k / n * math.tau, (k + 1) / n * math.tau
            for zc in (-0.13, -0.02):
                p.tube((math.cos(a1) * r, -0.08 + math.sin(a1) * r, zc), (math.cos(a2) * r, -0.08 + math.sin(a2) * r, zc), 0.0035, 'darksteel', 6)
    for k in range(16):
        a = k / 16 * math.tau
        p.tube((0, -0.08, -0.14), (math.cos(a) * 0.26, -0.08 + math.sin(a) * 0.26, -0.13), 0.003, 'darksteel', 5)
    return p.finish()


@module
def exhaust_fan():
    """牆面排風扇 60×60：方框、外推百葉、護網。背面 +z 嵌牆。"""
    p = Part('exhaust_fan')
    p.box(0, 0, 0.05, 0.64, 0.64, 0.12, 'aluminium', 0.01)
    p.cyl(0, 0, -0.02, 0.27, 0.04, 'darksteel', 40)
    for k in range(5):
        a = k / 5 * math.tau
        p.box(math.cos(a) * 0.13, math.sin(a) * 0.13, -0.03, 0.1, 0.24, 0.006, 'aluminium', 0.0, rot=('z', a + 0.4))
    for k in range(9):
        p.box(0, -0.28 + k * 0.07, -0.06, 0.6, 0.005, 0.005, 'darksteel', 0)
        p.box(-0.28 + k * 0.07, 0, -0.06, 0.005, 0.6, 0.005, 'darksteel', 0)
    return p.finish()


@module
def water_tall():
    """台灣常見的立式冰溫熱飲水機 45×45×140：冰（藍）溫熱（紅）三個出水口、按鍵面板、接水盤、下方門板。"""
    p = Part('water_tall')
    p.box(0, 0.7, 0, 0.45, 1.4, 0.45, 'stainless', 0.02, 3)
    p.box(0, 1.0, -0.2, 0.4, 0.3, 0.06, 'darksteel', 0.01)
    for k, col in enumerate(['ball_b', 'white', 'red']):
        x = -0.12 + k * 0.12
        p.box(x, 1.08, -0.235, 0.05, 0.05, 0.03, col, 0.008)
        p.cyl(x, 1.02, -0.22, 0.012, 0.06, 'chrome', 10)
    p.box(0, 0.86, -0.21, 0.38, 0.03, 0.12, 'darksteel', 0.006)
    p.box(0, 1.24, -0.226, 0.3, 0.07, 0.006, 'screen', 0.002)
    p.box(0, 0.42, -0.226, 0.4, 0.7, 0.006, 'stainless', 0.002)
    return p.finish()


@module
def flip_score():
    """桌上型翻分板：A 字架、左右兩組翻頁數字、局數小牌。"""
    p = Part('flip_score')
    for s in (-1, 1):
        p.box(0, 0.3, s * 0.08, 0.6, 0.6, 0.012, 'darksteel', 0.004, rot=('x', s * 0.25))
    for x in (-0.15, 0.15):
        for k in range(6):
            p.box(x, 0.36 - k * 0.004, -0.09 - k * 0.003, 0.22, 0.32, 0.003, 'white' if k else ('red' if x < 0 else 'ball_b'), 0.002, rot=('x', -0.25))
    for x in (-0.28, 0.28):
        p.box(x, 0.12, -0.12, 0.08, 0.1, 0.003, 'white', 0.001, rot=('x', -0.25))
    p.cyl(0, 0.6, 0, 0.012, 0.6, 'aluminium', 10, axis='x')
    return p.finish()


@module
def score_stand():
    """電子計分板（立架）140×50：LED 面板（兩隊分數＋局數）、雙腳架。"""
    p = Part('score_stand')
    for x in (-0.55, 0.55):
        p.box(x, 0.45, 0, 0.06, 0.9, 0.06, 'darksteel', 0.004)
        p.box(x, 0.02, 0, 0.08, 0.04, 0.5, 'darksteel', 0.004)
    p.box(0, 1.25, 0, 1.4, 0.7, 0.1, 'darksteel', 0.02, 3)
    for x, col in ((-0.35, 'red'), (0.35, 'ball_b')):
        p.box(x, 1.3, -0.052, 0.42, 0.36, 0.006, 'screen', 0.002)
        p.box(x, 1.3, -0.056, 0.3, 0.26, 0.003, 'emit', 0)
        p.box(x, 1.02, -0.052, 0.4, 0.06, 0.006, col, 0.002)
    p.box(0, 1.3, -0.052, 0.12, 0.16, 0.006, 'screen', 0.002)
    return p.finish()


@module
def whiteboard():
    """戰術白板（移動式）120×90：白板面畫半個球場、鋁框、筆槽、四輪 H 架。"""
    p = Part('whiteboard')
    p.box(0, 1.35, 0, 1.2, 0.9, 0.03, 'white', 0.004)
    p.box(0, 1.35, -0.017, 1.16, 0.86, 0.002, 'plastic', 0)
    p.box(0, 1.35, -0.02, 0.9, 0.45, 0.001, 'ball_b', 0)
    p.box(0, 1.35, -0.021, 0.86, 0.41, 0.001, 'white', 0)
    p.box(0, 1.35, -0.022, 0.006, 0.41, 0.001, 'darksteel', 0)
    for x in (-0.15, 0.15):
        p.box(x, 1.35, -0.022, 0.004, 0.41, 0.001, 'ball_b', 0)
    p.box(0, 0.88, -0.03, 1.0, 0.03, 0.06, 'aluminium', 0.004)
    for x in (-0.62, 0.62):
        p.box(x, 0.95, 0, 0.04, 1.9, 0.04, 'aluminium', 0.004)
        p.box(x, 0.06, 0, 0.05, 0.04, 0.6, 'aluminium', 0.004)
        for z in (-0.28, 0.28):
            p.cyl(x, 0.03, z, 0.03, 0.025, 'rubber', 12, axis='x')
    p.box(0, 0.3, 0, 1.2, 0.03, 0.03, 'aluminium', 0.003)
    return p.finish()


@module
def speaker():
    """音響喇叭（三腳架）：箱體、單體、高音號角、三腳架。"""
    p = Part('speaker')
    p.box(0, 1.65, 0, 0.36, 0.56, 0.32, 'darksteel', 0.02, 3)
    p.cyl(0, 1.58, -0.165, 0.13, 0.02, 'rubber', 32, axis='z')
    p.cyl(0, 1.58, -0.172, 0.04, 0.02, 'darksteel', 20, axis='z')
    p.box(0, 1.84, -0.165, 0.2, 0.08, 0.02, 'rubber', 0.006)
    p.cyl(0, 0.95, 0, 0.018, 0.9, 'darksteel', 12)
    for k in range(3):
        a = k / 3 * math.tau
        p.tube((0, 0.7, 0), (math.cos(a) * 0.45, 0.0, math.sin(a) * 0.45), 0.012, 'darksteel')
    return p.finish()


@module
def wall_tv():
    """壁掛電視 55 吋：薄框、螢幕、壁掛架。背面 +z。"""
    p = Part('wall_tv')
    p.box(0, 0, 0.0, 1.24, 0.72, 0.03, 'darksteel', 0.006)
    p.box(0, 0, -0.016, 1.2, 0.68, 0.003, 'screen', 0)
    p.box(0, 0, 0.03, 0.4, 0.3, 0.03, 'darksteel', 0.004)
    return p.finish()


@module
def wall_clock():
    """掛鐘 直徑 35 cm：外框、錶面、時針分針。背面 +z。"""
    p = Part('wall_clock')
    p.cyl(0, 0, 0, 0.175, 0.04, 'darksteel', 40, axis='z', bevel=0.01)
    p.cyl(0, 0, -0.02, 0.16, 0.005, 'white', 40, axis='z')
    for k in range(12):
        a = k / 12 * math.tau
        p.box(math.sin(a) * 0.14, math.cos(a) * 0.14, -0.024, 0.008, 0.022, 0.002, 'darksteel', 0, rot=('z', -a))
    p.box(0.03, 0.02, -0.027, 0.07, 0.008, 0.002, 'darksteel', 0, rot=('z', 0.6))
    p.box(-0.01, 0.05, -0.028, 0.006, 0.11, 0.002, 'darksteel', 0, rot=('z', 0.2))
    return p.finish()


@module
def recycle_bins():
    """分類回收桶（三格）：一般垃圾、紙類、瓶罐，掀蓋與標示色塊。"""
    p = Part('recycle_bins')
    for k, col in enumerate(['darksteel', 'ball_b', 'green']):
        x = -0.32 + k * 0.32
        p.box(x, 0.36, 0, 0.3, 0.72, 0.36, 'plastic', 0.015, 2)
        p.box(x, 0.74, 0, 0.31, 0.04, 0.37, col, 0.01)
        p.box(x, 0.74, -0.08, 0.16, 0.045, 0.06, 'darksteel', 0.004)
        p.box(x, 0.5, -0.182, 0.16, 0.1, 0.004, col, 0.002)
    return p.finish()


@module
def bleacher_mod():
    """鋁製活動看台一節：寬 200 cm、三階（每階深 80、高 40 cm），鋁座板、鋼架、扶手。"""
    p = Part('bleacher_mod')
    for i in range(3):
        y = 0.42 * (i + 1)
        z = -1.2 + 0.8 * i + 0.4
        p.box(0, y, z - 0.15, 2.0, 0.04, 0.32, 'aluminium', 0.004)
        p.box(0, y - 0.21, z + 0.12, 2.0, 0.03, 0.26, 'aluminium', 0.004)
        for x in (-0.95, 0.0, 0.95):
            p.box(x, y / 2, z, 0.05, y, 0.05, 'darksteel', 0.003)
    for x in (-0.95, 0.0, 0.95):
        p.tube((x, 0.02, -1.15), (x, 1.26, 1.15), 0.02, 'darksteel')
    for x in (-1.0, 1.0):
        p.tube((x, 1.3, 0.85), (x, 2.2, 0.85), 0.018, 'chrome')
    p.tube((-1.0, 2.2, 0.85), (1.0, 2.2, 0.85), 0.018, 'chrome')
    return p.finish()


@module
def aed_cabinet():
    """AED 壁掛箱：白色箱體、綠色標示、透明窗、裡面的 AED。背面 +z。"""
    p = Part('aed_cabinet')
    p.box(0, 0, 0, 0.42, 0.52, 0.2, 'white', 0.01, 2)
    p.box(0, 0.05, -0.1, 0.34, 0.32, 0.006, 'glass', 0)
    p.box(0, 0.05, -0.04, 0.26, 0.24, 0.1, 'green', 0.02)
    p.box(0, -0.2, -0.102, 0.36, 0.08, 0.004, 'green', 0.002)
    return p.finish()



@module
def cubby_low():
    """矮木格置物櫃一欄：寬 40、高 90、深 35 cm，三格放包包鞋子，頂板可以放東西；前下方踢腳板。"""
    p = Part('cubby_low')
    for sx in (-0.19, 0.19):
        p.box(sx, 0.45, 0, 0.02, 0.9, 0.35, 'wood', 0.003)
    for k in range(4):
        p.box(0, 0.06 + k * 0.275, 0, 0.36, 0.018, 0.35, 'wood', 0.003)
    p.box(0, 0.89, 0, 0.4, 0.022, 0.37, 'wood', 0.004)
    p.box(0, 0.45, 0.17, 0.38, 0.88, 0.008, 'wood', 0)
    p.box(0, 0.025, -0.165, 0.38, 0.05, 0.015, 'wood', 0.002)
    return p.finish()


@module
def urinal():
    """壁掛小便斗：陶瓷斗身、感應沖水器。背面 +z 貼牆。"""
    p = Part('urinal')
    p.box(0, 0.88, 0.1, 0.36, 0.66, 0.2, 'ceramic', 0.07, 4)
    p.sphere(0, 0.74, 0.0, 0.17, 'ceramic', 24, scale=(1.0, 1.25, 0.9))
    p.box(0, 0.86, -0.08, 0.26, 0.4, 0.04, 'darksteel', 0.02)
    p.box(0, 1.3, 0.16, 0.12, 0.14, 0.06, 'chrome', 0.01)
    p.tube((0, 1.23, 0.16), (0, 1.16, 0.14), 0.012, 'chrome')
    return p.finish()


@module
def wc_stall():
    """廁所隔間一間（不含馬桶）：寬 95、深 150、高 200，隔板下緣離地 15 cm，正面門（關著）、門鎖、上方鋁橫桿、衛生紙架。正面 -z。"""
    p = Part('wc_stall')
    for x in (-0.46, 0.46):
        p.box(x, 1.075, 0.0, 0.025, 1.85, 1.5, 'laminate', 0.004)
        for z in (-0.7, 0.7):
            p.box(x, 0.075, z, 0.035, 0.15, 0.035, 'chrome', 0.004)
    p.box(0, 2.0, -0.74, 0.95, 0.04, 0.04, 'aluminium', 0.004)
    p.box(0, 1.075, -0.745, 0.86, 1.85, 0.025, 'laminate', 0.004)
    p.box(0.33, 1.0, -0.76, 0.08, 0.03, 0.02, 'chrome', 0.004)
    p.box(0.33, 1.05, -0.76, 0.04, 0.03, 0.006, 'green', 0.002)
    for y in (0.4, 1.7):
        p.box(-0.42, y, -0.76, 0.03, 0.12, 0.02, 'chrome', 0.004)
    p.cyl(0.43, 0.72, 0.15, 0.065, 0.11, 'chrome', 16, axis='x')
    return p.finish()


# ───── 建模、排開（彼此不遮擋）、地板 ─────
t0 = time.time()
objs = []
for i, fn in enumerate(MODULES):
    o = fn()
    o.location = Vector(((i % 6) * 4.0, -(i // 6) * 4.0, 0))
    objs.append(o)
print('MODEL_OK', len(objs), 'modules', f'{time.time() - t0:.1f}s', flush=True)

bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
me = bpy.data.meshes.new('ground')
bm.to_mesh(me)
bm.free()
ground = bpy.data.objects.new('ground', me)
scene.collection.objects.link(ground)
ground.location = Vector((10, -6, 0))
me.materials.append(MATS['white'])

# ───── AO 圖集：所有模組共用一組第二 UV（ao），先平均島的比例再一起打包 ─────
for o in objs:
    if not o.data.uv_layers.get('ao'):
        o.data.uv_layers.new(name='ao')
    o.data.uv_layers.active = o.data.uv_layers['ao']
    o.data.uv_layers['UVMap'].active_render = True
for o in bpy.context.view_layer.objects:
    o.select_set(o in objs)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(rotate=True, margin=4 / ATLAS)
bpy.ops.object.mode_set(mode='OBJECT')
print('UV_OK', f'{time.time() - t0:.1f}s', flush=True)

scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'
except Exception as e:  # 沒有 OptiX 就用 CPU
    print('GPU_FALLBACK', e)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.world = bpy.data.worlds.new('w')
scene.world.light_settings.distance = 0.35   # AO 只看 35 cm 內的遮擋：物件自己的縫、凹處、貼地處

img = bpy.data.images.new('gym_kit_ao', ATLAS, ATLAS, alpha=False)
img.generated_color = (1, 1, 1, 1)
for m in MATS.values():
    nt = m.node_tree
    n = nt.nodes.new('ShaderNodeTexImage')
    n.name = 'AO_BAKE'
    n.image = img
    for x in nt.nodes:
        x.select = False
    n.select = True
    nt.nodes.active = n
for o in bpy.context.view_layer.objects:
    o.select_set(o in objs)
bpy.context.view_layer.objects.active = objs[0]
scene.render.bake.margin = 6
scene.render.bake.margin_type = 'EXTEND'
bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
print('BAKE_OK', f'{time.time() - t0:.1f}s', flush=True)

os.makedirs(OUT, exist_ok=True)
# AO 是低頻的明暗，2048 烘、縮成 1024 存 JPG（約 250 KB）就夠
img.scale(ATLAS // 2, ATLAS // 2)
st = scene.render.image_settings
st.file_format = 'JPEG'
st.quality = 82
st.color_mode = 'BW'
scene.view_settings.view_transform = 'Standard'
img.save_render(os.path.join(OUT, 'gym-kit-ao.jpg'), scene=scene)

# ───── 匯出：只有模組（不含地板），不嵌圖片；網站依材質名稱換成自己的材質，AO 貼在第二組 UV ─────
for m in MATS.values():
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['AO_BAKE'])
for o in bpy.context.view_layer.objects:
    o.select_set(o in objs)
glb = os.path.join(OUT, 'gym-kit.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE',
                          export_yup=True, export_extras=False, export_lights=False, export_cameras=False,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10,
                          export_draco_texcoord_quantization=14)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
print('EXPORT_OK', os.path.getsize(glb) // 1024, 'KB', tris, 'tris', f'{time.time() - t0:.1f}s', flush=True)
