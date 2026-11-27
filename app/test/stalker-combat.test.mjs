import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StalkerBrain } from '../src/backrooms/game/stalker-ai.mjs'

const SIZE = 20
const open = () => new Uint8Array(SIZE * SIZE).fill(1)
const c2w = (c) => (c + 0.5) * 3.0

function awakeBrain(cells, r, c, seed = 42) {
  const b = new StalkerBrain({ cells, size: SIZE, sealedEdges: [], seed, startIdx: r * SIZE + c })
  b.dormantTimer = 0
  b.state = 'hunt'
  b.update({ dt: 1 / 30, px: c2w(c) + 6, pz: c2w(r) + 6, noise: 1, time: 0, crouch: false })
  return b
}

test('damage reduz a vida e atordoa (update devolve speed 0, sem caçar)', () => {
  const cells = open()
  const b = awakeBrain(cells, 8, 8)
  const out = b.damage(40, 1, 0)
  assert.equal(out, 'stagger')
  assert.equal(b.hp, 60)
  const after = b.update({ dt: 1 / 30, px: c2w(8), pz: c2w(8), noise: 1, time: 0, crouch: false })
  assert.equal(after.speed, 0)
})

test('três facadas derrubam o stalker para sempre (gone, sem respawn)', () => {
  const cells = open()
  const b = awakeBrain(cells, 8, 8)
  assert.equal(b.damage(40, 1, 0), 'stagger')
  assert.equal(b.damage(40, 1, 0), 'stagger')
  assert.equal(b.damage(40, 1, 0), 'dead')
  assert.equal(b.alive, false)
  assert.equal(b.state, 'gone')
  for (let i = 0; i < 400; i++) {
    b.update({ dt: 1 / 30, px: c2w(8), pz: c2w(8), noise: 1, time: 0, crouch: false })
  }
  assert.equal(b.state, 'gone')   // morreu — nunca mais volta ao quarto
})

test('facadas empurrão a criatura na direção do golpe', () => {
  const cells = open()
  const b = awakeBrain(cells, 8, 8)
  const x0 = b.x
  b.damage(40, 1, 0)   // empurrão para +x
  for (let i = 0; i < 45; i++) b.update({ dt: 1 / 30, px: c2w(8) - 30, pz: c2w(8), noise: 0, time: 0, crouch: false })
  assert.ok(b.x > x0 + 0.4, `devia ter deslizado (x0=${x0}, x=${b.x})`)
})

test('o atordoamento expira e a caçada continua', () => {
  const cells = open()
  const b = awakeBrain(cells, 8, 8)
  b.damage(40, 0, 1)
  assert.ok(b.stunT > 0)
  for (let i = 0; i < 90; i++) b.update({ dt: 1 / 30, px: c2w(8) + 9, pz: c2w(8) + 9, noise: 1, time: 0, crouch: false })
  assert.equal(b.stunT, 0)
  assert.equal(b.alive, true)
})
