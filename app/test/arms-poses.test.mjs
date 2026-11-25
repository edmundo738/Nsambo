import test from 'node:test'
import assert from 'node:assert/strict'
import { poseWeights, blendPoses, pulse, clamp01, rightHandIndices, rightHandCentroid, leftHandIndices, leftHandCentroid, leftArmIndices, applyHold } from '../src/backrooms/game/arms-poses.mjs'

test('clamp01: extremos e fora de escala', () => {
  assert.equal(clamp01(-1), 0); assert.equal(clamp01(0.5), 0.5); assert.equal(clamp01(2), 1)
})
test('pulse: 0 fora da janela, ~1 no pico, simétrico-ish nas pontas', () => {
  assert.equal(pulse(-0.01, 0.6), 0)
  assert.equal(pulse(0.6, 0.6), 0)
  const peak = pulse(0.18, 0.6, 0.18)
  assert.ok(peak > 0.95, `pico ${peak}`)
  const early = pulse(0.03, 0.6, 0.18)
  assert.ok(early > 0 && early < peak)
  const late = pulse(0.45, 0.6, 0.18)
  assert.ok(late >= 0 && late < peak)
})
test('poseWeights: parado+sem ações = 100% relax', () => {
  const w = poseWeights({})
  assert.equal(w.guard, 0); assert.equal(w.grab, 0); assert.equal(w.push, 0); assert.equal(w.relax, 1)
})
test('poseWeights: a correr pesa para guard mas nunca o substitui', () => {
  const w = poseWeights({ speed: 3.0 })
  assert.ok(w.guard > 0.4 && w.guard <= 0.55)
  assert.ok(w.relax > 0)
})
test('poseWeights: ação exclui guard; grab+push distribuem a si mesmos', () => {
  const w = poseWeights({ speed: 3.0, grab: 1 })
  assert.equal(w.guard, 0)
  assert.ok(Math.abs(w.grab - 1) < 1e-6)
  const w2 = poseWeights({ grab: 1, push: 1 })
  assert.ok(Math.abs(w2.grab - 0.5) < 1e-6 && Math.abs(w2.push - 0.5) < 1e-6)
})
test('poseWeights: soma sempre 1', () => {
  for (const speed of [0, 1, 2, 3]) for (const grab of [0, 0.5, 1]) for (const push of [0, 0.5, 1]) {
    const w = poseWeights({ speed, grab, push })
    assert.ok(Math.abs(w.relax + w.guard + w.grab + w.push - 1) < 1e-6, `soma=${w.relax + w.guard + w.grab + w.push}`)
  }
})
test('blendPoses: vértice 1 vértice óbvio (pose única pesa 1)', () => {
  const poses = {
    relaxA: new Float32Array([0, 0, 0]), relaxB: new Float32Array([10, 10, 10]),
    guard: new Float32Array([100, 0, 0]), grab: new Float32Array([0, 100, 0]), push: new Float32Array([0, 0, 100]),
  }
  const out = new Float32Array(3)
  blendPoses(out, poses, { relax: 0, guard: 1, grab: 0, push: 0, breath: 0.5 })
  assert.deepEqual([...out], [100, 0, 0])
  blendPoses(out, poses, { relax: 1, guard: 0, grab: 0, push: 0, breath: 0 })
  assert.deepEqual([...out], [0, 0, 0])
  blendPoses(out, poses, { relax: 1, guard: 0, grab: 0, push: 0, breath: 1 })
  assert.deepEqual([...out], [10, 10, 10])
  blendPoses(out, poses, { relax: 0, guard: 0, grab: 0.5, push: 0.5, breath: 0 })
  assert.deepEqual([...out], [0, 50, 50])
})

test('rightHandIndices + centroid: encontra a mão direita no bake do rig', async () => {
  globalThis.fetch = async (u) => { const b = await import('node:fs').then(fs => fs.readFileSync(u)); return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }
  const { loadGLB } = await import('../src/backrooms/engine/gltf.js')
  const m = await loadGLB(new URL('../../assets/models/arms_rig.glb', import.meta.url).pathname, { anim: 'relax', animTime: 0 })
  const idx = rightHandIndices(m.positions)
  assert.ok(idx.length > 40, `mão direita deve ter >40 vértices, tem ${idx.length}`)
  const c = rightHandCentroid(m.positions, idx)
  assert.ok(c[0] < -0.1, `rig: mão direita em x<0 (vista espelha-x), obtido ${c[0].toFixed(3)}`)
  assert.ok(Number.isFinite(c[1]) && Number.isFinite(c[2]))
})
test('rightHandCentroid: fallback seguro sem índices', () => {
  const c = rightHandCentroid(new Float32Array([0, 0, 0]), new Uint32Array(0))
  assert.deepEqual(c, [-0.268, 1.543, 0.357])
})

test('leftArmIndices: metade raw x>0 (braço esquerdo inteiro)', () => {
  const pos = new Float32Array([0.5, 0, 0,  -0.5, 0, 0,  0.1, 0, 0,  -0.1, 0, 0])
  const idx = leftArmIndices(pos)
  assert.deepEqual([...idx], [0, 2])
})

test('leftHandIndices: espelho da direita (raw x>0)', () => {
  // espelho dos dados sintéticos: direita raw x<0, esquerda raw x>0
  const pos = new Float32Array([0.3, 1.6, 0.5,  -0.3, 1.6, 0.5,  0.3, 0.2, -0.1])
  const li = leftHandIndices(pos, { rigEyeY: 1.70 })
  assert.deepEqual([...li], [0])
})

test('applyHold: mistura parcial em direção à pose alvo', () => {
  const out = new Float32Array([0, 0, 0,  10, 10, 10])
  const target = new Float32Array([10, 0, 0,  10, 0, 10])
  applyHold(out, new Uint32Array([0, 1]), target, 0.5)
  assert.deepEqual([...out], [5, 0, 0,  10, 5, 10])
  applyHold(out, new Uint32Array([0, 1]), target, 2)   // t clamped a 1
  assert.deepEqual([...out], [10, 0, 0,  10, 0, 10])
  const before = new Float32Array([1, 2, 3])
  applyHold(before, new Uint32Array([0]), target, 0)   // no-op
  assert.deepEqual([...before], [1, 2, 3])
})
