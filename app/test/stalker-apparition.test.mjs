// O stalker como aparição: imóvel, encara, não reage — e nunca auto-acorda
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StalkerBrain, STALKER_STATES } from '../src/backrooms/game/stalker-ai.mjs'
import { CELL } from '../src/backrooms/engine/scene.js'

const SIZE = 7
const grid = () => new Array(SIZE * SIZE).fill(1)
const brainAt = (i, seed = 3) => new StalkerBrain({ cells: grid(), size: SIZE, sealedEdges: [], seed, startIdx: i })

test('STALKER_STATES inclui apparition', () => {
  assert.ok(STALKER_STATES.includes('apparition'))
})

test('aparicao: velocidade zero, sem eventos, estado estável, distância computada', () => {
  const b = brainAt(3 * SIZE + 3, 3)
  b.state = 'apparition'
  b.x = 10; b.z = 10
  const out = b.update({ dt: 0.1, px: 19, pz: 10, py: 1.6, noise: 0, time: 0, crouch: false, light: 1.0 })
  assert.equal(out.state, 'apparition')
  assert.equal(out.speed, 0)
  assert.deepEqual(out.events, [])
  assert.ok(out.distance > 8.9 && out.distance < 9.1)
  // feixe direto na cara NÃO muda nada — ele não reage à luz em aparição
  const out2 = b.update({ dt: 0.1, px: 19, pz: 10, py: 1.6, noise: 0, time: 0.1, crouch: false, light: 1.0 })
  assert.equal(out2.state, 'apparition')
  // e com o jogador a correr/fazer barulho — continua aparição
  const out3 = b.update({ dt: 0.1, px: 19, pz: 10, py: 1.6, noise: 1.0, time: 0.2, crouch: false, light: 0 })
  assert.equal(out3.state, 'apparition')
})

test('adormecido com dormantTimer infinito nunca desperta sozinho', () => {
  const b = brainAt(3 * SIZE + 3, 4)
  b.state = 'dormant'
  b.dormantTimer = Infinity
  for (let t = 0; t < 600; t++) {
    const out = b.update({ dt: 0.1, px: 3 * CELL + 7, pz: 3 * CELL, py: 1.6, noise: 1.0, time: t * 0.1, crouch: false, light: 0 })
    assert.equal(out.state, 'dormant', `acordou no tick ${t}`)
  }
})
