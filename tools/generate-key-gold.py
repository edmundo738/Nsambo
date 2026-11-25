#!/usr/bin/env python3
"""Gera o albedo PBR da chave (ouro envelhecido escovado) — procedural, numpy+PIL.
Uso: python tools/generate-key-gold.py assets/textures/backrooms/key-gold.jpg
Os restantes mapas derivam com tools/derive_maps.py.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 256
rng = np.random.default_rng(20261125)

# ── manchas de baixa frequência (oxidação/desgaste orgânico) ───────
n1 = rng.random((S, S)).astype(np.float32)
blotch = np.asarray(Image.fromarray((n1 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22)), dtype=np.float32) / 255.0
n2 = rng.random((S, S)).astype(np.float32)
blotch2 = np.asarray(Image.fromarray((n2 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), dtype=np.float32) / 255.0

# ── escovado vertical (1D ruído por coluna) ─────────────────────────
col = rng.random((1, S)).astype(np.float32)
brush = np.asarray(Image.fromarray(np.repeat((col * 255).astype(np.uint8), S, axis=0)).filter(ImageFilter.GaussianBlur(1.4)), dtype=np.float32) / 255.0

# ── riscos finos (suaves, castanho-quente, não pretos) ───────────────
scratch_img = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(scratch_img)
for _ in range(90):
    x0, y0 = rng.uniform(0, S, 2)
    ang = rng.uniform(0, np.pi)
    ln = rng.uniform(10, 130)
    x1, y1 = x0 + np.cos(ang) * ln, y0 + np.sin(ang) * ln
    v = int(rng.uniform(50, 120))
    w = 1 if rng.random() < 0.8 else 2
    d.line([x0, y0, x1, y1], fill=v, width=w)
scratch = np.asarray(scratch_img.filter(ImageFilter.GaussianBlur(1.1)), dtype=np.float32) / 255.0
# riscos claros polidos
polish_img = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(polish_img)
for _ in range(26):
    x0, y0 = rng.uniform(0, S, 2)
    ang = rng.uniform(-0.4, 0.4)  # na direção do escovado
    ln = rng.uniform(20, 160)
    x1, y1 = x0 + np.cos(ang) * ln, y0 + np.sin(ang) * ln
    v = int(rng.uniform(60, 150))
    d.line([x0, y0, x1, y1], fill=v, width=1)
polish = np.asarray(polish_img.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255.0

# ── mossas (dent como gradiente radial suave) ───────────────────────
dents_img = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(dents_img)
for _ in range(14):
    x, y = rng.uniform(20, S - 20, 2)
    r = rng.uniform(4, 16)
    v = int(rng.uniform(40, 110))
    d.ellipse([x - r, y - r, x + r, y + r], fill=v)
dents = np.asarray(dents_img.filter(ImageFilter.GaussianBlur(3.2)), dtype=np.float32) / 255.0

# ── escovado cruzado ─────────────────────────────────────────────────
row = rng.random((S, 1)).astype(np.float32)
brushX = np.asarray(Image.fromarray(np.repeat((row * 255).astype(np.uint8), S, axis=1)).filter(ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255.0

# ── base de ouro: contraste forte entre áreas queimadas e polidas ───
low = np.array([0.20, 0.115, 0.035], np.float32)
high = np.array([0.70, 0.50, 0.17], np.float32)
t = np.clip(0.18 + 0.95 * blotch * 0.72 + 0.35 * brushX + 0.30 * brush, 0.0, 1.15)[..., None]
albedo = low + (high - low) * t
albedo *= (0.82 + 0.36 * blotch2)[..., None]          # variação fina
albedo *= (1.0 - 0.34 * scratch)[..., None]           # riscos oxidados
albedo *= (1.0 - 0.30 * dents)[..., None]             # mossas escuras
albedo += polish[..., None] * np.array([0.16, 0.13, 0.06], np.float32)   # riscos polidos brilhantes
albedo = np.clip(albedo, 0, 1)

out = sys.argv[1] if len(sys.argv) > 1 else "key-gold.jpg"
Image.fromarray((albedo * 255).astype(np.uint8)).save(out, quality=93)
print("wrote", out)
