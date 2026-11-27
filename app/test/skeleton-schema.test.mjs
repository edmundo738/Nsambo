// NSAMBO · skeleton-schema — provas do schema nsambo-rig-align@2
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SCHEMA_V2, JOINT_CATEGORIES,
  humanoidTemplate, emptySkeleton, fromGameJointTemplate, fromV1,
  validateSkeleton, skeletonStats, toEngineJoints,
} from '../src/rig-align/skeleton-schema.mjs'
import { JOINT_TEMPLATE } from '../src/backrooms/game/stalker-anchors.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('template humanoide: 99 juntas, válido, categorias todas usadas', () => {
  const t = humanoidTemplate()
  assert.equal(t.schema, SCHEMA_V2)
  assert.equal(t.joints.length, 99)
  const v = validateSkeleton(t)
  assert.deepEqual(v.errors, [])
  const cats = new Set(t.joints.map(j => j.category))
  for (const c of JOINT_CATEGORIES) assert.ok(cats.has(c), `categoria ${c} em falta no template`)
  const st = skeletonStats(t)
  assert.ok(st.maxDepth >= 10, 'hierarquia profunda o suficiente para dedos')
  assert.equal(st.total, 99)
})

test('template humanoide: simetria L/R completa (nenhuma junta _L sem _R e vice-versa)', () => {
  const ids = new Set(humanoidTemplate().joints.map(j => j.id))
  for (const id of [...ids]) {
    if (id.endsWith('_L')) assert.ok(ids.has(id.slice(0, -2) + '_R'), `${id} sem par`)
    if (id.endsWith('_R')) assert.ok(ids.has(id.slice(0, -2) + '_L'), `${id} sem par`)
  }
})

test('validateSkeleton apanha: id duplicado, pai inexistente, ciclo, categoria desconhecida', () => {
  const t = humanoidTemplate()
  const dup = structuredClone(t); dup.joints[1] = { ...dup.joints[1], id: 'root' }
  assert.ok(validateSkeleton(dup).errors.some(e => e.includes('duplicado')))
  const orphan = structuredClone(t); orphan.joints[1] = { ...orphan.joints[1], parent: 'nao_existe' }
  assert.ok(validateSkeleton(orphan).errors.some(e => e.includes('não existe')))
  const cycle = structuredClone(t)
  cycle.joints[0] = { ...cycle.joints[0], parent: 'spine_01' } // root ← spine_01 → pelvis → root
  assert.ok(validateSkeleton(cycle).errors.length > 0)
  const cat = structuredClone(t); cat.joints[1] = { ...cat.joints[1], category: 'osso-magico' }
  assert.ok(validateSkeleton(cat).errors.some(e => e.includes('categoria')))
})

test('validateSkeleton: facial-controller não pode ser pai de skeletal', () => {
  const t = humanoidTemplate()
  const bad = structuredClone(t)
  const brow = bad.joints.find(j => j.id === 'brow_L')
  assert.equal(brow.category, 'facial-controller')
  bad.joints.find(j => j.id === 'eye_L').parent = 'brow_L'  // eye_L é anatomical-reference (válido) — testar o caso skeletal:
  const eyeSkew = structuredClone(t)
  eyeSkew.joints.find(j => j.id === 'spine_01').parent = 'brow_L'
  const v = validateSkeleton(eyeSkew)
  assert.ok(v.errors.some(e => e.includes('facial-controller')), JSON.stringify(v.errors))
})

test('migração v1 → v2: preserva hierarquia e nº de juntas do esqueleto do jogo', () => {
  const rig = JSON.parse(readFileSync(join(ROOT, 'assets', 'models', 'stalker.rig.json'), 'utf8'))
  const v1 = { ...rig, joints: rig.joints.map(j => ({ n: j.n, p: j.p, pos: j.pos })) }
  const v2 = fromV1(v1)
  assert.equal(v2.schema, SCHEMA_V2)
  assert.equal(v2.joints.length, 21)
  assert.deepEqual(validateSkeleton(v2).errors, [])
  const eng = toEngineJoints(v2)
  assert.equal(eng.length, 21)
  assert.equal(eng[0].p, -1)
  for (const [i, j] of eng.entries()) {
    assert.equal(j.n, v1.joints[i].n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())
    assert.equal(j.p, v1.joints[i].p)
  }
})

test('fromGameJointTemplate: 21 juntas do jogo viram v2 skeletal preservando hierarquia', () => {
  const v2 = fromGameJointTemplate(JOINT_TEMPLATE)
  assert.equal(v2.joints.length, 21)
  assert.ok(v2.joints.every(j => j.category === 'skeletal'))
  assert.deepEqual(validateSkeleton(v2).errors, [])
})

test('toEngineJoints: ordem topológica — pais antes dos filhos (alimenta StalkerRig/export)', () => {
  const t = humanoidTemplate()
  const eng = toEngineJoints(t)
  const idx = new Map(eng.map((j, i) => [j.n, i]))
  for (const j of eng) if (j.p >= 0) assert.ok(j.p < idx.get(j.n), `${j.n}: pai depois do filho`)
})

test('esqueleto vazio é válido por construção (raíz única)', () => {
  const e = emptySkeleton()
  assert.equal(e.joints.length, 1)
  assert.deepEqual(validateSkeleton(e).errors, [])
})

test('extensibilidade não-humana: cauda de 4 juntas (skeletal) valida e atravessa o export', () => {
  const s = emptySkeleton()
  s.joints[0] = { id: 'root', name: 'Root', parent: null, category: 'skeletal', pos: [0, 0, 0], note: null }
  let parent = 'root'
  for (let i = 1; i <= 4; i++) {
    const id = `tail_0${i}`
    s.joints.push({ id, name: `Tail ${i}`, parent, category: 'skeletal', pos: [0, 0.9 - i * 0.18, -0.15 - i * 0.16], note: null })
    parent = id
  }
  assert.equal(s.joints.length, 5)
  const v = validateSkeleton(s)
  assert.deepEqual(v.errors, [])
  const eng = toEngineJoints(s)
  assert.equal(eng.length, 5)
  assert.equal(eng[4].n, 'tail_04')
  assert.equal(eng[4].p, 3)  // tail_03
})
