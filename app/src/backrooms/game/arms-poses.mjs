// NSAMBO ENGINE — arms-poses.mjs — blend de poses dos braços (PURA, testável em node)
// 5 bakes do mesmo rig (mesmo nº de vértices) + mistura por estado:
//   relaxA/relaxB — braços baixos abertos (extremos da respiração)
//   guard         — knife_idle t=1.0 (postura de alerta — usada ao andar depressa/correr)
//   grab          — grab.R t=0.36 (apanhar — pico do gesto de pega)
//   push          — push.R t=0.4 (abrir a porta — pico do empurrão)
// Nada aqui toca no WebGL — o main.js faz upload do resultado com bufferSubData.

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// peso-pulso em forma de sino: sobe rápido, cai devagar. peak=1 em t=peakT/dur
export function pulse(t, dur, peakT = 0.30) {
  if (t < 0 || t >= dur) return 0
  const x = t / dur
  const p = peakT / dur
  if (x <= p) return clamp01(x / p) ** 1.6
  return clamp01(1 - (x - p) / (1 - p)) ** 1.15
}

// weights → {relax, guard, grab, push} (soma 1); relax é dividido entre A/B pelo breath
export function poseWeights({ speed = 0, breath = 0, grab = 0, push = 0 } = {}) {
  const g = clamp01((speed - 0.6) / 2.4) * 0.35        // tensão de alerta — a passada real vem do ciclo procedural (arms-anim)
  const action = clamp01(grab) + clamp01(push)
  const grabW = clamp01(grab) / Math.max(1, action) * clamp01(action)
  const pushW = clamp01(push) / Math.max(1, action) * clamp01(action)
  const guard = g * (1 - clamp01(action))
  const relax = Math.max(0, 1 - guard - grabW - pushW)
  return { relax, guard, grab: grabW, push: pushW, breath: clamp01(breath) }
}

// mistura as 5 poses em `out` (Float32Array verts*3). poses: {relaxA, relaxB, guard, grab, push}
export function blendPoses(out, poses, w) {
  const { relaxA, relaxB, guard, grab, push } = poses
  const n = relaxA.length
  const b = w.breath
  const rw = w.relax
  const wa = rw * (1 - b), wb = rw * b
  const wg = w.guard, wgt = w.grab, wp = w.push
  for (let i = 0; i < n; i++) {
    out[i] = relaxA[i] * wa + relaxB[i] * wb + guard[i] * wg + grab[i] * wgt + push[i] * wp
  }
  return out
}

// índices dos vértices da mão (vista: x > 0.08 direita / x < −0.08 esquerda, z < −0.2),
// calculados uma vez a partir de qualquer bake do rig (a topologia não muda entre poses/clipes)
function handIndices(positions, sign, { rigEyeY = 1.70 } = {}) {
  const idx = []
  for (let v = 0; v * 3 + 2 < positions.length; v++) {
    const x = -positions[v * 3]
    const y = positions[v * 3 + 1] - rigEyeY
    const z = -positions[v * 3 + 2]
    if (x * sign > 0.08 && z < -0.2) idx.push(v)
  }
  return new Uint32Array(idx)
}
export function rightHandIndices(positions, opts) { return handIndices(positions, 1, opts) }
export function leftHandIndices(positions, opts) { return handIndices(positions, -1, opts) }

// índices de METADE do mesh (braço inteiro, raw x>0 = esquerdo) — o mesh são só
// dois braços espelhados (379 + 379 verts, sem costura); usado pela garra da chave
export function leftArmIndices(positions) {
  const idx = []
  for (let v = 0; v * 3 < positions.length; v++) if (positions[v * 3] > 0) idx.push(v)
  return new Uint32Array(idx)
}

// mistura PARCIAL da pose alvo (grab.L) nos vértices dados — mão a fechar sobre a chave.
// t=1 seria o aperto total do clipe; 0.8–0.9 segura sem esconder a chave.
export function applyHold(out, indices, holdPose, t) {
  const k = clamp01(t)
  if (k <= 0) return out
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3
    out[v] += (holdPose[v] - out[v]) * k
    out[v + 1] += (holdPose[v + 1] - out[v + 1]) * k
    out[v + 2] += (holdPose[v + 2] - out[v + 2]) * k
  }
  return out
}

// centróide (espaço do rig) dos vértices da mão — onde a lanterna/chave se sentam
export function handCentroid(positions, indices, fallback) {
  if (!indices || indices.length === 0) return fallback
  const c = [0, 0, 0]
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3
    c[0] += positions[v]; c[1] += positions[v + 1]; c[2] += positions[v + 2]
  }
  return [c[0] / indices.length, c[1] / indices.length, c[2] / indices.length]
}
export function rightHandCentroid(positions, indices) { return handCentroid(positions, indices, [-0.268, 1.543, 0.357]) }
export function leftHandCentroid(positions, indices) { return handCentroid(positions, indices, [0.268, 1.543, 0.357]) }
