// ACADEMIA DE GAMEPLAY — testes automáticos da planta de testes (Gameplay Gym)
// Regra do projecto: toda funcionalidade importante tem ≥1 teste de sucesso e ≥1 de falha.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGymLevel, GYM_SEED } from '../src/backrooms/levels/gym.js'
import { validateLevel, findPath, OPEN, WALL } from '../src/backrooms/engine/wfc.js'

const lvl = buildGymLevel()
const at = (x, z) => lvl.cells[z * lvl.size + x]

test('academia: planta fixa é válida e conectada (spawn→saída, chave alcançável)', () => {
  const v = validateLevel(lvl)
  assert.equal(v.ok, true, v.errors.join(', '))
})

test('academia: spawn, chave e saída existem e são células abertas', () => {
  assert.equal(at(lvl.spawn.x, lvl.spawn.z), OPEN)
  assert.equal(at(lvl.exit.x, lvl.exit.z), OPEN)
  assert.equal(at(lvl.key.x, lvl.key.z), OPEN)
  assert.equal(lvl.key === null, false)
})

test('academia: caminho spawn→saída existe e atravessa a sala', () => {
  const path = findPath(lvl)
  assert.ok(Array.isArray(path) && path.length > 20, 'caminho curto demais — a planta quebrou?')
  const last = path[path.length - 1]
  assert.equal(last, lvl.exit.z * lvl.size + lvl.exit.x)
})

test('academia: saída só tem UM acesso (o vão da porta) — não dá para contornar', () => {
  const { x, z } = lvl.exit
  const openN = [
    at(x + 1, z), at(x - 1, z), at(x, z + 1), at(x, z - 1),
  ].filter(c => c === OPEN)
  assert.equal(openN.length, 1, 'a saída deve ser acessível só pelo vão leste')
})

test('academia: muro em U do ôco B tem boca apenas a sul', () => {
  // braços do U: colunas x=20 e x=23 em z=2..4, viga em z=2
  for (let z = 2; z <= 4; z++) {
    assert.equal(at(20, z), WALL, `braço esq. z=${z}`)
    assert.equal(at(23, z), WALL, `braço dir. z=${z}`)
  }
  assert.equal(at(22, 2), WALL, 'viga do U')
  assert.equal(at(21, 5), OPEN, 'a boca a sul deve estar aberta')
})

test('academia: pilares são células ABERTAS (obstáculo físico, não parede)', () => {
  assert.ok(lvl.pillars >= 3)
  for (const i of lvl.pillarCells) assert.equal(lvl.cells[i], OPEN)
})

test('academia: determinística — duas construções são idênticas', () => {
  const a = buildGymLevel(), b = buildGymLevel()
  assert.deepEqual([...a.cells], [...b.cells])
  assert.equal(a.seed, GYM_SEED)
  assert.equal(b.seed, GYM_SEED)
})

// ── TESTE DE FALHA — a academia apanha plantas partidas? ─────────────────────
test('falha esperada: validador rejeita academia partida (spawn em parede)', () => {
  const broken = buildGymLevel()
  broken.cells[broken.spawn.z * broken.size + broken.spawn.x] = WALL
  const v = validateLevel(broken)
  assert.equal(v.ok, false)
  assert.ok(v.errors.length >= 1)
})
