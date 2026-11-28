// NSAMBO ENGINE — flashlight-pressure.mjs — a lanterna como ferramenta (lógica PURA, testável)
// A pressão luminosa sobre o Stalker é  L = B × C × D × O
//   B — força da bateria (intensidade real do feixe; 0 se apagada/vazia)
//   C — alinhamento com o cone (1 dentro do cone interno → 0 fora do externo, suavizado)
//   D — atenuação pela distância, com alcance que ENCURTA à medida que a carga cai
//   O — oclusão: 1 sem obstruções, 0 com parede/divisória (usa a oclusão unificada de fora)
// Uma parede iluminada NÃO assusta — O faz o trabalho. Apontar para o chão não assusta — C faz o trabalho.
// Valores de referência (calibração em jogo é Fase 2/4 — ver docs/fase-lanterna).
export const FLASH_REACH_FULL = 13.5    // metros com a pilha cheia
export const FLASH_REACH_FLOOR = 0.55   // alcance residual como fração (a pilha fraca ainda acende perto)

export const clamp01 = (v) => Math.max(0, Math.min(1, v))

// B — curva contínua (não é um interruptor nem cinco patamares).
// 1.00 → 1.00 · 75% → ~0.73 · 50% → ~0.45 · 25% → ~0.30 · 10% → ~0.16 · 0% → 0
export function beamStrength(battery) {
  if (battery <= 0) return 0
  return 0.12 + 0.88 * Math.pow(clamp01(battery), 1.4)
}

// alcance eficaz (m) — acompanha a carga (a pilha fraca não atira longe)
export function reachFor(battery) {
  return FLASH_REACH_FULL * (FLASH_REACH_FLOOR + (1 - FLASH_REACH_FLOOR) * Math.pow(clamp01(battery), 0.8))
}

// C — 1 no cone interno, 0 fora do externo, smoothstep no anel entre eles
export function coneFactor(cosAngle, cosInner, cosOuter) {
  if (cosAngle <= cosOuter) return 0
  if (cosAngle >= cosInner) return 1
  const t = (cosAngle - cosOuter) / Math.max(1e-6, cosInner - cosOuter)
  return t * t * (3 - 2 * t)
}

// D — decaimento pela distância, normalizado pelo alcance efectivo da pilha
export function distanceFactor(dist, reach) {
  return Math.pow(clamp01(1 - dist / reach), 0.75)
}

// pressões compostas [0..1]. `occluded` vem da oclusão unificada (losClearXZ) — uma parede bloqueia o feixe.
export function flashlightPressure({ on, battery, eye, target, beamDir, cosInner, cosOuter, occluded }) {
  if (!on || battery <= 0) return 0
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2]
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 1e-3) return 1
  const bl = Math.hypot(beamDir[0], beamDir[1], beamDir[2]) || 1
  const cosA = (dx * beamDir[0] + dy * beamDir[1] + dz * beamDir[2]) / (dist * bl)
  const C = coneFactor(cosA, cosInner, cosOuter)
  if (C <= 0) return 0
  const B = beamStrength(battery)
  const D = distanceFactor(dist, reachFor(battery))
  const O = occluded ? 0 : 1
  return clamp01(B * C * D * O)
}
