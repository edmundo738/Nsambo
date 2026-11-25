import test from 'node:test'
import assert from 'node:assert/strict'
import { Player } from '../src/backrooms/game/player.js'
import { pickVioletPos } from '../src/backrooms/game/violet.js'
import { generateLevel, OPEN } from '../src/backrooms/engine/wfc.js'
import { CELL } from '../src/backrooms/engine/scene.js'

// nível 5×5 aberto, com uma parede vertical na coluna 2 (menos a linha 0)
function lvl(sealed = []) {
  const size = 5, cells = new Array(size * size).fill(OPEN)
  for (let z = 1; z < size; z++) cells[z * size + 2] = 0
  return { size, cells, spawn: { x: 0, z: 0 }, exit: { x: 4, z: 4 }, sealedEdges: sealed }
}
const c = (i) => (i + 0.5) * CELL

test('LOS: parede sólida bloqueia; corredor livre não', () => {
  const p = new Player(lvl())
  assert.equal(p.hasLineOfSight(c(0), c(2), c(4), c(2)), false)   // atravessa a parede da coluna 2
  assert.equal(p.hasLineOfSight(c(0), c(0), c(4), c(0)), true)    // linha 0 livre
})
test('LOS: aresta selada bloqueia', () => {
  const l = lvl([[0, 1]])           // sela (0,0)↔(1,0)
  const p = new Player(l)
  assert.equal(p.hasLineOfSight(c(0), c(0), c(1), c(0)), false)
})
test('LOS: ignoreCell deixa ver a porta da saída (célula sólida)', () => {
  const p = new Player(lvl())
  const exitIdx = 4 * 5 + 4
  assert.equal(p.hasLineOfSight(c(3), c(4), c(4), c(4)), false)
  assert.equal(p.hasLineOfSight(c(3), c(4), c(4), c(4), exitIdx), true)
})
test('luz violeta: sempre em célula aberta (300 seeds)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const l = generateLevel({ seed, size: 26 }); if (!l) continue
    const [x, , z] = pickVioletPos(l, CELL)
    assert.equal(l.cells[Math.floor(z / CELL) * l.size + Math.floor(x / CELL)], OPEN, `seed ${seed}`)
  }
})
