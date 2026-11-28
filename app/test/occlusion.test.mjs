// Testes da consulta ÚNICA de oclusão (Fase 1 da auditoria 2026-11-27):
// jogador, Stalker, faca e interações passaram a partilhar estas regras.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { losClearXZ, rayBlocked, resolveCircleBoxes, makeSealedSet, EDGE_KEY } from '../src/backrooms/game/occlusion.mjs'
import { StalkerBrain, bfsNextStep } from '../src/backrooms/game/stalker-ai.mjs'
import { CELL } from '../src/backrooms/engine/scene.js'

const SIZE = 5
const OPEN = 1
// grelha 5×5 toda aberta
const openGrid = () => new Array(SIZE * SIZE).fill(OPEN)
// célula sólida no centro
const withWall = () => { const c = openGrid(); c[2 * SIZE + 2] = 0; return c }
const ctx = (cells, sealed = []) => ({ cells, size: SIZE, sealed: makeSealedSet(sealed) })
const posOf = (i) => [(i % SIZE + 0.5) * CELL, (Math.floor(i / SIZE) + 0.5) * CELL]

test('LOS: grelha aberta atravessa livre', () => {
  const c = ctx(openGrid())
  const [x0, z0] = posOf(0), [x1, z1] = posOf(24)
  assert.equal(losClearXZ(c, x0, z0, x1, z1), true)
})

test('LOS: célula sólida bloqueia (a meia distância do centro)', () => {
  const c = ctx(withWall())
  const [x0, z0] = posOf(2 * SIZE), [x1, z1] = posOf(2 * SIZE + 4)   // linha recta sobre o centro (2,2) sólido
  assert.equal(losClearXZ(c, x0, z0, x1, z1), false)
})

test('LOS: divisória selada bloqueia mesmo com as duas células abertas', () => {
  const cells = openGrid()
  const left = 2 * SIZE + 1, right = 2 * SIZE + 2   // aresta vertical entre (2,1) e (2,2)
  const c = ctx(cells, [[left, right]])
  const [x0, z0] = posOf(2 * SIZE + 0), [x1, z1] = posOf(2 * SIZE + 3)
  assert.equal(losClearXZ(c, x0, z0, x1, z1), false)
})

test('LOS: aresta selada horizontal também bloqueia', () => {
  const cells = openGrid()
  const top = 1 * SIZE + 2, bottom = 2 * SIZE + 2   // aresta horizontal entre (1,2) e (2,2)
  const c = ctx(cells, [[top, bottom]])
  assert.equal(losClearXZ(c, ...posOf(0 * SIZE + 2), ...posOf(4 * SIZE + 2)), false)
})

test('LOS: ignoreCell permite atravessar a célula indicada', () => {
  const cells = withWall()
  const c = ctx(cells)
  const [x0, z0] = posOf(2 * SIZE), [x1, z1] = posOf(2 * SIZE + 4)
  assert.equal(losClearXZ(c, x0, z0, x1, z1, { ignoreCell: 2 * SIZE + 2 }), true)
})

test('LOS: forcedSolid (porta fechada) bloqueia célula aberta', () => {
  const cells = openGrid()
  const forced = new Set([2 * SIZE + 2])
  const c = { cells, size: SIZE, sealed: makeSealedSet([]), forcedSolid: forced }
  assert.equal(losClearXZ(c, ...posOf(2 * SIZE), ...posOf(2 * SIZE + 4)), false)
  // e o ignoreCell ganha prioridade sobre o forcedSolid
  assert.equal(losClearXZ(c, ...posOf(2 * SIZE), ...posOf(2 * SIZE + 4), { ignoreCell: 2 * SIZE + 2 }), true)
})

test('rayBlocked: parede sólida à frente bloqueia o raio da faca', () => {
  const c = ctx(withWall())
  const [ex, ez] = posOf(2 * SIZE)
  // mirar exactamente para o centro sólido (2,2)
  const [tx, tz] = posOf(2 * SIZE + 2)
  const dx = tx - ex, dz = tz - ez, len = Math.hypot(dx, dz)
  assert.equal(rayBlocked(c, [ex, 1.6, ez], [dx / len, 0, dz / len], len + 0.5), true)
})

test('rayBlocked: raio livre em grelha aberta não bloqueia', () => {
  const c = ctx(openGrid())
  const [ex, ez] = posOf(0)
  assert.equal(rayBlocked(c, [ex, 1.6, ez], [0, 0, -1], 1.0), false)
})

test('rayBlocked: cruzar divisória selada bloqueia (caso que a faca não via)', () => {
  const cells = openGrid()
  const a = 2 * SIZE + 1, b = 2 * SIZE + 2
  const c = ctx(cells, [[a, b]])
  const [ex, ez] = posOf(2 * SIZE + 0)
  assert.equal(rayBlocked(c, [ex, 1.6, ez], [1, 0, 0], 9.0), true)
})

test('resolveCircleBoxes: empurra o círculo para fora da caixa', () => {
  const r = 0.34
  // círculo centrado no pilar (pior caso — centro dentro da caixa) → empurrado para a face mais próxima, a exactamente r de distância
  const [x, z] = resolveCircleBoxes(1.5, 1.5, r, [[1.2, 1.2, 1.8, 1.8]])
  const cdx = Math.max(1.2 - x, 0, x - 1.8), cdz = Math.max(1.2 - z, 0, z - 1.8)
  assert.ok(Math.abs(Math.hypot(cdx, cdz) - r) < 1e-9, `distância ao pilar = ${Math.hypot(cdx, cdz)}`)
  // círculo ao lado do pilar — sai tangencialmente
  const [x2, z2] = resolveCircleBoxes(1.1, 1.5, r, [[1.2, 1.2, 1.8, 1.8]])
  assert.ok(Math.abs(x2 - 1.2) >= r - 1e-9 || x2 <= 1.2 + 1e-9)
})

test('BFS contorna pilares: nunca devolve a célula-pilar como próximo passo quando há alternativa', () => {
  const cells = openGrid()
  const pillar = 2 * SIZE + 2   // centro
  const pillarSet = new Set([pillar])
  const next = bfsNextStep(cells, SIZE, 2 * SIZE + 0, 2 * SIZE + 4, makeSealedSet([]), pillarSet)
  assert.notEqual(next, pillar)
  assert.ok(next >= 0)
  // seguir o caminho inteiro — nunca pisa o pilar
  let cur = 2 * SIZE + 0
  const target = 2 * SIZE + 4
  for (let i = 0; i < 64 && cur !== target; i++) {
    cur = bfsNextStep(cells, SIZE, cur, target, makeSealedSet([]), pillarSet)
    assert.notEqual(cur, pillar)
  }
  assert.equal(cur, target)
})

test('BFS: sem pillarSet mantém comportamento anterior', () => {
  const cells = openGrid()
  const next = bfsNextStep(cells, SIZE, 2 * SIZE + 0, 2 * SIZE + 4, makeSealedSet([]))
  assert.equal(next, 2 * SIZE + 1)   // caminho recto 10→11→12… quando pilares não são conhecidos
  let cur = 2 * SIZE + 0
  const target = 2 * SIZE + 4
  const path = [cur]
  for (let i = 0; i < 64 && cur !== target; i++) {
    cur = bfsNextStep(cells, SIZE, cur, target, makeSealedSet([]))
    path.push(cur)
  }
  assert.ok(path.includes(2 * SIZE + 2), 'sem pillarSet o caminho recto pisa o pilar (comportamento anterior)')
})

test('Stalker: visão atravessada por divisória selada é NÃO ver (audição idem)', () => {
  const cells = openGrid()
  const left = 2 * SIZE + 1, right = 2 * SIZE + 2
  const brain = new StalkerBrain({ cells, size: SIZE, sealedEdges: [[left, right]], seed: 7, startIdx: 2 * SIZE + 1 })
  const [sx, sz] = posOf(2 * SIZE + 1), [px, pz] = posOf(2 * SIZE + 3)
  brain.x = sx; brain.z = sz
  assert.equal(brain._losClear(sx, sz, px, pz), false)
  // sem a divisória, vê
  const brain2 = new StalkerBrain({ cells, size: SIZE, sealedEdges: [], seed: 7, startIdx: 2 * SIZE + 1 })
  assert.equal(brain2._losClear(sx, sz, px, pz), true)
})

test('Stalker: nunca ocupa a caixa do pilar durante a perseguição', () => {
  const cells = openGrid()
  const pillar = 2 * SIZE + 2
  const [px, pz] = posOf(pillar)   // pilar no CENTRO (1.5 na célula 2,2 em coords locais de célula)
  const brain = new StalkerBrain({ cells, size: SIZE, sealedEdges: [], seed: 3, startIdx: 2 * SIZE + 0, pillarCells: [pillar] })
  // força-o a perseguir através do pilar: jogador directamente atrás do pilar
  const [tx, tz] = posOf(2 * SIZE + 4)
  // direção directa passa pelo pilar
  for (let step = 0; step < 400; step++) {
    brain.update({ dt: 0.1, px: tx, pz: tz, py: 1.62, noise: 0.8, time: step * 0.1, crouch: false })
    const dx = Math.max(Math.abs(brain.x - px) - 0.175, 0)
    const dz = Math.max(Math.abs(brain.z - pz) - 0.175, 0)
    assert.ok(Math.hypot(dx, dz) >= 0.34 - 1e-6, `stalker dentro do pilar no passo ${step}`)
  }
})

test('Stalker: construtor sem pillarCells mantém compatibilidade (testes antigos)', () => {
  const cells = openGrid()
  const brain = new StalkerBrain({ cells, size: SIZE, sealedEdges: [], seed: 1, startIdx: 0 })
  assert.equal(brain.pillarBoxes.length, 0)
  const [x0, z0] = posOf(0)
  assert.equal(brain._losClear(x0, z0, ...posOf(24)), true)
})

test('EDGE_KEY: simétrica e independente da ordem', () => {
  assert.equal(EDGE_KEY(5, 17), EDGE_KEY(17, 5))
})
