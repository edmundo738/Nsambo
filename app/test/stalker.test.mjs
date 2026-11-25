import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StalkerBrain, bfsNextStep, hearRange, makeSealedSet } from '../src/backrooms/game/stalker-ai.mjs'

const SIZE = 20
const open = () => new Uint8Array(SIZE * SIZE).fill(1)
const CELL = 3.0
const c2w = (c) => (c + 0.5) * CELL

function brainAt(cells, r, c, seed = 42) {
  const b = new StalkerBrain({ cells, size: SIZE, sealedEdges: [], seed, startIdx: r * SIZE + c })
  b.dormantTimer = 0.01
  return b
}
const step = (b, env, times = 1, dt = 1 / 30) => {
  let out
  const events = []
  for (let i = 0; i < times; i++) { out = b.update({ dt, ...env }); events.push(...out.events) }
  return { ...out, events }
}

test('bfsNextStep: caminho reto livre', () => {
  const cells = open()
  const n = bfsNextStep(cells, SIZE, 2 * SIZE + 2, 2 * SIZE + 6, makeSealedSet([]))
  assert.equal(n, 2 * SIZE + 3)
})

test('bfsNextStep: contorna parede', () => {
  const cells = open()
  // muralha vertical em x=3, exceto no topo
  for (let r = 0; r < SIZE - 1; r++) cells[r * SIZE + 3] = 0
  const n = bfsNextStep(cells, SIZE, 2 * SIZE + 2, 2 * SIZE + 5, makeSealedSet([]))
  assert.notEqual(n, -1)
  // primeiro passo tem de rodear pela linha SIZE-1 (o único vão)
  assert.ok(Math.floor(n / SIZE) >= 2)
})

test('hearRange: silêncio não alerta; sprint alcança longe', () => {
  assert.equal(hearRange(0), 0)
  assert.ok(hearRange(1) > 15)
  assert.ok(hearRange(0.4) > 5 && hearRange(0.4) < 12)
})

test('desperta com distância mínima e evento spawn', () => {
  const cells = open()
  const b = brainAt(cells, 0, 0, 42)
  const px = c2w(19), pz = c2w(19)
  const out = step(b, { px, pz, noise: 0 }, 3)
  assert.equal(out.state, 'roam')
  assert.ok(out.events.includes('spawn'))
  const d = Math.hypot(out.x - px, out.z - pz)
  assert.ok(d >= 13, `spawn demasiado perto do jogador (${d.toFixed(1)} m)`)
})

test('visão no FOV → STALK; contacto prolongado próximo → HUNT', () => {
  const cells = open()
  const b = brainAt(cells, 5, 5, 7)
  b.state = 'roam'; b.targetIdx = -1
  const px = c2w(5), pz = c2w(8)                       // 9 m à frente (+z)
  b.yaw = Math.PI                                       // virado a +z
  const out = step(b, { px, pz, noise: 0 }, 6)
  assert.equal(out.state, 'stalk')
  let sawHunt = false
  for (let i = 0; i < 30 * 5 && !sawHunt; i++) {
    const o = b.update({ dt: 1 / 30, px, pz, noise: 0 })
    if (o.state === 'hunt') sawHunt = true
  }
  assert.ok(sawHunt, 'espreita prolongada devia escalar para caça')
})

test('sem LOS na muralha, o ruído chega abafado mas chega', () => {
  const cells = open()
  for (let r = 0; r < SIZE; r++) if (r !== 9) cells[r * SIZE + 6] = 0   // muralha com vão em r=9
  const b = brainAt(cells, 0, 0, 11)
  b.state = 'roam'; b.targetIdx = -1
  b.x = c2w(4); b.z = c2w(4)
  const px = c2w(4), pz = c2w(8)                        // atrás da muralha, ~12 m
  const before = b.state
  const out = step(b, { px, pz, noise: 1 }, 4)
  assert.equal(before, 'roam')
  assert.equal(out.state, 'investigate')
})

test('memória decai → hunt perde o rasto → lost → vanish', () => {
  const cells = open()
  const b = brainAt(cells, 0, 0, 99)
  b.state = 'hunt'; b.targetIdx = -1
  b.memPos = [c2w(0), c2w(0)]
  b.memAge = 0
  const px = c2w(19), pz = c2w(19)                      // jogador muito longe, sem ver
  const out = step(b, { px, pz, noise: 0 }, 30 * 10)    // 10 s
  assert.equal(out.state, 'lost')
  const out2 = step(b, { px, pz, noise: 0 }, 30 * 12)   // mais de 9 s perdido
  assert.equal(out2.state, 'gone')
  assert.ok(out2.events.includes('vanish'))
})

test('pounce em contacto → gone com cooldown', () => {
  const cells = open()
  const b = brainAt(cells, 5, 5, 13)
  b.state = 'hunt'; b.targetIdx = -1
  const px = b.x + 0.9, pz = b.z
  const out = step(b, { px, pz, noise: 0 }, 1)
  assert.ok(out.events.includes('pounce'))
  assert.equal(out.state, 'gone')
  assert.ok(b.cooldown >= 50)
})

test('determinismo: mesma seed + mesmos inputs ⇒ mesma trajetória', () => {
  const cells = open()
  const a = brainAt(cells, 3, 3, 1234), b = brainAt(cells, 3, 3, 1234)
  const px = c2w(10), pz = c2w(10)
  for (let i = 0; i < 200; i++) {
    const oa = a.update({ dt: 1 / 30, px, pz, noise: i % 50 < 10 ? 1 : 0 })
    const ob = b.update({ dt: 1 / 30, px, pz, noise: i % 50 < 10 ? 1 : 0 })
    assert.equal(oa.state, ob.state)
    assert.equal(oa.x.toFixed(6), ob.x.toFixed(6))
    assert.equal(oa.z.toFixed(6), ob.z.toFixed(6))
  }
})

test('gone → cooldown expira → respawn longe', () => {
  const cells = open()
  const b = brainAt(cells, 1, 1, 555)
  b.state = 'gone'; b.cooldown = 0.02
  const px = c2w(0), pz = c2w(0)
  const out = step(b, { px, pz, noise: 0 }, 4)
  assert.equal(out.state, 'roam')
  assert.ok(out.events.includes('respawn'))
  assert.ok(Math.hypot(out.x - px, out.z - pz) >= 9, 'respawn demasiado perto')
})
