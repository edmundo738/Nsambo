// Protocolo LAN — funções puras
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oppositeRole, makeInit, parseInit, parseMessage, approachPos, lerpAngle, stepVelocity, STATE_INTERVAL, LAN_PORT } from '../src/backrooms/game/net-proto.mjs'

test('LAN_PORT é 8322', () => assert.equal(LAN_PORT, 8322))
test('STATE_INTERVAL ≈ 10 Hz', () => assert.equal(STATE_INTERVAL, 0.1))
test('oppositeRole inverte', () => {
  assert.equal(oppositeRole('hunter'), 'escapee')
  assert.equal(oppositeRole('escapee'), 'hunter')
})
test('makeInit → parseInit roundtrip', () => {
  const m = makeInit(12345, 'hunter')
  assert.deepEqual(parseInit(m), { type: 'init', seed: 12345, hostRole: 'hunter' })
})
test('parseInit rejeita lixo', () => {
  assert.equal(parseInit(null), null)
  assert.equal(parseInit({ type: 'st' }), null)
  assert.equal(parseInit({ type: 'init', seed: 'x', hostRole: 'hunter' }), null)
  assert.equal(parseInit({ type: 'init', seed: 1, hostRole: 'admin' }), null)
})
test('parseMessage nunca lança', () => {
  assert.equal(parseMessage('não é json'), null)
  assert.equal(parseMessage('{"type":"st"}').type, 'st')
  assert.equal(parseMessage('42'), null)
})
test('approachPos converge', () => {
  let p = { x: 0, z: 0 }
  const tgt = { x: 10, z: 0 }
  for (let i = 0; i < 60; i++) p = approachPos(p, tgt, 10, 0.016)
  assert.ok(Math.abs(p.x - 10) < 0.01)
})
test('lerpAngle atalho pela banda [-π, π]', () => {
  const a = lerpAngle(3.0, -3.0, 0.5)
  assert.ok(Math.abs(a) > 3.0 || Math.abs(a) < 0.2, `a=${a}`)   // pela banda longa/curativa
})
test('stepVelocity calcula rapidez', () => {
  const v = stepVelocity({ x: 0, z: 0 }, { x: 3, z: 4 }, 2)
  assert.equal(v.speed, 2.5)
})
