// Locomoção dos braços — FSM idle/walk/run, fase por distância, oscilação procedural (PURO, node)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLocoState, locoUpdate, locoTargetState, computeSwingWeights, applyLocoSwing,
  forearmIndices, STRIDE, SWING,
} from '../src/backrooms/game/arms-anim.mjs'
import { recomputeNormals, recomputeTangents } from '../src/backrooms/engine/meshmix.mjs'

test('FSM escolhe idle/walk/run por velocidade', () => {
  assert.equal(locoTargetState(0), 'idle')
  assert.equal(locoTargetState(0.3), 'idle')
  assert.equal(locoTargetState(1.5), 'walk')
  assert.equal(locoTargetState(2.5), 'run')
})

test('fase avança pela distância andada (não pelo relógio)', () => {
  const st = createLocoState()
  locoUpdate(st, 0, 1.5, 1 / 60)                    // walk após histerese (0.55 m/s)
  locoUpdate(st, 0, 1.5, 1 / 60)
  const p0 = st.phase
  locoUpdate(st, 0.725, 1.5, 1 / 60)                // meia passada de walk (1.45 m)
  assert.ok(Math.abs(st.phase - p0 - 0.5) < 1e-9, `fase ${st.phase} deveria avançar 0.5`)
  locoUpdate(st, 0.725, 1.5, 1 / 60)                // passada completa → mod 1
  assert.ok(Math.abs(st.phase - p0) < 1e-9)
})

test('idle não anda e assenta (amp → 0, fase zera)', () => {
  const st = createLocoState()
  locoUpdate(st, 1.2, 1.5, 0.016); locoUpdate(st, 1.2, 1.5, 0.016)
  const pRun = st.phase
  locoUpdate(st, 0, 0.0, 0.2)
  assert.equal(st.state, 'idle')
  assert.ok(st.amp < 0.06)                          // rampa de descida
  for (let i = 0; i < 240; i++) locoUpdate(st, 0, 0.0, 1 / 60)
  assert.equal(st.phase, 0)
  assert.ok(st.amp < 0.002)
  void pRun
})

test('histerese evita flicker na fronteira', () => {
  const st = createLocoState()
  locoUpdate(st, 0.5, 1.6, 0.016); locoUpdate(st, 0.5, 1.6, 0.016)
  assert.equal(st.state, 'walk')
  locoUpdate(st, 0.1, 2.2, 0.016)                   // 2.2 < 2.35 → mantém walk
  assert.equal(st.state, 'walk')
  locoUpdate(st, 0.1, 2.5, 0.016)                   // acima do limiar → run
  assert.equal(st.state, 'run')
  locoUpdate(st, 0.1, 2.1, 0.016)                   // 2.1 > 1.95 → mantém run
  assert.equal(st.state, 'run')
})

test('esquerda e direita oscilam em CONTRAFASE; as mãos movem-se mais que os ombros', () => {
  // rig sintético: ombro junto ao eixo · cotovelo meio · mão esticada à frente (z+)
  const pos = new Float32Array([
    -0.31, 1.55, 0.03,  -0.34, 1.45, 0.18,  -0.40, 1.35, 0.38,   // esquerda
     0.31, 1.55, 0.03,   0.34, 1.45, 0.18,   0.40, 1.35, 0.38,   // direita
  ])
  const weights = computeSwingWeights(pos)
  assert.ok(weights.w[0] < weights.w[1] && weights.w[1] < weights.w[2], 'peso cresce ombro→mão')
  const out = Float32Array.from(pos)
  applyLocoSwing(out, weights, 0.25, SWING.walk)    // sin(π/2)=1
  const leftHandDz = out[2 * 3 + 2] - pos[2 * 3 + 2]
  const rightHandDz = out[5 * 3 + 2] - pos[5 * 3 + 2]
  assert.ok(leftHandDz < 0)   // side=−1 (raw x<0 = esq no mesh)
  assert.ok(rightHandDz > 0)
  assert.ok(Math.abs(leftHandDz + rightHandDz) < 1e-6)   // contrafase simétrica
  assert.ok(Math.abs(out[0] - pos[0]) < Math.abs(leftHandDz))  // ombro quase parado
})

test('amp do run > amp do walk; amp escala com a velocidade', () => {
  const st = createLocoState()
  locoUpdate(st, 2, 1.5, 0.016); locoUpdate(st, 2, 1.5, 0.016)
  const ampWalk = st.amp
  for (let i = 0; i < 30; i++) locoUpdate(st, 0.05, 3.0, 0.016)
  const ampRun = st.amp
  assert.ok(ampRun > ampWalk * 1.5, `run ${ampRun} deveria ser claramente > walk ${ampWalk}`)
})

test('forearmIndices por distância ao ombro e lado', () => {
  // pontos sintéticos: mid-antebraço vs mão vs ombro — x raw = vista espelhada
  const mk = (rx, y, z) => [rx, y, z]
  const pos = new Float32Array([
    ...mk(-0.34, 1.45, 0.16),   // v0 · direito · ~0.19 do ombro → antebraço
    ...mk(-0.42, 1.35, 0.36),   // v1 · direito · ~0.36 → mão/punho
    ...mk( 0.34, 1.45, 0.16),   // v2 · esquerdo · ~0.19 → antebraço
    ...mk( 0.42, 1.35, 0.36),   // v3 · esquerdo · ~0.36
  ])
  const r = forearmIndices(pos, 1), l = forearmIndices(pos, -1)
  assert.deepEqual([...r], [0])
  assert.deepEqual([...l], [2])
})

test('recomputeNormals após deformação muda a normal; unitária e finita', () => {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const idx = new Uint32Array([0, 1, 2])
  const n = recomputeNormals(pos, idx)
  assert.ok(Math.abs(n[2] - 1) < 1e-6)              // face em XY → normal +Z
  // dobra o 3º vértice para fora do plano → normal inclina
  pos[8] = 0.5
  const n2 = recomputeNormals(pos, idx, new Float32Array(9))
  const len = Math.hypot(n2[6], n2[7], n2[8])
  assert.ok(Math.abs(len - 1) < 1e-6)
  assert.ok(n2[7] < 0)                              // inclinação real após deformação
})

test('recomputeTangents ortogonal ao normal e w=±1', () => {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const uv = new Float32Array([0, 0, 1, 0, 0, 1])
  const idx = new Uint32Array([0, 1, 2])
  const nrm = recomputeNormals(pos, idx)
  const tan = recomputeTangents(pos, nrm, uv, idx)
  assert.ok(Math.abs(tan[3]) === 1)
  const d = tan[0] * nrm[0] + tan[1] * nrm[1] + tan[2] * nrm[2]
  assert.ok(Math.abs(d) < 1e-6, 'tangente ⟂ normal')
})
