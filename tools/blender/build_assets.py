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
ATLAS = 2048

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
