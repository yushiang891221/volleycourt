"""寫實排球貼圖：比賽球（黃＋寶藍三條弧帶）的顏色圖、法線圖、粗糙度圖。

球面用等距長方投影（跟 three.js 的 SphereGeometry UV 一樣：u＝經度、v＝緯度，最上面一列是北極）。
每個像素換回球面上的方向，再決定：
- 顏色：三條藍色弧帶從兩端的 Y 字會合點繞出來（約轉 120°），其餘是黃色；接縫處顏色暗一點
- 高度：每片面板中間微微鼓起、接縫凹下去；整顆球有細小的點狀凹紋（約 3.5 mm 一顆）
- 法線：由高度算出（考慮投影在兩極的拉伸）
- 粗糙度：面板表面有點亮、接縫與凹點比較霧

用法：python tools/ball_texture.py   → 輸出 img/ball/ball_color.jpg、ball_normal.png、ball_rough.jpg
"""
import os
import numpy as np
from PIL import Image

W, H = 2048, 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'img', 'ball')
os.makedirs(OUT, exist_ok=True)

YELLOW = np.array([255, 196, 0], float)
BLUE = np.array([20, 46, 168], float)
TWIST = 0.68          # 弧帶從一端到另一端轉的量（每弧度極角轉多少）
BADGE = np.array([0.62, 0.35, 0.7]); BADGE /= np.linalg.norm(BADGE)

r = (np.arange(H) + 0.5) / H * np.pi            # 極角（從 +y）
q = (np.arange(W) + 0.5) / W * 2 * np.pi        # 經度
th, ph = np.meshgrid(r, q, indexing='ij')
st, ct = np.sin(th), np.cos(th)
x, y, z = -np.cos(ph) * st, ct, np.sin(ph) * st   # three.js SphereGeometry 的頂點公式

def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi

# 花紋以 x 軸為軸
pol = np.arccos(np.clip(x, -1, 1)); sp = np.sin(pol); az = np.arctan2(z, y)
width = 0.5 + 0.42 * sp
d_arm = np.full(x.shape, 9.0); d_mid = np.full(x.shape, 9.0); d_cen = np.full(x.shape, 9.0)
for k in range(3):
    a0 = k * 2 * np.pi / 3 + TWIST * pol
    d_arm = np.minimum(d_arm, np.abs(wrap(az - a0)) * np.maximum(sp, 0.02))
    d_mid = np.minimum(d_mid, np.abs(wrap(az - a0 - np.pi / 3)) * np.maximum(sp, 0.02))
blue = d_arm < width / 2
# 接縫：藍帶兩側的邊、黃色區正中間一條（面板接縫）；離 Y 字會合點太近的地方合併
edge = np.abs(d_arm - width / 2)
seam_d = np.where(blue, edge, np.minimum(edge, d_mid))
# 額外的橫向接縫：每條帶子在兩端 1/3 處各一道，讓面板數接近真實的球
for frac in (0.33, 0.67):
    seam_d = np.minimum(seam_d, np.abs(pol - np.pi * frac) * 1.0 + np.where(blue, 0, 9))

# 顏色
col = np.where(blue[..., None], BLUE, YELLOW)
seam_k = np.clip(seam_d / 0.010, 0, 1)
col = col * (0.6 + 0.4 * seam_k[..., None])
# 小圓章
bd = x * BADGE[0] + y * BADGE[1] + z * BADGE[2]
col[bd > 0.9972] = [250, 214, 70]
col[(bd > 0.9955) & (bd <= 0.9972)] = [40, 40, 44]

# 高度：面板鼓起（離接縫越遠越高，平滑飽和）
pillow = 1 - np.exp(-(seam_d / 0.045) ** 2)
# 點狀凹紋：3D 格點，最近格點距離 < 半徑就凹下去
S = 1 / 0.033                                   # 球半徑 1 → 約 33 個點；實際 r=10.5 cm → 3.5 mm
P = np.stack([x, y, z], -1) * S
nearest = np.round(P)
dd = np.linalg.norm(P - nearest, axis=-1)
dimple = np.clip(1 - dd / 0.38, 0, 1) ** 1.5
height = pillow * 1.0 - dimple * 0.22 * pillow

# 法線（考慮經度方向在兩極被壓縮）
du = 2 * np.pi / W * np.maximum(st, 0.05); dv = np.pi / H
dh_du = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * du)
dh_dv = (np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)) / (2 * dv)   # 往上（列數變小）為正
STR = 0.010                                     # 高度的實際尺度（半徑的倍數）
nx, ny = -dh_du * STR, -dh_dv * STR
nz = np.ones_like(nx)
n = np.stack([nx, ny, nz], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
nrm = ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)

# 粗糙度：面板 0.42、接縫與凹點 0.75
rough = 0.42 + 0.33 * (1 - seam_k) + 0.18 * dimple
rough = (rough.clip(0, 1) * 255).astype(np.uint8)

Image.fromarray(col.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'ball_color.jpg'), quality=90)
Image.fromarray(nrm).save(os.path.join(OUT, 'ball_normal.png'), optimize=True)
Image.fromarray(rough).save(os.path.join(OUT, 'ball_rough.jpg'), quality=88)
print('ok', W, H)
