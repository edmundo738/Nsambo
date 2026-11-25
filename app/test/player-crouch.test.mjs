import test from 'node:test'
import assert from 'node:assert/strict'
import { Player } from '../src/backrooms/game/player.js'
import { OPEN } from '../src/backrooms/engine/wfc.js'

// nível 3×3 totalmente aberto — spawn e saída opostos
function lvl() {
  const size = 3, cells = new Array(size * size).fill(OPEN)
  return { size, cells, spawn: { x: 0, z: 0 }, exit: { x: 2, z: 2 }, sealedEdges: [] }
}
const mockInput = {
  consumeMouseDelta: () => ({ x: 0, y: 0 }),
  isDown: () => false,
  isSprint: () => false,
  keys: new Set(),
}

test('agachar: olhos descem ~0.6 m e voltam; correr é impossível agachado', () => {
  const p = new Player(lvl())
  for (let i = 0; i < 60; i++) p.update(1 / 60, mockInput)
  const eyeStand = p.camEye[1]
  assert.ok(Math.abs(eyeStand - 1.62) < 0.06, `olho de pé ≈1.62 (${eyeStand})`)
  p.setCrouch(true)
  for (let i = 0; i < 90; i++) p.update(1 / 60, mockInput)
  const eyeCrouch = p.camEye[1]
  assert.ok(eyeCrouch < 1.15, `olho agachado ≈1.02 (${eyeCrouch})`)
  assert.ok(p.crouch)
  p.setCrouch(false)
  for (let i = 0; i < 90; i++) p.update(1 / 60, mockInput)
  assert.ok(p.camEye[1] > 1.55, `olho voltou a subir (${p.camEye[1]})`)
})

test('agachar: câmara encosta ~0.6 m abaixo do de pé parado', () => {
  const a = new Player(lvl()), b = new Player(lvl())
  for (let i = 0; i < 60; i++) { a.update(1 / 60, mockInput); b.update(1 / 60, mockInput) }
  b.setCrouch(true)
  for (let i = 0; i < 120; i++) { a.update(1 / 60, mockInput); b.update(1 / 60, mockInput) }
  const d = a.camEye[1] - b.camEye[1]
  assert.ok(d > 0.45 && d < 0.75, `diferença de altura ${d.toFixed(2)} m`)
})
