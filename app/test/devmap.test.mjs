// GALERIA DEV — testes automáticos do mapa de ativos (todos os modelos do jogo)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDevMapLevel, DEVMAP_SEED } from '../src/backrooms/levels/devmap.js'
import { validateLevel, findPath, OPEN, WALL } from '../src/backrooms/engine/wfc.js'

const lvl = buildDevMapLevel()
const at = (x, z) => lvl.cells[z * lvl.size + x]

test('galeria: planta válida e conectada (spawn→saída, chave alcançável)', () => {
  const v = validateLevel(lvl)
  assert.equal(v.ok, true, v.errors.join(', '))
})

test('galeria: spawn, chave e saída existem e são células abertas', () => {
  assert.equal(at(lvl.spawn.x, lvl.spawn.z), OPEN)
  assert.equal(at(lvl.exit.x, lvl.exit.z), OPEN)
  assert.equal(at(lvl.key.x, lvl.key.z), OPEN)
})

test('galeria: caminho spawn→saída existe e atravessa o salão', () => {
  const path = findPath(lvl)
  assert.ok(Array.isArray(path) && path.length > 10)
  assert.equal(path[path.length - 1], lvl.exit.z * lvl.size + lvl.exit.x)
})

test('galeria: saída só tem UM acesso (o vão da porta)', () => {
  const openN = [at(25, 13), at(23, 13), at(24, 14), at(24, 12)].filter(c => c === OPEN)
  assert.equal(openN.length, 1)
})

test('galeria: salão é aberto — atravessa por qualquer direção (sem divisórias)', () => {
  for (let z = 3; z < 23; z += 5) for (let x = 3; x < 23; x += 5) {
    assert.equal(at(x, z), OPEN, `célula fechada em ${x},${z} — o salão devia ser aberto`)
  }
})

test('galeria: pilares são células abertas e há caminho contornando-os', () => {
  for (const i of lvl.pillarCells) assert.equal(lvl.cells[i], OPEN)
  const v = validateLevel(lvl)
  assert.equal(v.ok, true)
})

test('galeria: determinística — duas construções são idênticas', () => {
  const a = buildDevMapLevel(), b = buildDevMapLevel()
  assert.deepEqual([...a.cells], [...b.cells])
  assert.equal(a.seed, DEVMAP_SEED)
})
