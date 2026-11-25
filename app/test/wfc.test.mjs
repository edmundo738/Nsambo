import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateLevel, validateLevel, mulberry32, MODULES, OPEN, WALL } from '../src/backrooms/engine/wfc.js'

test('conjunto de módulos é íntegro (sockets válidos)', () => {
  assert.ok(MODULES.length >= 12, 'conjunto demasiado pequeno')
  for (const m of MODULES) assert.equal(m.ports.length, 4)
})

for (const seed of [1, 7, 42, 1337, 2024, 9001]) {
  test(`geração seed=${seed}: mapa válido e conectado`, () => {
    const lvl = generateLevel({ seed, size: 26 })
    assert.ok(lvl, `seed ${seed} não gerou nível`)
    const v = validateLevel(lvl)
    assert.equal(v.ok, true, `seed ${seed}: ${v.errors.join(', ')}`)
    assert.ok(lvl.maxDist >= 14, 'nível demasiado pequeno/curto')
  })

  test(`seed=${seed} reproduzível`, () => {
    const a = generateLevel({ seed, size: 26 })
    const b = generateLevel({ seed, size: 26 })
    assert.equal(a.seed, b.seed)
    assert.deepEqual([...a.cells], [...b.cells])
  })
}

test('fog-of-war: saída alcançável e chave antes da saída', () => {
  const lvl = generateLevel({ seed: 1337, size: 26 })
  const v = validateLevel(lvl)
  assert.ok(v.ok)
  assert.ok(lvl.key, 'nível sem chave')
})

test('validador rejeita mapa corrompido (controlo negativo)', () => {
  const lvl = generateLevel({ seed: 42, size: 26 })
  const bad = { ...lvl, cells: Uint8Array.from(lvl.cells, (c, i) => i === lvl.exit.z * lvl.size + lvl.exit.x ? 0 : c) }
  const v = validateLevel(bad)
  assert.equal(v.ok, false, 'validador falhou em rejeitar saída bloqueada')
})

test('validador rejeita spawn dentro de parede', () => {
  const lvl = generateLevel({ seed: 42, size: 26 })
  const si = lvl.spawn.z * lvl.size + lvl.spawn.x
  const badCells = Uint8Array.from(lvl.cells); badCells[si] = 0
  const v = validateLevel({ ...lvl, cells: badCells })
  assert.equal(v.ok, false)
})

test('varredura: seeds 1..48 geram níveis válidos (robustez WFC)', () => {
  const fails = []
  for (let seed = 1; seed <= 48; seed++) {
    const lvl = generateLevel({ seed, size: 26 })
    if (!lvl || !validateLevel(lvl).ok) fails.push(seed)
  }
  assert.deepEqual(fails, [], `níveis inválidos: ${fails.join(',')}`)
})

test('passe estrutural: spawn/saída/chave nunca são selados por paredes', () => {
  for (const seed of [1, 42, 1337, 2024, 9001]) {
    const lvl = generateLevel({ seed, size: 26 })
    const si = lvl.spawn.z * lvl.size + lvl.spawn.x
    const ei = lvl.exit.z * lvl.size + lvl.exit.x
    const ki = lvl.key ? lvl.key.z * lvl.size + lvl.key.x : -1
    assert.equal(lvl.cells[si], OPEN, `seed ${seed}: spawn selado`)
    assert.equal(lvl.cells[ei], OPEN, `seed ${seed}: saída selada`)
    if (ki >= 0) assert.equal(lvl.cells[ki], OPEN, `seed ${seed}: chave selada`)
    assert.ok(lvl.pillars >= 0 && Array.isArray(lvl.sealedEdges))
  }
})

test('estrutura Backrooms: nível final tem divisórias/pilares (não é vazio)', () => {
  const lvl = generateLevel({ seed: 1337, size: 26 })
  assert.ok(lvl.sealedEdges.length > 10, 'poucas divisórias — nível demasiado aberto')
  assert.ok(lvl.openCount < 676, 'nível totalmente aberto — paredes não foram erguidas')
})
