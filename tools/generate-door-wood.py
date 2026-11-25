#!/usr/bin/env python3
"""Porta de madeira escura, painéis rebaixados, tábuas verticais — procedural.
Uso: python tools/generate-door-wood.py assets/textures/backrooms/door-wood.jpg
Mapa 1 repetido por folha (2 folhas); os painéis alinham com as maçanetas.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 256, 512
rng = np.random.default_rng(20261125)

# ── tábuas verticais (5) ────────────────────────────────────────────
planks = np.zeros((H, W), np.float32)
edges = [0, 52, 104, 128, 152, 204, 256]
base_tone = np.array([0.30, 0.175, 0.075], np.float32)
albedo = np.tile(base_tone, (H, W, 1))
tones = [0.88 + rng.uniform(-0.18, 0.18) for _ in range(6)]
for p in range(6):
    x0, x1 = edges[p], edges[p + 1]
    albedo[:, x0:x1] *= tones[p]

# veios de madeira (riscos verticais ondulados)
grain = Image.new("L", (W, H), 128)
g = ImageDraw.Draw(grain)
for _ in range(180):
    x = rng.uniform(0, W)
    amp = rng.uniform(1.5, 6)
    ph = rng.uniform(0, 6.28)
    freq = rng.uniform(0.008, 0.03)
    v = int(rng.uniform(60, 130))
    ys = np.arange(0, H, 4)
    xs = x + np.sin(ys * freq + ph) * amp
    g.line(list(zip(xs, ys)), fill=v, width=1)
grain = np.asarray(grain.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255.0
albedo *= (0.62 + 0.72 * grain)[..., None]

# fendas entre tábuas
inlay = np.ones((H, W), np.float32)
for x in edges[1:-1]:
    inlay[:, max(0, x - 1):x + 1] = 0.42
albedo *= inlay[..., None]

# ── painéis rebaixados (2×2) ────────────────────────────────────────
def panel(cx, cy, w, h):
    x0, x1, y0, y1 = cx - w // 2, cx + w // 2, cy - h // 2, cy + h // 2
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    # moldura clara (borda em bisel), campo escuro (rebaixo)
    yy, xx = np.mgrid[0:H, 0:W]
    rim = np.zeros((H, W), np.float32)
    field = np.zeros((H, W), np.float32)
    m = 10
    inside = (xx >= x0 + m) & (xx < x1 - m) & (yy >= y0 + m) & (yy < y1 - m)
    outer = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
    rim[outer] = 1.0
    rim[inside] = 0.35
    field[inside] = 1.0
    # bisel suave
    rim = np.asarray(Image.fromarray((rim * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32) / 255.0
    return rim, field

for cx, cy, w, h in [(64, 130, 84, 120), (192, 130, 84, 120), (64, 380, 84, 150), (192, 380, 84, 150)]:
    rim, field = panel(cx, cy, w, h)
    albedo *= (1.0 - 0.38 * field[..., None])          # fundo do rebaixo mais escuro
    albedo += (rim * 0.16)[..., None] * np.array([0.9, 0.8, 0.66], np.float32)  # bisel apanha luz

# vignette vertical (rodapé mais sujo)
yy = np.linspace(0.78, 1.12, H)[:, None, None]
albedo *= yy

albedo = np.clip(albedo, 0, 1)
out = sys.argv[1] if len(sys.argv) > 1 else "door-wood.jpg"
Image.fromarray((albedo * 255).astype(np.uint8)).save(out, quality=93)
print("wrote", out)
