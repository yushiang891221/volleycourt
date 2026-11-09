# Pose check: load models/avatar_{sex}.blend, pose the rig into volleyball actions, render front/side/back for each.
# Usage: blender --background -t 4 models/avatar_0.blend --python check_poses.py -- 0 [top]
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math
from common import *

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX = int(args[0]) if args else 0
TOP = int(args[1]) if len(args) > 1 else 1
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
keep = {'body', 'head', 'socks', 'shoeR', 'shoeL', f'top_{TOP}', f'collar_{TOP}', 'pants_0', 'knee_0', 'hair_2' if SEX == 0 else 'hair_4'}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == rig: o.hide_render = o.name not in keep
pb = rig.pose.bones
for b in pb: b.rotation_mode = 'XYZ'
# Bone rotations (radians, bone-local). Arms start in A-pose; legs point down.
POSES = {
    'stand': {},
    'ready': {'thigh.R': (-0.9, 0, 0), 'thigh.L': (-0.9, 0, 0), 'shin.R': (1.3, 0, 0), 'shin.L': (1.3, 0, 0), 'spine': (0.5, 0, 0), 'upperarm.R': (-0.7, 0, 0.3), 'upperarm.L': (-0.7, 0, -0.3), 'forearm.R': (-0.9, 0, 0), 'forearm.L': (-0.9, 0, 0)},
    'bump': {'thigh.R': (-0.8, 0, 0), 'thigh.L': (-0.8, 0, 0), 'shin.R': (1.2, 0, 0), 'shin.L': (1.2, 0, 0), 'spine': (0.45, 0, 0), 'upperarm.R': (-1.0, 0, 0.5), 'upperarm.L': (-1.0, 0, -0.5)},
    'set': {'upperarm.R': (-2.5, 0, 0.1), 'upperarm.L': (-2.5, 0, -0.1), 'forearm.R': (-1.6, 0, 0), 'forearm.L': (-1.6, 0, 0)},
    'spike': {'upperarm.R': (-2.7, 0, 0.3), 'upperarm.L': (-1.3, 0, 0), 'spine': (-0.3, 0.4, 0)},
    'block': {'upperarm.R': (-2.75, 0, 0.45), 'upperarm.L': (-2.75, 0, -0.45)},
}
from mathutils.bvhtree import BVHTree
def eval_mesh(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); me = e.to_mesh()
    vs = [e.matrix_world @ v.co for v in me.vertices]; ed = [tuple(x.vertices) for x in me.edges]; fs = [tuple(f.vertices) for f in me.polygons]
    e.to_mesh_clear(); return vs, ed, fs
def snapshot():
    return {o.name: eval_mesh(o) for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and not o.hide_render}
for b in pb: b.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update(); REST = snapshot()
COVER = set()   # 站姿時被球衣蓋住的身體點（只檢查這些有沒有穿出來）
_t = next((k for k in REST if k.startswith('top_')), None)
if _t and 'body' in REST:
    _tree = BVHTree.FromPolygons(REST[_t][0], REST[_t][2])
    for i, v in enumerate(REST['body'][0]):
        h = _tree.find_nearest(v)
        if h[0] and h[3] < 0.04 and (v - h[0]).dot(h[1]) < 0: COVER.add(i)
REPORT = []
def metrics(name):
    cur = snapshot(); bad = []
    for on, (vs, ed, fs) in cur.items():
        rv = REST[on][0]; worst = 0; where = None; n = 0
        for a_, b_ in ed:
            l0 = (rv[a_] - rv[b_]).length
            if l0 < 1e-5: continue
            r = (vs[a_] - vs[b_]).length / l0
            if r > 1.8: n += 1
            if r > worst: worst, where = r, (vs[a_] + vs[b_]) / 2
        if n: bad.append(f'{on}: {n} 條邊被拉長（最多 {worst:.1f} 倍，位置 {tuple(round(c, 2) for c in where)}）')
    top = next((k for k in cur if k.startswith('top_')), None)
    if top and 'body' in cur:
        tv, _, tf = cur[top]; tree = BVHTree.FromPolygons(tv, tf); poke = 0; pts = []
        bv = cur['body'][0]; rb = REST['body'][0]
        for i in COVER:
            v = bv[i]; hit = tree.find_nearest(v)
            if hit[0] and (v - hit[0]).dot(hit[1]) > 0.003: poke += 1; pts.append(v)
        if poke > 15: bad.append(f'{top}: 身體穿出衣服 {poke} 個點（例如 {tuple(round(c, 2) for c in pts[0])}）')
    REPORT.append((name, bad))

CAMS = {'front': (1.0, -3.0, 1.1), 'side': (3.2, -0.3, 1.0), 'back': (-1.0, 3.0, 1.2)}
out = []
for name, P in POSES.items():
    for b in pb: b.rotation_euler = (0, 0, 0)
    for bn, r in P.items():
        if bn in pb: pb[bn].rotation_euler = r
    bpy.context.view_layer.update(); metrics(name)
    for cn, cam in CAMS.items():
        f = os.path.join(SHOT, f'chk_{SEX}_{TOP}_{name}_{cn}.png'); render(f, cam, (0, 0, 0.8), 55, (360, 360)); out.append(f)
for name, bad in REPORT:
    print('POSE', name, 'OK' if not bad else 'BAD')
    for x in bad: print('   ', x)
print('CHECKED', len(out))
