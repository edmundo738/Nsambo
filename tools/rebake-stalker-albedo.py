#!/usr/bin/env python3
"""Re-bake do albedo do stalker para o jogo (alinhamento garantido: opera texel a texel).

Problema: o albedo pálido gerado por IA é demasiado uniforme e claro → em jogo o
stalker parece plástico branco sob a lanterna, sem as rachaduras/carnes do hero
Blender. `skin.ao.jpg` (assado contra os UVs atuais) e `skin2-basecolor.jpg`
(detalhe tiling) não têm problema de alinhamento.

O que faz:
  1. escurece/dessatura ligeiramente o albedo base (×0.92, sat ×0.88);
  2. aprofunda as rachaduras: fendas escuras → quase-preto avermelhado;
  3. injeta carne viva (skin-base.jpg, tiling) nas cavidades da AO (multiply);
  4. preserva EXACTAMENTE a chart dos olhos (u 0.285–0.36, v 0.91–1.0) — os olhos
     do GLB amostram ali (verificado por dados) e o emissive está lá;
  5. contraste global ×1.05.

Uso: python3 tools/rebake-stalker-albedo.py
Backups em /tmp/skin.jpg.orig-2026-11-27 e /tmp/skin.normal.jpg.orig-2026-11-27.
"""
import numpy as np
from PIL import Image

SRC   = '/home/user/Nsambo/assets/textures/stalker/skin.jpg'
AO    = '/home/user/Nsambo/assets/textures/stalker/skin.ao.jpg'
GORY  = '/home/user/Nsambo/assets/textures/stalker/skin-base.jpg'
OUT   = SRC

RES = 2048
base = np.asarray(Image.open(SRC).convert('RGB'), dtype=np.float32) / 255.0
ao   = np.asarray(Image.open(AO).convert('L').resize((RES, RES), Image.BILINEAR), dtype=np.float32) / 255.0
gory = np.asarray(Image.open(GORY).convert('RGB'), dtype=np.float32) / 255.0

# 1. escurecer + dessaturar
lum = base @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
base = lum[..., None] * 0.30 + base * 0.70
base *= 0.92

# 2. aprofundar rachaduras (fendas → quase preto com laivo vermelho)
crack = np.clip((0.40 - lum) / 0.40, 0.0, 1.0) ** 2.0
dark_col = np.array([0.115, 0.038, 0.045], dtype=np.float32)
base = base * (1.0 - 0.55 * crack[..., None]) + dark_col * (0.55 * crack[..., None])

# 3. carne nas cavidades (AO baixo = cavidade)
cavity = np.clip(1.25 - ao / 0.72, 0.0, 1.0) ** 1.25
g_small = gory
# tiling 3× do detalhe de carne sobre a chart inteira
tiled = np.tile(g_small, (3, 3, 1))[:RES, :RES]
if tiled.shape[0] < RES or tiled.shape[1] < RES:
    tiled = np.asarray(Image.fromarray((tiled * 255).astype(np.uint8)).resize((RES, RES))) / 255.0
base = base * (1.0 - 0.72 * cavity[..., None]) + tiled * (0.60 * cavity[..., None])

# 4. contraste global
base = (base - 0.5) * 1.05 + 0.5
base = np.clip(base, 0.0, 1.0)

# 5. preservar a chart dos olhos, texel a texel
orig = np.asarray(Image.open(SRC).convert('RGB'), dtype=np.float32) / 255.0
h, w = base.shape[:2]
u0, u1 = int(0.285 * w), int(0.360 * w)
v0, v1 = int(0.910 * h), h     # v=0 no topo da imagem; olhos estão em baixo (v≈0.93–0.98)
base[v0:v1, u0:u1] = orig[v0:v1, u0:u1]
print('olhos preservados: linhas %d–%d, colunas %d–%d' % (v0, v1, u0, u1))

Image.fromarray((base * 255).astype(np.uint8)).save(OUT, quality=92)
print('albedo re-assado →', OUT)
