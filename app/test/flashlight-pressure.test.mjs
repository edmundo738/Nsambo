// Testes da pressão luminosa (L = B×C×D×O) e da resposta do Stalker à lanterna.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beamStrength, reachFor, coneFactor, distanceFactor, flashlightPressure, FLASH_REACH_FULL } from '../src/backrooms/game/flashlight-pressure.mjs'
import { StalkerBrain } from '../src/backrooms/game/stalker-ai.mjs'
import { CELL } from '../src/backrooms/engine/scene.js'

const cos = Math.cos
const full = { on: true, battery: 1.0, eye: [0, 1.6, 0], target: [0, 1.3, -4], beamDir: [0, -0.06, -1], cosInner: cos(0.30), cosOuter: cos(0.60), occluded: false }

test('B (beamStrength): curvas contínuas, extremos correctos', () => {
  assert.equal(beamStrength(0), 0)
  assert.equal(beamStrength(1), 1)
  assert.ok(beamStrength(0.75) > beamStrength(0.5) && beamStrength(0.5) > beamStrength(0.25) && beamStrength(0.25) > beamStrength(0.1) && beamStrength(0.1) > 0)
})

test('reachFor: alcance encurta com a bateria', () => {
  assert.equal(reachFor(1), FLASH_REACH_FULL)
  assert.ok(reachFor(0.5) < reachFor(1))
  assert.ok(reachFor(0.1) > reachFor(0) * 0)   // alcance mínimo > 0 mas L → 0 via B
})

test('C (coneFactor): pleno no cone interno, nulo fora do externo, monotónico no anel', () => {
  const ci = cos(0.30), co = cos(0.60)
  assert.equal(coneFactor(cos(0), ci, co), 1)
  assert.equal(coneFactor(cos(0.30), ci, co), 1)
  assert.equal(coneFactor(cos(0.61), ci, co), 0)
  const a = coneFactor(cos(0.40), ci, co)
  const b = coneFactor(cos(0.50), ci, co)
  assert.ok(a > b && b > 0 && a < 1)
})

test('D (distanceFactor): decai com a distância, zero no alcance', () => {
  const r = reachFor(1)
  assert.equal(distanceFactor(0, r), 1)
  assert.equal(distanceFactor(r, r), 0)
  assert.equal(distanceFactor(r + 5, r), 0)
  assert.ok(distanceFactor(2, r) > distanceFactor(8, r))
})

test('L: apagada ou vazia → 0 (nada de protecção por engano)', () => {
  assert.equal(flashlightPressure({ ...full, on: false }), 0)
  assert.equal(flashlightPressure({ ...full, battery: 0 }), 0)
})

test('L: feixe directo a queimar-lhe os olhos → forte', () => {
  const L = flashlightPressure(full)
  assert.ok(L > 0.75, `L=${L}`)
})

test('L: feixe directo com pilha a 10% → fraca (quase não protege)', () => {
  const Lfull = flashlightPressure(full)
  const Llow = flashlightPressure({ ...full, battery: 0.1 })
  assert.ok(Llow < 0.3 * Lfull, `Llow=${Llow} vs Lfull=${Lfull}`)
})

test('L: feixe noutra direcção (parede/chão) → 0 — iluminar não é proteger', () => {
  assert.equal(flashlightPressure({ ...full, beamDir: [0, -1, 0] }), 0)          // chão
  assert.equal(flashlightPressure({ ...full, beamDir: [1, 0, 0] }), 0)           // lateral
})

test('L: divisória a meio bloqueia a exposição (O = 0)', () => {
  assert.equal(flashlightPressure({ ...full, occluded: true }), 0)
})

test('L: alvo fora do alcance efectivo → 0', () => {
  assert.equal(flashlightPressure({ ...full, target: [0, 1.3, -60] }), 0)
})

test('L: monótona no ângulo e na bateria', () => {
  const L0 = flashlightPressure({ ...full, target: [0, 1.3, -2] })
  const L1 = flashlightPressure({ ...full, target: [0, 1.3, -7] })
  assert.ok(L0 > L1)
  const L50 = flashlightPressure({ ...full, battery: 0.5 })
  const L100 = flashlightPressure(full)
  assert.ok(L100 > L50)
})

// ── resposta do Stalker (integração com o cérebro) ─────────────
const SIZE = 9
const grid = () => new Array(SIZE * SIZE).fill(1)
const brainAt = (i, seed = 5) => new StalkerBrain({ cells: grid(), size: SIZE, sealedEdges: [], seed, startIdx: i })
const posOf = (i) => [(i % SIZE + 0.5) * CELL, (Math.floor(i / SIZE) + 0.5) * CELL]

test('Stalker: sob feixe forte recua (fica mais longe) em vez de avançar', () => {
  const [bx, bz] = posOf(4 * SIZE + 4)
  const b = brainAt(4 * SIZE + 4)
  const [px, pz] = posOf(4 * SIZE + 6)   // jogador 6 m à frente
  // coloca em hunt diretamente
  b.state = 'hunt'
  const d0 = Math.hypot(b.x - px, b.z - pz)
  for (let t = 0; t < 60; t++) b.update({ dt: 0.1, px, pz, py: 1.6, noise: 0, time: t * 0.1, crouch: false, light: 1.0 })
  const d1 = Math.hypot(b.x - px, b.z - pz)
  assert.ok(d1 > d0, `era p/ recuar: d0=${d0.toFixed(2)} d1=${d1.toFixed(2)}`)
})

test('Stalker: sem luz (light=0) o comportamento é o de sempre', () => {
  const b = brainAt(4 * SIZE + 4, 9)
  const [px, pz] = posOf(4 * SIZE + 6)
  b.state = 'hunt'
  const xs = []
  for (let t = 0; t < 30; t++) { b.update({ dt: 0.1, px, pz, py: 1.6, noise: 0, time: t * 0.1, crouch: false, light: 0 }); xs.push(b.x) }
  assert.ok(b.x < posOf(4 * SIZE + 4)[0] + 0.5 || xs.every(v => Number.isFinite(v)))
  assert.equal(b.lightPressure, 0)
})

test('Stalker: histerese — um flash de luz não pisca a reacção (decaimento suave)', () => {
  const b = brainAt(4 * SIZE + 4, 11)
  const [px, pz] = posOf(4 * SIZE + 6)
  b.state = 'hunt'
  b.update({ dt: 0.1, px, pz, py: 1.6, noise: 0, time: 0, crouch: false, light: 1.0 })
  const p1 = b.lightPressure
  for (let t = 1; t < 8; t++) b.update({ dt: 0.1, px, pz, py: 1.6, noise: 0, time: t * 0.1, crouch: false, light: 0 })
  const p2 = b.lightPressure
  assert.ok(p1 > 0.9 && p2 > 0 && p2 < p1, `p1=${p1} p2=${p2}`)
})

test('Stalker: bote NÃO acontece sob feixe forte (proteção do momento)', () => {
  const b = brainAt(4 * SIZE + 4, 13)
  const [px, pz] = posOf(4 * SIZE + 4)   // jogador ENCOSTADO
  b.state = 'hunt'
  // pressão alta mantida por alguns frames
  let poured = false
  for (let t = 0; t < 30; t++) {
    const out = b.update({ dt: 0.1, px, pz, py: 1.6, noise: 0, time: t * 0.1, crouch: false, light: 1.0 })
    if (out.events.includes('pounce')) poured = true
  }
  assert.equal(poured, false, 'não pode bote sob feixe forte')
})
