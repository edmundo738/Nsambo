// NSAMBO ENGINE — arms-anim.mjs — locomoção real dos braços (FSM + fase por distância)
// Antes: a velocidade só aumentava o peso de uma pose estática (knife_idle). Agora:
//   idle → walk → run   com histerese, fase avançada pela DISTÂNCIA real percorrida
//   (stride walk 1.45 m · run 2.05 m) e oscilação fore-aft/lateral procedural por vértice,
//   pesada pela altura (ombro ≈ 0 → mão ≈ 1) e alternada esquerda/direita.
// Nada aqui toca no WebGL — aplicado sobre o blend de poses no CPU antes do upload.

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// comprimentos de passada (m) e amplitudes de oscilação das mãos (m)
export const STRIDE = { walk: 1.45, run: 2.05 }
export const SWING = { walk: 0.055, run: 0.105 }
export const SHOULDER = { x: 0.30, y: 1.56, z: 0.02 }   // ombro no rig (espaço do rig)
export const ARM_SPAN = 0.40           // distância ombro→mão (norma)
export const BOB = 0.35              // bob vertical relativo à oscilação (run > walk fica natural)

export function createLocoState() {
  return { state: 'idle', phase: 0, amp: 0, ampTarget: 0 }
}

// decisão com histerese — evita flicker idle↔walk↔run na fronteira
export function locoTargetState(speed) {
  if (speed < 0.35) return 'idle'
  if (speed < 2.15) return 'walk'
  return 'run'
}

// avança a locomoção: dist = metros realmente andados neste tick; speed = m/s atual.
// devolve { state, phase, amp } — amp já com rampa suave (entra/sai sem estalo).
export function locoUpdate(st, dist, speed, dt) {
  const target = locoTargetState(speed)
  // de-escalona idle↔walk quando a velocidade está na fronteira (histerese ±0.2 m/s)
  if (st.state !== target) {
    const cur = st.state
    const ok =
      (cur === 'idle' && target === 'walk' && speed > 0.55) ||
      (cur === 'walk' && target === 'idle' && speed < 0.15) ||
      (cur === 'walk' && target === 'run' && speed > 2.35) ||
      (cur === 'run' && target === 'walk' && speed < 1.95) ||
      (cur === 'idle' && target === 'run') || (cur === 'run' && target === 'idle')
    if (ok) st.state = target
  }
  const stride = st.state === 'run' ? STRIDE.run : STRIDE.walk
  if (st.state !== 'idle') st.phase = (st.phase + dist / stride) % 1
  st.ampTarget = st.state === 'idle' ? 0 : SWING[st.state] * clamp01(speed / (st.state === 'run' ? 3.1 : 1.6)) * (st.state === 'run' ? 1 : clamp01((speed - 0.4) / 1.2))
  const k = 1 - Math.exp(-8 * dt)                      // rampa exponencial — assenta sem estalo
  st.amp += (st.ampTarget - st.amp) * k
  if (st.state === 'idle' && st.amp < 0.002) st.phase = 0
  return { state: st.state, phase: st.phase, amp: st.amp }
}

// pesos de oscilação por vértice (0 no ombro → 1 na mão) a partir da POSE ATUAL.
// Avaliados por frame sobre o blend — cache no bind pose falha quando o relax tem os braços
// mais altos (pesos máximos ~0.34 → oscilação invisível). raw x > 0 = esquerda.
export function computeSwingWeights(positions, outW, outSide) {
  const n = positions.length / 3
  const w = outW ?? new Float32Array(n)
  const side = outSide ?? new Float32Array(n)
  const span = Math.max(0.05, ARM_SPAN)
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    const sg = Math.abs(x) < 0.06 ? 0 : (x > 0 ? 1 : -1)
    side[v] = sg
    const sx = (sg === 0 ? 0 : sg * SHOULDER.x)
    const d = Math.hypot(x - sx, y - SHOULDER.y, z - SHOULDER.z)
    w[v] = Math.pow(clamp01(d / span), 1.25)
  }
  return { w, side }
}

// aplica a oscilação sobre o blend atual (pós poses) — in loco, in-place em `out`.
// frente/trás em Z do rig (hands pendulumam a partir do ombro), balanço lateral X subtil,
// bob vertical Y — tudo ∝ amp·sin(2π·fase)·peso. L/R em contrafase.
export function applyLocoSwing(out, weights, phase, amp) {
  const { w, side } = weights
  if (amp <= 0.0005) return out
  const ph = phase * Math.PI * 2
  const s = Math.sin(ph)
  const s2 = Math.sin(ph * 2)
  const c = Math.cos(ph)
  const A = amp
  for (let v = 0; v < w.length; v++) {
    const wv = w[v]
    if (wv <= 0 || side[v] === 0) continue
    const sgn = side[v]
    const o = v * 3
    const local = s * (sgn > 0 ? 1 : -1)               // contrafase L/R
    out[o] += sgn * s2 * A * 0.5 * wv                  // balanço lateral — legível em 1ª pessoa
    out[o + 1] += c * A * BOB * 0.45 * wv              // bob vertical
    out[o + 2] += local * A * wv                        // péndulo frente/trás (dominante)
  }
  return out
}

// ── eixo de pega (forearm→hand) para ligar props à palma ──────────────────
// índices do antebraço por lado — banda de distância ombro→vértice (cotovelo≈0.15 · punho≈0.30)
export function forearmIndices(positions, sign) {
  const idx = []
  for (let v = 0; v * 3 < positions.length; v++) {
    const x = -positions[v * 3]                       // vista espelhada como handIndices (sign=1 → direita)
    const rawX = positions[v * 3]
    const y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    if (x * sign <= 0.08) continue
    const sg = rawX > 0 ? 1 : -1                       // ombro em espaço raw (convenção do mesh)
    const d = Math.hypot(rawX - sg * SHOULDER.x, y - SHOULDER.y, z - SHOULDER.z)
    if (d > 0.12 && d < 0.27) idx.push(v)
  }
  return new Uint32Array(idx)
}
export function centroidOf(positions, indices, fallback) {
  if (!indices || indices.length === 0) return fallback
  const c = [0, 0, 0]
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3
    c[0] += positions[v]; c[1] += positions[v + 1]; c[2] += positions[v + 2]
  }
  return [c[0] / indices.length, c[1] / indices.length, c[2] / indices.length]
}
