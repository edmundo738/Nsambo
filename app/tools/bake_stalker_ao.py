# A10 (RELATORIO): skin.ao.jpg quase todo branco (p95=p99=255) → AO não ocluía nada.
# Reassa AO real a partir da própria geometria do GLB (oclusão de hemisfério por vértice,
# amostragem determinística de Fibonacci, raio máximo 0.6 m) e rasteriza em espaço UV (2048²),
# com expansão linear do termo de oclusão (1.35×) para a oclusão de contacto ser legível.
# Uso: python3 app/tools/bake_stalker_ao.py [saida.jpg]   (default: assets/textures/stalker/skin.ao.jpg)
import json, struct, sys
import numpy as np
from PIL import Image

N_DIRS = 24
R_MAX = 0.6
EPS = 1e-3
RES = 2048
DILATE = 10
BLUR = 1.2

glb = open('assets/models/stalker.glb' if False else '/home/user/Nsambo/assets/models/stalker.glb', 'rb').read()
jlen = struct.unpack_from('<I', glb, 12)[0]
j = json.loads(glb[20:20+jlen])
b8 = 20 + jlen
blen = struct.unpack_from('<I', glb, b8)[0]
bin_ = glb[b8+8:b8+8+blen]

def acc(i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}[a['componentType']]
    return np.frombuffer(bin_, dtype=dt, count=a['count']*n, offset=off).reshape(a['count'], n)

pos = acc(j['meshes'][0]['primitives'][0]['attributes']['POSITION']).astype(np.float64)
nrm = acc(j['meshes'][0]['primitives'][0]['attributes']['NORMAL']).astype(np.float64)
uv  = acc(j['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']).astype(np.float64)
idx = acc(j['meshes'][0]['primitives'][0]['indices']).ravel().astype(np.int64)
nl = np.linalg.norm(nrm, axis=1, keepdims=True); nrm /= np.maximum(nl, 1e-9)
print(f'verts {pos.shape[0]} · tris {len(idx)//3}')

# solda posições duplicadas (seams) para o AO não tremer através do seam
key = np.round(pos, 4)
_, inv, counts = np.unique(key, axis=0, return_inverse=True, return_counts=True)
print(f'posições únicas: {counts.shape[0]} (de {pos.shape[0]})')
uniq = np.zeros((counts.shape[0], 3)); unrm = np.zeros((counts.shape[0], 3))
np.add.at(uniq, inv, pos); np.add.at(unrm, inv, nrm)
unrm /= np.maximum(np.linalg.norm(unrm, axis=1, keepdims=True), 1e-9)

# direções de hemisfério (Fibonacci) + pesos de cosseno
i = np.arange(N_DIRS) + 0.5
phi = np.pi * (1 + 5**0.5) * i
y = 1 - i / N_DIRS                      # cosseno do ângulo polar (1→0)
r = np.sqrt(np.maximum(0, 1 - y*y))
dirs_local = np.stack([np.cos(phi)*r, np.sin(phi)*r, y], axis=1)   # +Z hemisfério
wts = dirs_local[:, 2].copy()           # cosseno

# triângulos (mundo)
A = pos[idx[0::3]]; B = pos[idx[1::3]]; C = pos[idx[2::3]]
triC = np.stack([A, B, C], axis=1)      # [T,3,3]

def occluded(origins, normals):
    occ = np.zeros(len(origins))
    T = len(A)
    CH = 256
    # triângulos pré-achatados (columnas) — broadcast [N,T] por passo
    aA, aB, aC = A, B, C
    e1 = aB - aA; e2 = aC - aA
    for u in range(N_DIRS):
        d = dirs_local[u]
        w = wts[u]
        up = np.array([0.0, 0.0, 1.0])
        t = np.cross(up, normals)
        tl = np.linalg.norm(t, axis=1, keepdims=True)
        small = (tl[:, 0] < 1e-6)
        if small.any():
            t[small] = np.cross(np.array([1.0, 0.0, 0.0]), normals[small])
        t /= np.linalg.norm(t, axis=1, keepdims=True)
        b = np.cross(normals, t)
        D = normals * d[2] + t * d[0] + b * d[1]
        D /= np.linalg.norm(D, axis=1, keepdims=True)
        block = np.zeros(len(origins), dtype=bool)
        e2x, e2y, e2z = e2[:, 0], e2[:, 1], e2[:, 2]
        e1x, e1y, e1z = e1[:, 0], e1[:, 1], e1[:, 2]
        Ax, Ay, Az = aA[:, 0], aA[:, 1], aA[:, 2]
        ex, ey, ez = e2x, e2y, e2z   # e2 usado no cross com du
        for c0 in range(0, len(origins), CH):
            ox, oy, oz = origins[c0:c0+CH, 0][:, None], origins[c0:c0+CH, 1][:, None], origins[c0:c0+CH, 2][:, None]
            dx, dy, dz = D[c0:c0+CH, 0][:, None], D[c0:c0+CH, 1][:, None], D[c0:c0+CH, 2][:, None]
            # h = du × e2
            hx = dy * e2z[None, :] - dz * e2y[None, :]
            hy = dz * e2x[None, :] - dx * e2z[None, :]
            hz = dx * e2y[None, :] - dy * e2x[None, :]
            det = e1x[None, :] * hx + e1y[None, :] * hy + e1z[None, :] * hz
            ok = np.abs(det) > 1e-12
            invDet = np.zeros_like(det); invDet[ok] = 1.0 / det[ok]
            sx = ox - Ax[None, :]; sy = oy - Ay[None, :]; sz = oz - Az[None, :]
            uu = (sx * hx + sy * hy + sz * hz) * invDet
            qx = sy * e1z[None, :] - sz * e1y[None, :]
            qy = sz * e1x[None, :] - sx * e1z[None, :]
            qz = sx * e1y[None, :] - sy * e1x[None, :]
            vv = (dx * qx + dy * qy + dz * qz) * invDet
            tt = (e2x[None, :] * qx + e2y[None, :] * qy + e2z[None, :] * qz) * invDet
            hit = ok & (uu >= -1e-6) & (vv >= -1e-6) & (uu + vv <= 1 + 1e-6) & (tt > 1e-3) & (tt < R_MAX)
            block[c0:c0+CH] = hit.any(axis=1)
        occ += block * w
    ao = 1.0 - occ / wts.sum()
    return np.clip(ao, 0.0, 1.0)

origins = uniq + unrm * 2e-3
ao_u = occluded(origins, unrm)
ao_v = ao_u[inv]
print(f'AO único: min={ao_u.min():.3f} max={ao_u.max():.3f} mean={ao_u.mean():.3f}')

# rasteriza em espaço UV
def uv_to_px(u): return np.stack([u[:, 0] * (RES - 1), (1.0 - u[:, 1]) * (RES - 1)], axis=1)
img = np.full((RES, RES), 255.0, dtype=np.float32)
for t in range(0, len(idx), 3):
    i0, i1, i2 = idx[t], idx[t+1], idx[t+2]
    p0, p1, p2 = uv_to_px(uv[[i0]])[0], uv_to_px(uv[[i1]])[0], uv_to_px(uv[[i2]])[0]
    a0, a1, a2 = ao_v[i0], ao_v[i1], ao_v[i2]
    minx = max(int(np.floor(min(p0[0], p1[0], p2[0]))), 0); maxx = min(int(np.ceil(max(p0[0], p1[0], p2[0]))), RES - 1)
    miny = max(int(np.floor(min(p0[1], p1[1], p2[1]))), 0); maxy = min(int(np.ceil(max(p0[1], p1[1], p2[1]))), RES - 1)
    if maxx < minx or maxy < miny: continue
    d = (p1[1]-p2[1])*(p0[0]-p2[0]) + (p2[0]-p1[0])*(p0[1]-p2[1])
    if abs(d) < 1e-9: continue
    xs = np.arange(minx, maxx+1) + 0.5; ys = np.arange(miny, maxy+1) + 0.5
    X, Y = np.meshgrid(xs, ys)
    l0 = ((p1[1]-p2[1])*(X-p2[0]) + (p2[0]-p1[0])*(Y-p2[1])) / d
    l1 = ((p2[1]-p0[1])*(X-p2[0]) + (p0[0]-p2[0])*(Y-p2[1])) / d
    l2 = 1 - l0 - l1
    m = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
    if not m.any(): continue
    vals = (l0*a0 + l1*a1 + l2*a2).clip(0, 1)
    sub = img[miny:maxy+1, minx:maxx+1]
    sub[m] = (vals[m] * 255).astype(np.float32)
    img[miny:maxy+1, minx:maxx+1] = sub

filled = img < 255
print(f'pixels com AO assado: {filled.sum()} ({100*filled.mean():.1f}% da atlas)')

# dilatação: propaga o AO para as margens (evita sangria clara/escura nos seams e em mips)
RES_I = img.shape[0]
filled = img < 255.0
for _ in range(DILATE):
    pad = np.pad(img, 1, mode='edge')
    pfilled = np.pad(filled, 1, mode='edge')
    acc = np.full(img.shape, np.inf, dtype=np.float32)
    used = np.zeros(img.shape, dtype=bool)
    for dy in range(3):
        for dx in range(3):
            if dy == 1 and dx == 1: continue
            nb = pad[dy:dy+RES_I, dx:dx+RES_I]
            nf = pfilled[dy:dy+RES_I, dx:dx+RES_I]
            acc = np.minimum(acc, np.where(nf, nb, np.inf))
            used |= nf
    take = ~filled & used
    if not take.any(): break
    img[take] = acc[take]
    filled |= take
empty = ~filled
print(f'pixels com AO assado: {filled.sum()} ({100*filled.mean():.1f}% da atlas)')

# leve blur para costurar seams de interpolação UV
from PIL import ImageFilter
# expansão linear do termo de oclusão (AO intensity 1.35×) — mantém zonas abertas a 1.0
img = 1.0 - (1.0 - img / 255.0) * 1.35
img = np.clip(img, 0.0, 1.0) * 255.0
im = Image.fromarray(img.astype(np.uint8), 'L')
im = im.filter(ImageFilter.GaussianBlur(BLUR))
out = sys.argv[1] if len(sys.argv) > 1 else '/home/user/Nsambo/assets/textures/stalker/skin.ao.jpg'
im.save(out, quality=90)
print('AO gravado em', out)
