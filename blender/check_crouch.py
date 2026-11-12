# 低姿勢檢查：照網頁 avatar-toy.js applyStaticPose 的套法擺 gym.html 的低姿勢，量皮膚有沒有穿出褲子／護膝、褲子邊有沒有被拉長成尖角
# 執行：blender --background -t 4 models/avatar_{sex}.blend --python blender/check_crouch.py -- {sex} [web] [render]（web＝先照 export_web.py 減面）
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from common import *

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX = int(args[0]) if args else 0
RENDER = 'render' in args
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if 'web' in args:   # 先照 export_web.py 減面（網頁實際用的是減面後的網格）
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export_web.py'), encoding='utf-8').read().split('# 貼圖不打包')[0]
    exec(src.split('import bpy, json')[1])
pb = rig.pose.bones
# gym.html AVP（只取腿、脊椎）
POSES = {
    'idle': dict(hip=[0.02, 0.02], kn=[0.06, 0.06], sp=0.04),
    'ready': dict(hip=[0.85, 0.85], kn=[1.3, 1.3], hab=[0.2, 0.2], sp=0.58),
    'crouch': dict(hip=[1.25, 1.25], kn=[1.95, 1.95], hab=[0.28, 0.28], sp=0.72),
    'bump': dict(hip=[0.92, 0.92], kn=[1.42, 1.42], hab=[0.2, 0.2], sp=0.55),
    'land': dict(hip=[0.9, 0.9], kn=[1.5, 1.5], hab=[0.16, 0.16], sp=0.45),
    'kneel': dict(hip=[1.45, 1.45], kn=[2.3, 2.3], hab=[0.14, 0.14], sp=0.45),
    'sideLunge': dict(hip=[1.05, 0.15], kn=[1.85, 0.05], hab=[0.75, 0.65], sp=0.72),
    'sideTuck': dict(hip=[2.0, 2.0], kn=[2.1, 2.1], hab=[0.12, 0.12], sp=0.55),
    'diveSlide': dict(hip=[-0.06, 0.08], kn=[1.75, 1.95], hab=[0.08, 0.1], sp=-0.5),
    'airUp': dict(hip=[-0.18, 0.12], kn=[1.3, 0.95], sp=-0.42, tw=0.45),
}


def setrot(name, R):
    b = rig.data.bones[name]; Rr = b.matrix_local.to_3x3()
    p = pb[name]; p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = (Rr.inverted() @ R @ Rr).to_quaternion()


def pose(P):
    for p in pb: p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = (1, 0, 0, 0)
    for i, side in enumerate('RL'):
        sx = -1 if i == 0 else 1; hab = P.get('hab', [0, 0])[i]
        # 網頁 (x,y,z) = Blender (x,z,-y)：繞網頁 X＝繞 Blender X；繞網頁 Z＝繞 Blender -Y；繞網頁 Y＝繞 Blender Z
        setrot(f'thigh.{side}', Matrix.Rotation(-P['hip'][i], 3, 'X') @ Matrix.Rotation(-sx * hab, 3, 'Y'))
        setrot(f'shin.{side}', Matrix.Rotation(P['kn'][i], 3, 'X'))
    setrot('spine', Matrix.Rotation(P.get('sp', 0), 3, 'X') @ Matrix.Rotation(P.get('tw', 0), 3, 'Z'))
    bpy.context.view_layer.update()


def ev(o, normals=False):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); me = e.to_mesh()
    vs = [e.matrix_world @ v.co for v in me.vertices]; ed = [tuple(x.vertices) for x in me.edges]; fs = [tuple(f.vertices) for f in me.polygons]
    ns = [(e.matrix_world.to_3x3() @ v.normal).normalized() for v in me.vertices] if normals else None
    e.to_mesh_clear(); return (vs, ed, fs, ns) if normals else (vs, ed, fs)


body = bpy.data.objects['body']
SHELLS = ['pants_0', 'pants_1', 'knee_0', 'knee_1']
pose(POSES['idle'])
REST = {n: ev(bpy.data.objects[n]) for n in SHELLS}
B0 = ev(body, True)
# 站姿時「從皮膚沿法線往外 4.5 公分內會打到這件衣服」的點＝被蓋住的點；擺姿勢後同樣射線打不到衣服＝皮膚露出來（穿出去或縫隙）
COVER = {}
for n in SHELLS:
    vs, _, fs = REST[n]; tree = BVHTree.FromPolygons(vs, fs)
    COVER[n] = {i for i, (v, no) in enumerate(zip(B0[0], B0[3])) if tree.ray_cast(v, no, 0.045)[0] is not None}
total = 0
for name, P in POSES.items():
    pose(P); bv, _, _, bn = ev(body, True); line = []
    for n in SHELLS:
        vs, ed, fs = ev(bpy.data.objects[n]); tree = BVHTree.FromPolygons(vs, fs); pts = []
        for i in COVER[n]:
            if tree.ray_cast(bv[i], bn[i], 0.06)[0] is None and tree.find_nearest(bv[i])[3] < 0.03: pts.append(bv[i])
        rv = REST[n][0]; st = 0; worst = 1
        for a_, b_ in ed:
            l0 = (rv[a_] - rv[b_]).length
            if l0 < 1e-5: continue
            r = (vs[a_] - vs[b_]).length / l0; worst = max(worst, r); st += r > 2.2
        # 褲子最低點（尖角會往下垂）：相對兩邊膝蓋高度
        low = min(vs, key=lambda v: v.z) if n.startswith('pants') else None
        if n in ('pants_0', 'knee_0'): total += len(pts)
        pr = [p for p in pts if p.x < 0]; c = sum(pr, Vector())   # 右腿那側的平均位置（左右一起平均會變成 x=0 看不出在哪）
        line.append(f'{n}: 露出 {len(pts)}' + (f'（右側中心 {tuple(round(x, 2) for x in c / len(pr))}）' if pr else '') + f' 拉長邊 {st} 最多 {worst:.1f}x' + (f' 最低點 {tuple(round(x, 2) for x in low)}' if low else ''))
    print('POSE', name); [print('   ', x) for x in line]
    if RENDER and name in ('crouch', 'ready', 'kneel', 'land'):
        keep = {'body', 'pants_0', 'knee_0', 'socks', 'shoeR', 'shoeL', 'top_1', 'collar_1'}
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.parent == rig: o.hide_render = o.name not in keep
        for cn, cam in {'front': (0.35, -1.5, 0.75), 'side': (1.55, -0.25, 0.6), 'back': (-0.35, 1.5, 0.8), 'low': (0.5, -1.2, 0.25)}.items():
            render(os.path.join(SHOT, f'crouch_{SEX}_{name}_{cn}.png'), cam, (0, -0.05, 0.5), 55, (480, 480))
print('TOTAL_POKE', total)
