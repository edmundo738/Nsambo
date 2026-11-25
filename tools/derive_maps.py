#!/usr/bin/env python3
"""Deriva mapas PBR (normal + roughness) a partir de um albedo gerado.

O albedo e' gerado por IA; estes mapas sao **derivados matematicamente**
(luminancia -> Sobel -> normal; luminancia -> roughness). Nada e' pintado.
Convencao de normal: OpenGL tangent-space (green = +Y), que o three.js espera.
"""
import argparse, sys
import numpy as np
from PIL import Image, ImageFilter

def luminance(img):
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

def sobel(h):
    # 3x3 Sobel via roll (sem scipy)
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    ky = kx.T
    gx = sum(np.roll(h, (dy, dx), (0, 1)) * kx[dy + 1, dx + 1] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    gy = sum(np.roll(h, (dy, dx), (0, 1)) * ky[dy + 1, dx + 1] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    return gx, gy

def make_normal(h, strength):
    # suavizacao leve para nao amplificar ruido de 8-bit
    hs = h  # luminancia ja suave o suficiente para albedos gerados
    gx, gy = sobel(hs)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(h)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    return np.stack([nx / length, ny / length, nz / length], axis=-1)

def make_ao(h, strength, gamma):
    # AO barato mas convincente: cavidades escuras relativamente ao entorno
    from PIL import Image as _I
    import numpy as _np
    from PIL import ImageFilter as _F
    img = _I.fromarray((h * 255).astype(_np.uint8)).filter(_F.GaussianBlur(radius=6))
    blur = _np.asarray(img, dtype=_np.float32) / 255.0
    ao = 1.0 - _np.clip((blur - h) * strength, 0.0, 1.0)
    ao = _np.clip(ao ** gamma, 0.0, 1.0)
    return _np.repeat(ao[..., None], 3, axis=-1)

def make_height(h):
    return np.repeat(h[..., None], 3, axis=-1)

def make_roughness(h, base, contrast):
    mean = h.mean()
    var = (h - mean) * contrast
    r = np.clip(base + var, 0.05, 1.0)
    return np.repeat(r[..., None], 3, axis=-1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("albedo")
    ap.add_argument("--strength", type=float, default=3.0, help="forca do normal map")
    ap.add_argument("--base-rough", type=float, default=0.8)
    ap.add_argument("--rough-contrast", type=float, default=0.6)
    ap.add_argument("--out-normal", default=None)
    ap.add_argument("--out-rough", default=None)
    ap.add_argument("--out-ao", default=None)
    ap.add_argument("--out-height", default=None)
    ap.add_argument("--ao-strength", type=float, default=1.6)
    ap.add_argument("--ao-gamma", type=float, default=1.0)
    a = ap.parse_args()

    img = Image.open(a.albedo)
    h = luminance(img)
    stem = a.albedo.rsplit(".", 1)[0]
    out_n = a.out_normal or f"{stem}.normal.jpg"
    out_r = a.out_rough or f"{stem}.roughness.jpg"

    n = make_normal(h, a.strength)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(out_n, quality=92)

    r = make_roughness(h, a.base_rough, a.rough_contrast)
    Image.fromarray((r * 255).astype(np.uint8)).save(out_r, quality=92)

    out_ao = a.out_ao
    out_h = a.out_height
    if out_ao is None and a.out_ao != 'skip':
        out_ao = f"{stem}.ao.jpg"
    if out_ao:
        Image.fromarray((make_ao(h, a.ao_strength, a.ao_gamma) * 255).astype(np.uint8)).save(out_ao, quality=92)
    if out_h is None and a.out_height != 'skip':
        out_h = f"{stem}.height.jpg"
    if out_h:
        Image.fromarray(((h - h.min()) / max(np.ptp(h), 1e-6) * 255).astype(np.uint8)).save(out_h, quality=95)
    print("wrote", out_n, "+", out_r, "+ ao/height")

if __name__ == "__main__":
    sys.exit(main())
