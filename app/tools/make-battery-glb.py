#!/usr/bin/env python3
"""Gera o asset da PILHA AA (PSX, estilo realista low-poly) para o Backrooms.

Blender (bpy) não corre neste sandbox (faltam libGL.so.1/libXrender.so.1 e não há root).
Por isso este gerador escreve o GLB 2.0 directamente (JSON+BIN), com os mesmos dados
que o Blender exportaria: cilindro de 12 lados facetado, materiais PBR, texturas
embeddas (PNG), +Y up, metros (dimensões reais AA/LR6: Ø 14,2 mm × 50,5 mm).

Uso: python3 app/tools/make-battery-glb.py
Saída: assets/models/psx_battery.glb  +  assets/textures/props/battery-side.png (fonte)
"""
import json, math, struct, zlib, os
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # app/
REPO = os.path.dirname(ROOT)
TEX_OUT = os.path.join(REPO, 'assets', 'textures', 'props', 'battery-side.png')
GLB_OUT = os.path.join(REPO, 'assets', 'models', 'psx_battery.glb')
SIDE = 12   # lados do cilindro — PSX é facetado de propósito

# ───────────────────────── texturas ─────────────────────────
def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()

def make_side():
    W, H = 512, 256
    img = Image.new('RGB', (W, H), (34, 32, 36))
    d = ImageDraw.Draw(img)
    # fundo preto acetinado com variação vertical + grão
    for y in range(H):
        v = 30 + int(12 * math.sin(y * 0.11) + 7 * math.sin(y * 0.031 + 2))
        d.rectangle([0, y, W, y], fill=(v, v - 1, v + 3))
    random.seed(20261127)
    for _ in range(2600):
        x, y = random.randrange(W), random.randrange(H)
        v = random.randrange(36, 130)
        img.putpixel((x, y), (v, v, v + 4))
    # topo/baixo âmbar (paleta Backrooms)
    d.rectangle([0, 0, W, 10], fill=(214, 158, 46))
    d.rectangle([0, 12, W, 16], fill=(120, 84, 20))
    d.rectangle([0, H - 34, W, H - 26], fill=(214, 158, 46))
    d.rectangle([0, H - 24, W, H - 22], fill=(90, 62, 14))
    # marca + tipo
    d.text((18, 26), 'NSAMBO', font=font(84), fill=(245, 233, 199))
    d.text((18, 116), '1,5V', font=font(44), fill=(214, 158, 46))
    d.text((150, 120), 'AA · LR6', font=font(40), fill=(200, 200, 205))
    d.text((18, 172), 'ALCALINA  ·  ALKALINE', font=font(22), fill=(158, 156, 148))
    d.text((18, 198), 'NÃO RECARREGÁVEL · NÃO INCINERAR', font=font(17), fill=(122, 120, 112))
    # amostra de AÇO ESCOVADO (usada pelas tampas/ombros via UV próprio) com « + » gravado
    sx0 = 400
    random.seed(99)
    for x in range(sx0, W):
        for y in range(0, 56):
            v = 148 + int(26 * math.sin(x * 0.55 + y * 1.7)) + random.randrange(-14, 15)
            img.putpixel((x, y), (v, v + 2, v + 6))
    d.rectangle([sx0, 0, sx0, 55], fill=(70, 68, 62))   # filete de separação da amostra
    d.text((sx0 + 38, 2), '+', font=font(52), fill=(52, 50, 46))
    # código de barras (barras aleatórias determinísticas)
    bx = W - 118
    random.seed(517)
    x = bx
    while x < W - 14:
        bw = random.choice([2, 2, 3, 5, 7])
        if random.random() < 0.62:
            d.rectangle([x, H - 86, x + bw - 1, H - 40], fill=(228, 226, 216))
        x += bw + random.choice([2, 3])
    d.text((bx, H - 34), '7891 11 001012', font=font(15), fill=(186, 184, 174))
    # vincos de envelhecimento (manchas verticais)
    for _ in range(9):
        x = random.randrange(W)
        alpha_band = random.randrange(18, 44)
        d.rectangle([x, 0, x + random.randrange(1, 5), H], fill=(alpha_band, alpha_band, alpha_band + 2))
    # PSX: paleta reduzida + dithering Floyd–Steinberg
    img = img.quantize(colors=26, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).convert('RGB')
    img.save(TEX_OUT)
    print('textura →', TEX_OUT, img.size)
    return img

# ───────────────────────── geometria ─────────────────────────
def ring(r, y, n=SIDE, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * i / n), y, r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]

def add_quad(tris, A, B, C, D):
    tris.append((A, B, C)); tris.append((A, C, D))

def build_mesh():
    # perfis do sólido rotacionado: (raio, y)  — dimensão real AA
    prof_body   = [(0.0071, 0.0000), (0.0071, 0.0443)]
    prof_shoulder = [(0.0071, 0.0443), (0.0054, 0.0476)]
    prof_cap    = [(0.0054, 0.0476), (0.0054, 0.0490)]
    prof_nub    = [(0.00275, 0.0490), (0.00275, 0.0504)]
    tris_body, tris_steel = [], []
    for a, b in zip(ring(*prof_body[0]), ring(*prof_body[1])):
        pass  # já resolvido abaixo com índices
    # corpo (label) — superfícies laterais + fundo
    rb, rt = ring(0.0071, 0.0), ring(0.0071, 0.0443)
    for i in range(SIDE):
        j = (i + 1) % SIDE
        add_quad(tris_body, rb[i], rb[j], rt[j], rt[i])
    # shoulder (cone) — aço
    rs, re_ = ring(0.0071, 0.0443), ring(0.0054, 0.0476)
    for i in range(SIDE):
        j = (i + 1) % SIDE
        add_quad(tris_steel, rs[i], rs[j], re_[j], re_[i])
    # cap positivo — aço
    rc0, rc1 = ring(0.0054, 0.0476), ring(0.0054, 0.0490)
    for i in range(SIDE):
        j = (i + 1) % SIDE
        add_quad(tris_steel, rc0[i], rc0[j], rc1[j], rc1[i])
    # nub — aço (8 lados, facetado)
    rn0, rn1 = ring(0.00275, 0.0490, 8), ring(0.00275, 0.0504, 8)
    for i in range(8):
        j = (i + 1) % 8
        add_quad(tris_steel, rn0[i], rn0[j], rn1[j], rn1[i])
    # tampas (fan trianguladas)
    def cap_tris(r, y, flip):
        out = []
        c = (0.0, y, 0.0)
        rr = ring(r, y, SIDE if r > 0.005 else (8 if r < 0.004 else SIDE))
        for i in range(len(rr)):
            j = (i + 1) % len(rr)
            out.append((rr[j], rr[i], c) if flip else (rr[i], rr[j], c))
        return out
    tris_steel += cap_tris(0.00275, 0.0504, False)   # topo do nub (+)
    tris_steel += cap_tris(0.0071, 0.0, True)        # fundo negativo — aço escuro fica no material
    # disco do shoulder por baixo do nub (anel visível): cone já fecha; pôr tampa no cap
    tris_steel += cap_tris(0.0054, 0.0490, False)
    # normals facetadas: duplicar vértices por triângulo; garantir VENTO relativo ao exterior
    def uv_body(px, py, pz):
        ang = math.atan2(pz, px)
        u = 1.0 - (ang + math.pi) / (2 * math.pi)   # glTF v=0 = topo; u invertido cosido correcto
        v = 1.0 - py / 0.0504
        return [u, v]

    def uv_steel(px, py, pz):
        return [0.87, 0.105]   # centro da amostra de aço (canto superior direito da textura)

    def flat(tris, outward, uv_fn=uv_body):
        pos, nrm, uv, idx = [], [], [], []
        for t in tris:
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            nx, ny, nz = nx / ln, ny / ln, nz / ln
            cx_, cy_, cz_ = (ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3
            ox, oy, oz = outward((cx_, cy_, cz_))
            if nx * ox + ny * oy + nz * oz < 0:
                t = (t[0], t[2], t[1])          # inverte a voltagem — face exterior
                nx, ny, nz = -nx, -ny, -nz
            base = len(pos) // 3
            for k, (px, py, pz) in enumerate(t):
                pos += [px, py, pz]
                nrm += [nx, ny, nz]
            for (px, py, pz) in t:
                uv += uv_fn(px, py, pz)
            idx += [base, base + 1, base + 2]
        return pos, nrm, uv, idx
    radial = lambda c: (lambda l: ((c[0] / l, 0.0, c[2] / l) if l > 1e-9 else (1.0, 0.0, 0.0)))(math.hypot(c[0], c[2]))
    top_out = lambda c: (0.0, 1.0, 0.0)
    bot_out = lambda c: (0.0, -1.0, 0.0)
    # corpo é casca radial; aço mistura laterais (radial) e tampas (eixo) — agrupar por tipo de tri antes do flat
    lat_body = [t for t in tris_body]
    # casca de aço lateral vs tampas: distinguir pela normal já exige cálculo — usar heurística: tampa tem todos y iguais
    lat_steel, caps_top, caps_bot = [], [], []
    for t in tris_steel:
        ys = [v[1] for v in t]
        if abs(max(ys) - min(ys)) < 1e-9:
            (caps_top if ys[0] > 0.025 else caps_bot).append(t)
        else:
            lat_steel.append(t)
    g_body = flat(lat_body, radial, uv_body)
    g_steel_lat = flat(lat_steel, radial, uv_steel)
    g_steel_top = flat(caps_top, top_out, uv_steel)
    g_steel_bot = flat(caps_bot, bot_out, uv_steel)
    # fundir aço num único grupo (concatenar arrays com offset nos índices)
    def merge(groups):
        pos, nrm, uv, idx = [], [], [], []
        for p, n_, u, i in groups:
            b = len(pos) // 3
            pos += p; nrm += n_; uv += u
            idx += [x + b for x in i]
        return pos, nrm, uv, idx
    g_steel = merge([g_steel_lat, g_steel_top, g_steel_bot])
    print(f'tris: corpo {len(tris_body)} · aço {len(tris_steel)}')
    return g_body, g_steel

# ───────────────────────── GLB writer ─────────────────────────
def image_bytes(img):
    import io
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def build_glb(img):
    g_body, g_steel = build_mesh()
    bin_blob = bytearray()
    bufferViews, accessors = [], []

    def add_view(data, target=None):
        while len(bin_blob) % 4:
            bin_blob.append(0)
        off = len(bin_blob)
        bin_blob.extend(data)
        view = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target is not None:
            view['target'] = target
        bufferViews.append(view)
        return len(bufferViews) - 1

    def add_accessor(view, componentType, count, type_, minmax=None):
        acc = {'bufferView': view, 'byteOffset': 0, 'componentType': componentType, 'count': count, 'type': type_}
        if minmax:
            acc['min'], acc['max'] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    FLOAT, USHORT = 5126, 5123

    def add_geom(g):
        pos, nrm, uv, idx = g
        vp = add_view(struct.pack(f'<{len(pos)}f', *pos), 34962)
        pmin = [min(pos[i::3]) for i in range(3)]
        pmax = [max(pos[i::3]) for i in range(3)]
        ap = add_accessor(vp, FLOAT, len(pos) // 3, 'VEC3', [pmin, pmax])
        vn = add_view(struct.pack(f'<{len(nrm)}f', *nrm), 34962)
        an = add_accessor(vn, FLOAT, len(nrm) // 3, 'VEC3')
        vt = add_view(struct.pack(f'<{len(uv)}f', *uv), 34962)
        at = add_accessor(vt, FLOAT, len(uv) // 2, 'VEC2')
        vi = add_view(struct.pack(f'<{len(idx)}H', *idx), 34963)
        ai = add_accessor(vi, USHORT, len(idx), 'SCALAR')
        return {'attributes': {'POSITION': ap, 'NORMAL': an, 'TEXCOORD_0': at}, 'indices': ai, 'material': None}

    prim_body = add_geom(g_body)
    prim_body['material'] = 0
    prim_steel = add_geom(g_steel)
    prim_steel['material'] = 1

    # imagem embebida
    png = image_bytes(img)
    vimg = add_view(png)
    images = [{'bufferView': vimg, 'mimeType': 'image/png', 'name': 'battery-side'}]
    textures = [{'sampler': 0, 'source': 0}]
    samplers = [{'magFilter': 9728, 'minFilter': 9986, 'wrapS': 10497, 'wrapT': 10497}]  # ~NEAREST, PSX
    materials = [
        {'name': 'label', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.08, 'roughnessFactor': 0.62}},
        {'name': 'aco', 'pbrMetallicRoughness': {'baseColorFactor': [0.72, 0.73, 0.76, 1.0], 'metallicFactor': 0.9, 'roughnessFactor': 0.34}},
    ]
    gltf = {
        'asset': {'version': '2.0', 'generator': 'nsambo-make-battery-glb'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'power-cell-aa'}],
        'meshes': [{'name': 'battery-aa', 'primitives': [prim_body, prim_steel]}],
        'buffers': [{'byteLength': len(bin_blob)}],
        'bufferViews': bufferViews,
        'accessors': accessors,
        'images': images,
        'textures': textures,
        'samplers': samplers,
        'materials': materials,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    while len(bin_blob) % 4:
        bin_blob.append(0)
    total = 12 + 8 + len(js) + 8 + len(bin_blob)
    out = bytearray(struct.pack('<III', 0x46546C67, 2, total))
    out += struct.pack('<I', len(js)) + struct.pack('<I', 0x4E4F534A) + js
    out += struct.pack('<I', len(bin_blob)) + struct.pack('<I', 0x004E4942) + bin_blob
    with open(GLB_OUT, 'wb') as f:
        f.write(out)
    print('glb →', GLB_OUT, f'{total/1024:.1f} KB')

if __name__ == '__main__':
    img = make_side()
    build_glb(img)
