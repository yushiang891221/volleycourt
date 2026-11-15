# 球衣花樣：模型只負責形狀，花樣全部畫在貼圖上（插肩細線、兩側直條、領口配色、背號），邊緣乾淨沒有鋸齒
# UV 排版（網頁用同一套排版畫隊伍顏色）：
#   身體：u＝繞身體一圈（0.25 正前方、0.75 正後方、0/1 角色右側），v＝0.3（下擺）～1.0（領口）
#   袖子：v＝0～0.28；右袖 u＝0～0.5、左袖 u＝0.5～1（繞手臂一圈），v 從袖口（0）到肩膀（0.28）
import bpy, math, json, os
from mathutils import Vector
from common import *

Z0, Z1 = 0.56, 1.1
LAYOUT = {'torso_v': [0.3, 1.0], 'torso_z': [Z0, Z1], 'front_u': 0.25, 'back_u': 0.75, 'sleeve_v': [0.0, 0.28]}


def is_arm(c):
    return arm_dist(c) < 0.1 and arm_param(c) > 0.02


def uv_of(c, arm=None):
    if arm if arm is not None else is_arm(c):
        s = 1 if c.x > 0 else -1; d = arm_dir(s); side = Vector((d.z * -1 * s, 0, d.x * s)) if False else Vector((math.cos(ARM_A) * s, 0, math.sin(ARM_A)))
        rel = c - arm_pt(s, 0); ang = math.atan2(rel.y, rel.dot(side)) / (2 * math.pi) % 1
        v = 0.28 * max(0, min(1, 1 - arm_param(c) / (UA + FA + 0.05)))
        return (0.0 if s < 0 else 0.5) + 0.5 * ang, v, True
    u = (math.atan2(c.x, -c.y) / (2 * math.pi) + 0.25) % 1
    v = 0.3 + 0.7 * max(0, min(1, (c.z - Z0) / (Z1 - Z0)))
    return u, v, False


def unwrap(ob):
    me = ob.data; uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    # 袖子／衣身照「跟哪根骨頭動」分：肩膀關節球那段（站著藏在衣身裡）舉手時露出來，要是袖子的素色，不能貼到衣身側邊條紋
    names = {g.index: g.name for g in ob.vertex_groups}
    armv = [sum(g.weight for g in v.groups if names.get(g.group, '').startswith(('upperarm', 'forearm'))) > 0.5 for v in me.vertices] if names else None
    for p in me.polygons:
        us = []
        fa = None if armv is None else sum(armv[me.loops[li].vertex_index] for li in p.loop_indices) * 2 > len(p.loop_indices)
        for li in p.loop_indices:
            u, v, arm = uv_of(me.vertices[me.loops[li].vertex_index].co, fa); us.append([li, u, v])
        lo = [x[1] for x in us]
        if fa and max(lo) - min(lo) > 0.25:   # 袖子繞一圈的接縫：小的那邊 +0.5（兩邊袖子圖案一樣、貼圖會重複），不然整個面拉過整條袖子變成黑色尖刺
            m0 = min(lo)
            for x in us:
                if x[1] < m0 + 0.25: x[1] += 0.5
        elif max(lo) - min(lo) > 0.5:   # 跨過接縫的面：小的那邊 +1（貼圖會重複）
            for x in us:
                if x[1] < 0.5: x[1] += 1
        for li, u, v in us: uv.data[li].uv = (u, v)


def kit_image(name, body, accent, piping, num, numcol, size=1024):
    """Blender 預覽用的貼圖（網頁裡用 canvas 照同一套排版畫）。線條有柔邊，不會鋸齒"""
    import numpy as np
    W = H = size; img = bpy.data.images.get(name) or bpy.data.images.new(name, W, H)
    def hexc(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    B, A, P = hexc(body), hexc(accent), hexc(piping)
    u = np.linspace(0, 1, W)[None, :].repeat(H, 0); v = np.linspace(0, 1, H)[:, None].repeat(W, 1)
    col = np.ones((H, W, 3)) * B
    aa = 1.5 / W
    def blend(mask_dist, half, c):   # 距離小於 half 的地方塗 c，邊緣 1.5 像素柔邊
        a = np.clip((half - mask_dist) / aa + 0.5, 0, 1)[..., None]
        return col * (1 - a) + c * a
    torso = v >= 0.3; tv = (v - 0.3) / 0.7
    d_side = np.minimum(np.minimum(np.abs(u - 0.0), np.abs(u - 0.5)), np.abs(u - 1.0))
    t = np.where(torso & (tv < 0.62), d_side, 9); col = blend(t, 0.056, P); col = blend(t, 0.046, A)   # 兩側直條＋白色鑲邊（只到腋下）
    for fc in (0.25, 0.75):   # 插肩細線：領口斜到腋下
        for sg in (-1, 1):
            top_u, bot_u, top_v, bot_v = fc + sg * 0.075, fc + sg * 0.2, 1.0, 0.62
            ul = top_u + (bot_u - top_u) * (top_v - tv) / (top_v - bot_v)
            dd = np.where(torso & (tv >= bot_v), np.abs(u - ul), 9); col = blend(dd, 0.0045, P)
    px = np.concatenate([col, np.ones((H, W, 1))], 2).astype(np.float32).ravel()
    img.pixels.foreach_set(px)
    return img


def kit_material(name, img):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.72
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    return m


def save_layout():
    json.dump(LAYOUT, open(os.path.join(OUT, 'jersey_layout.json'), 'w'), indent=1)
