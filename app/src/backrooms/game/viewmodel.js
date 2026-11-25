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
