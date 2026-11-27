import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHealth, damageHealth, healHealth, updateHealth, lowHealthPulse, heartbeatInterval, HEALTH_MAX, REGEN_DELAY, INVULN_SECONDS } from '../src/backrooms/game/health.mjs'

test('vida começa cheia e o dano retira o correto', () => {
  const h = createHealth()
  assert.equal(h.hp, HEALTH_MAX)
  assert.equal(damageHealth(h, 30), 30)
  assert.equal(h.hp, 70)
  assert.equal(h.hits, 1)
})

test('invulnerabilidade breve absorve o segundo golpe', () => {
  const h = createHealth()
  damageHealth(h, 58)
  assert.equal(damageHealth(h, 58), 0)   // segundo pounce dentro da janela — absorvido
  assert.equal(h.hp, 42)
  assert.equal(h.invuln, INVULN_SECONDS)
})

test('a invulnerabilidade decai e o golpe seguinte volta a valer', () => {
  const h = createHealth()
  damageHealth(h, 20)
  updateHealth(h, INVULN_SECONDS + 0.01)
  assert.equal(damageHealth(h, 20), 20)
})

test('sem regeneração antes do delay; com ela depois', () => {
  const h = createHealth()
  damageHealth(h, 50)
  updateHealth(h, REGEN_DELAY - 0.5)
  const before = h.hp
  assert.equal(h.hp, before)   // ainda sem regen
  for (let i = 0; i < 120; i++) updateHealth(h, 0.1)   // 12 s
  assert.ok(h.hp > before + 20, `regen deveria recuperar (hp=${h.hp})`)
})

test('medkit cura e limita ao máximo', () => {
  const h = createHealth()
  damageHealth(h, 40)
  healHealth(h, 34)
  assert.equal(h.hp, 94)
  healHealth(h, 999)
  assert.equal(h.hp, HEALTH_MAX)
})

test('pulso de vida crítica só abaixo de 34 e o coração acelera', () => {
  const h = createHealth()
  assert.equal(lowHealthPulse(h), 0)
  h.hp = 20
  assert.ok(lowHealthPulse(h) > 0.4)
  assert.ok(heartbeatInterval(h) < 0.92 - 0.1)
  h.hp = 0
  assert.equal(lowHealthPulse(h), 1)
})
