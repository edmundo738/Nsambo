// NSAMBO ENGINE — viewmodel.js — braços + lanterna em 1ª pessoa (matemática PURA, testável em node)
// Convenção do projeto: câmara olha −Z; yaw=0 → −Z. O rig dos braços (ATR0CITY) olha +Z.
// Por isso: rig→vista = RotY(π). O rig foi posado para uma câmara a ~1.70–1.74 m: os punhos abertos
// do antebraço (z_rig −0.18…−0.07) ficam ATRÁS da câmara e nunca aparecem. O patch anterior escalava
// 0.5× e afastava 0.53 m → os cotos entravam no frame. Agora: escala 1, olho do rig na câmara.
import { mat4 } from '../engine/math.js'

export const VM = { fovDeg: 75, near: 0.02, far: 8, rigEyeY: 1.58 }   // mãos inteiramente visíveis acima do limite inferior
export const FLASH_TIP = [0.15, 0.02, 0]   // ponta (lente = +X do GLB) em espaço do modelo

const mul = (...ms) => ms.reduce((a, b) => mat4.multiply(mat4.create(), a, b))
const T = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
const RY = (r) => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]) }
const S = (k) => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1])

// matriz LOCAL (espaço de vista) dos braços. reach∈[0,1]: gesto de apanhar (máx 5 cm p/ a frente,
// senão os punhos entram no near plane).
export function armsLocal(reach = 0) {
  const r = Math.max(0, Math.min(1, reach))
  return mul(T(0, -0.04 * r, -0.05 * r), RY(Math.PI), T(0, -VM.rigEyeY, 0))
}

// lanterna na mão direita (centróide medido da malha em knife_idle: 0.273, −0.166, −0.361).
// Lente (+X do modelo) TEM de apontar −Z; ligeira guinada para dentro (−X).
export function flashLocal() {
  const s = 0.8
  return mul(T(0.273, -0.166 - 0.0245 * s, -0.361), RY(-Math.PI / 2 - 0.06), S(s))
}

export function viewmodelProj(aspect) {
  return mat4.perspective((VM.fovDeg * Math.PI) / 180, aspect, VM.near, VM.far)
}

// direção (sem translação) de um vetor do modelo
export function transformDir(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]
}

// ── faca de combate (viewmodel) ─────────────────────────────────────────────
// Canonical do GLB: ponta +X, gume/face plana para cima (+Y), 0.46 m de ponta a ponta.
// No jogo a faca tem ~0.32 m — escala 0.70. Empunhada no canto inferior direito, lâmina
// plana para cima como punho invertido; o golpe LUNGE em direção à mira (−Z) e desce.
const RX = (r) => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]) }
const RZ = (r) => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const KNIFE_IMPACT_T = 0.235   // instante (0..1) em que a lâmina está à distância máxima
export const KNIFE_SWING_SECONDS = 0.62

export function knifeLocal(attack01 = -1, time = 0) {
  // respiração de quem segura uma lâmina perto do corpo: nunca parada de vez
  // empunhada ao centro-baixo (estilo CoD) — a lanterna vive no canto inferior direito
  let tx = 0.115, ty = -0.188, tz = -0.315
  let ry = -Math.PI / 2 - 0.10, rx = 0.15, rz = 0.055
  ty += Math.sin(time * 1.65) * 0.0026
  ry += Math.sin(time * 0.9 + 1.2) * 0.006
  if (attack01 >= 0) {
    const t = attack01
    // fases do golpe: recuar (0–0.16) → cravar (0.16–0.30) → recolher (0.30–1)
    const wind = sstep(0, 0.15, t) * (1 - sstep(0.30, 0.52, t))
    const strike = sstep(0.15, KNIFE_IMPACT_T, t) * (1 - sstep(0.34, 0.78, t))
    const recover = sstep(0.55, 1, t)
    const lunge = strike * (1 - recover * 0.55)
    tz -= 0.270 * lunge          // para a FRENTE, para onde a mira aponta
    tx -= 0.085 * lunge          // cruza a vista em direção ao centro
    ty += 0.055 * wind - 0.055 * lunge + 0.02 * recover
    rx += 0.55 * wind - 1.05 * lunge + 0.18 * recover   // punho vira: cravar para baixo
    ry += 0.17 * lunge
    rz += 0.10 * lunge - 0.05 * wind
  }
  return mul(T(tx, ty, tz), RY(ry), RX(rx), RZ(rz), S(0.70))
}
