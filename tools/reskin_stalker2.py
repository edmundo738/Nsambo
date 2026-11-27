#!/usr/bin/env python3
"""Re-skin do stalker v2 — pesos por cápsulas + MÁSCARAS ANATÓMICAS (sem vazamentos).

v1 falhou: queda relativa sem suporte compacto + difusão livre → upperLegL dominando ⅓
da malha, mãos assimétricas, footR com 8 verts.

v2:
  1. suporte compacto por osso: peso 0 fora de d ≤ r*C  (nenhuma influência à distância)
  2. máscara anatómica por osso (y / lado x / frente z) — ex.: crânio só admite
     head/jaw/neck; nenhum osso de braço fora da faixa y≤0.465 e x do lado certo;
     jaw só na frente (z ≥ zthr)
  3. difusão laplaciana na adjacência da malha, gateada pelas máscaras
  4. top-4 → u8 soma 254-256

Uso: python3 tools/reskin_stalker2.py [saida.rig.json]
"""
import json, base64, struct, sys
import numpy as np

GLB = '/home/user/Nsambo/assets/models/stalker.glb'
BAK = '/tmp/stalker.rig.json.bak-2026-11-27'

glb = open(GLB, 'rb').read()
clen, _ = struct.unpack_from('<II', glb, 12)
js = json.loads(glb[20:20+clen])
off = 20 + clen
bln, _ = struct.unpack_from('<II', glb, off)
buf = glb[off+8: off+8+bln]
prim = js['meshes'][0]['primitives'][0]
acc = js['accessors']; bv = js['bufferViews']
def accdata(i):
    a = acc[i]; v = bv[a['bufferView']]
    b0 = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = a['count']; t = a['type']
    ncomp = {'SCALAR':1,'VEC2':2,'VEC3':3}[t]
    fmt = {5126:'f4',5123:'u2',5125:'u4',5121:'u1'}[a['componentType']]
    arr = np.frombuffer(buf, dtype=np.dtype('<'+fmt), count=n*ncomp, offset=b0)
    return arr.reshape(n, ncomp)
pos = accdata(prim['attributes']['POSITION']).astype(np.float64)
tris = accdata(prim['indices']).reshape(-1, 3).astype(np.int64)

d = json.load(open(BAK))           # partiremos sempre do rig original (tem joints+formato)
joints = d['joints']; J = len(joints)
name = [j['n'] for j in joints]
P = {j['n']: np.array(j['pos'], dtype=np.float64) for j in joints}

def cap(a, b, r): return (np.array(a, dtype=np.float64), np.array(b, dtype=np.float64), float(r))

# ───────── cápsulas + máscaras (model bind coords; x<0 = esq do stalker) ─────────
# máscara: função(pos ndarray Nx3 -> bool N)
N = pos.shape[0]
X, Y, Z = pos[:, 0], pos[:, 1], pos[:, 2]
ALWAYS = np.ones(N, dtype=bool)

def mk_mask(fn):
    return fn(X, Y, Z)

def side_mask(x, sign):       # sign=-1 → esquerdo (x≈−), +1 → direito
    return (sign * x) > -0.10

CAPS = {
    0:  (cap(P['pelvis'],     (0.0, -0.105, -0.070), 0.27),  mk_mask(lambda x, y, z: (y <= 0.02) & (y >= -0.46) & (np.abs(x) <= 0.37))),
    1:  (cap(P['spine1'],     (0.0,  0.065, -0.035), 0.235), mk_mask(lambda x, y, z: (y >= -0.24) & (y <= 0.09) & (np.abs(x) <= 0.37))),
    2:  (cap(P['spine2'],     (0.0,  0.225, 0.020), 0.235),  mk_mask(lambda x, y, z: (y >= -0.06) & (y <= 0.21) & (np.abs(x) <= 0.37))),
    3:  (cap(P['spine3'],     (0.0,  0.40,  0.105), 0.255),  mk_mask(lambda x, y, z: (y >= 0.10) & (y <= 0.385) & (np.abs(x) <= 0.37))),
    4:  (cap(P['neck'],       (0.0,  0.51,  0.150), 0.165),  mk_mask(lambda x, y, z: (y >= 0.28) & (y <= 0.52) & (np.abs(x) <= 0.175) & (z <= 0.14))),
    5:  (cap((0.0, 0.44, 0.08), (0.0, 0.81, 0.235), 0.315),  mk_mask(lambda x, y, z:  y >= 0.40)),
    6:  (cap((0.0, 0.435, 0.19), (0.0, 0.545, 0.35), 0.150), mk_mask(lambda x, y, z: (y >= 0.40) & (y <= 0.585) & (z >= 0.055) & (np.abs(x) <= 0.24))),
    7:  (cap((-0.02, 0.315, 0.035), P['upperArmL'], 0.165),  mk_mask(lambda x, y, z: (y >= 0.22) & (y <= 0.43) & (x < 0.10) & (x > -0.36))),
    8:  (cap(( 0.02, 0.315, 0.035), P['upperArmR'], 0.165),  mk_mask(lambda x, y, z: (y >= 0.22) & (y <= 0.43) & (x > -0.10) & (x < 0.36))),
    9:  (cap(P['upperArmL'],  P['foreArmL'], 0.205),         mk_mask(lambda x, y, z: (x < 0.06) & (y >= -0.07) & (y <= 0.465))),
    10: (cap(P['upperArmR'],  P['foreArmR'], 0.205),         mk_mask(lambda x, y, z: (x > -0.06) & (y >= -0.07) & (y <= 0.465))),
    11: (cap(P['foreArmL'],   P['handL'],    0.180),         mk_mask(lambda x, y, z: (x < 0.07) & (y >= -0.35) & (y <= 0.13))),
    12: (cap(P['foreArmR'],   P['handR'],    0.180),         mk_mask(lambda x, y, z: (x > -0.07) & (y >= -0.35) & (y <= 0.13))),
    13: (cap(P['handL'],      (-0.425, -0.55, -0.06), 0.205), mk_mask(lambda x, y, z: (x < 0.08) & (y >= -0.60) & (y <= -0.17))),
    14: (cap(P['handR'],      ( 0.410, -0.47, -0.06), 0.205), mk_mask(lambda x, y, z: (x > -0.08) & (y >= -0.60) & (y <= -0.17))),
    15: (cap(P['upperLegL'],  P['lowerLegL'], 0.250),        mk_mask(lambda x, y, z: (x < 0.10) & (y >= -0.47) & (y <= 0.06))),
    16: (cap(P['upperLegR'],  P['lowerLegR'], 0.250),        mk_mask(lambda x, y, z: (x > -0.10) & (y >= -0.47) & (y <= 0.06))),
    17: (cap(P['lowerLegL'],  P['footL'],     0.215),        mk_mask(lambda x, y, z: (x < 0.11) & (y >= -0.84) & (y <= -0.25))),
    18: (cap(P['lowerLegR'],  P['footR'],     0.215),        mk_mask(lambda x, y, z: (x > -0.11) & (y >= -0.84) & (y <= -0.25))),
    19: (cap((-0.255, -0.875, -0.47), (-0.255, -0.96, 0.18), 0.21), mk_mask(lambda x, y, z: (x < 0.12) & (y >= -1.02) & (y <= -0.70))),
    20: (cap(( 0.295, -0.875, -0.24), ( 0.295, -0.96, 0.40), 0.21), mk_mask(lambda x, y, z: (x > -0.12) & (y >= -1.02) & (y <= -0.70))),
}

def seg_dist(Pv, A, B):
    ab = B - A
    t = np.clip(((Pv - A) @ ab) / max(ab @ ab, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Pv - (A + np.outer(t, ab)), axis=1)

MASK = np.zeros((N, J), dtype=bool)
W = np.zeros((N, J))
CFALL = 1.22     # cutoff relativo ao raio
for b in range(J):
    (A, B, r), mask = CAPS[b]
    MASK[:, b] = mask
    dist = seg_dist(pos, A, B)
    tc = dist / (r * CFALL)
    Wt = np.where(tc < 1.0, (1.0 - tc ** 2) ** 2, 0.0)
    W[:, b] = Wt * mask

empty = W.sum(1) < 1e-9
print(f'vértices sem suporte: {empty.sum()}')
# fallback 1: expande raios (mantém máscaras)
for b in range(J):
    if not empty.any(): break
    (A, B, r), mask = CAPS[b]
    dist = seg_dist(pos[empty], A, B)
    tc = dist / (r * 1.8)
    Wt = np.where(tc < 1.0, (1.0 - tc ** 2) ** 2, 0.0)
    W[empty, b] = np.maximum(W[empty, b], Wt * mask[empty])
empty = W.sum(1) < 1e-9
print(f'sem suporte após expansão: {empty.sum()}')
# fallback 2: osso mais próximo (dentro da máscara) de forma exclusiva
if empty.any():
    Df = np.stack([seg_dist(pos[empty], CAPS[b][0][0], CAPS[b][0][1]) for b in range(J)], axis=1)
    M = MASK[empty]
    Df = np.where(M, Df, 1e9)
    W[empty, Df.argmin(1)] = 1.0

# ───────── difusão laplaciana gateada pelas máscaras ─────────
key = np.round(pos, 4)
uniq, inv = np.unique(key, axis=0, return_inverse=True)
U = uniq.shape[0]
print(f'posições únicas: {U}')
adj = [set() for _ in range(U)]
for t in tris:
    a, b, c = inv[t[0]], inv[t[1]], inv[t[2]]
    for x, y in ((a, b), (b, c), (c, a)):
        if x != y: adj[x].add(y); adj[y].add(x)
adj_list = [sorted(s) for s in adj]
MU = np.zeros((U, J), dtype=bool); np.logical_or.at(MU, inv, MASK)  # união das máscaras nos duplicados
WU = np.zeros((U, J)); np.add.at(WU, inv, W)
cnt = np.zeros(U); np.add.at(cnt, inv, 1); WU /= cnt[:, None]
for it in range(4):
    newW = WU.copy()
    for u in range(U):
        if not adj_list[u]: continue
        nb = adj_list[u]
        newW[u] = 0.55 * WU[u] + 0.45 * WU[nb].mean(0)
    WU = newW * MU
W = WU[inv]

# ───────── top-4 + u8 ─────────
top = np.argpartition(-W, 3, axis=1)[:, :4]
wts = np.take_along_axis(W, top, axis=1)
wts[wts < 0] = 0
s = wts.sum(1, keepdims=True); s[s < 1e-9] = 1.0
wts /= s
u8 = np.rint(wts * 255).astype(np.uint8)
for i in range(N):
    tot = int(u8[i].sum())
    if tot == 0: u8[i, 0] = 255; continue
    while tot > 256:
        j = np.argmax(u8[i]); u8[i, j] -= 1; tot -= 1
    while tot < 254:
        j = np.argmax(u8[i]); u8[i, j] += 1; tot += 1
idx_out = top.astype(np.uint8)
order = np.argsort(-wts, axis=1)   # wts float — argsort(-u8) quebrava por wrap mod 256
idx2 = np.take_along_axis(idx_out, order, axis=1)
w2 = np.take_along_axis(u8, order, axis=1)

def metrics(tag, IDX, WTS):
    print(f'\n=== {tag} ===')
    dom = IDX[:, 0]
    tot_all = 0
    for b in range(J):
        m = dom == b
        print(f'{b:2d} {name[b]:9s} dominante={m.sum():5d}')
    skull = pos[:, 1] > 0.46
    arm = [9, 10, 11, 12, 13, 14]
    arm_w = (np.isin(IDX[skull], arm) * (WTS[skull] / 255.0)).sum()
    jaw_w = ((IDX[skull] == 6) * (WTS[skull] / 255.0)).sum()
    print(f'skull(y>0.46): braço={arm_w:.1f} jaw={jaw_w:.1f}')
    legL = (pos[:, 1] <= -0.2) & (pos[:, 0] < -0.06)
    legR = (pos[:, 1] <= -0.2) & (pos[:, 0] >  0.06)
    armL = (pos[:, 0] < -0.28) & (pos[:, 1] > -0.05)
    armR = (pos[:, 0] >  0.28) & (pos[:, 1] > -0.05)
    wrong_side = ((dom[legL] >= 16) & (dom[legL] <= 20) & (dom[legL] % 2 == 0)).sum() + ((dom[legR] % 2 == 1)).sum()
    hand_side = ((dom[armL] % 2 == 0)).sum() + ((dom[armR] % 2 == 1)).sum()
    print(f'pés lado errado (dom): {wrong_side}   mãos lado errado (dom): {hand_side}')
    print(f'soma: min={WTS.sum(1).min()} max={WTS.sum(1).max()}')

old_idx = np.frombuffer(base64.b64decode(d['w4']), dtype=np.uint8).reshape(-1, 4)
old_wts = np.frombuffer(base64.b64decode(d['v4']), dtype=np.uint8).reshape(-1, 4)
metrics('ANTES (rig original)', old_idx, old_wts)
metrics('DEPOIS (v2 masks)', idx2, w2)

out_rig = sys.argv[1] if len(sys.argv) > 1 else '/home/user/Nsambo/assets/models/stalker.rig.json'
out = dict(d)
out['w4'] = base64.b64encode(idx2.tobytes()).decode()
out['v4'] = base64.b64encode(w2.tobytes()).decode()
with open(out_rig, 'w') as f:
    json.dump(out, f)
print('\nrig.json gravado em', out_rig)
