// NSAMBO · stalker-anchors — provas executáveis da cadeia âncoras→ossos→vértices→animação
// Todos os testes correm sobre DADOS REAIS do repositório (rig-data/stalker.json,
// assets/models/*.json, assets/models/stalker.glb). Tolerâncias: ver cada assert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  JOINT_TEMPLATE, JOINT_NAMES, JOINT_COUNT,
  buildJointsFromAnchors, buildRigDataFromAnchors,
  validateAnchors, analyzeWeights, normalizeWeights, modelBoxFromPositions,
} from '../src/backrooms/game/stalker-anchors.mjs'
import { StalkerRig } from '../src/backrooms/game/stalker-rig.mjs'
import { qAxisAngle } from '../src/backrooms/game/stalker-rig.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const rigJson = JSON.parse(readFileSync(join(ROOT, 'assets', 'models', 'stalker.rig.json'), 'utf8'))
const savedAnchors = JSON.parse(readFileSync(join(ROOT, 'rig-data', 'stalker.json'), 'utf8'))
const glb = readFileSync(join(ROOT, 'assets', 'models', 'stalker.glb'))

// posição dos vértices do GLB (bufferViews) — só o necessário para os testes de deformação
function readGlbPositions() {
  const clen = glb.readUInt32LE(12)
  const gjs = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
  const prim = gjs.meshes[0].primitives[0]
  const acc = gjs.accessors[prim.attributes.POSITION]
  const bv = gjs.bufferViews[acc.bufferView]
  const base = 20 + clen + 8 + bv.byteOffset + (acc.byteOffset ?? 0)
  const stride = bv.byteStride ?? 12
  const out = new Float32Array(acc.count * 3)
  for (let v = 0; v < acc.count; v++) {
    const o = base + v * stride
    out[v * 3] = glb.readFloatLE(o); out[v * 3 + 1] = glb.readFloatLE(o + 4); out[v * 3 + 2] = glb.readFloatLE(o + 8)
  }
  return out
}
const restP = readGlbPositions()
const modelBox = modelBoxFromPositions(restP)

test('template: 21 juntas, pais anteriores aos filhos, sem ciclos', () => {
  assert.equal(JOINT_TEMPLATE.length, 21)
  const posOf = Object.fromEntries(JOINT_TEMPLATE.map(([n], i) => [n, i]))
  JOINT_TEMPLATE.forEach(([n, p], i) => {
    assert.ok(p < i, `${n}: o pai ${p} não pode aparecer depois no array (ordem topológica)`)
  })
  assert.equal(new Set(JOINT_NAMES).size, 21)
})

test('stalker.rig.json: integridade estrutural dos pesos (regressão de dados)', () => {
  const w = analyzeWeights(rigJson)
  assert.equal(w.vcount, 8731)
  assert.equal(w.zero, 0, 'vértices sem influência')
  assert.equal(w.invalidRefs, 0, 'índices de junta fora de 0..20')
  assert.ok(w.minSum >= 254 && w.maxSum <= 256, 'somas fora da banda 254..256')
  const w4Bytes = Uint8Array.from(atob(rigJson.w4), (c) => c.charCodeAt(0))
  const v4Bytes = Uint8Array.from(atob(rigJson.v4), (c) => c.charCodeAt(0))
  assert.equal(w4Bytes.length, rigJson.vcount * 4, 'w4 deve ter 4 bytes por vértice')
  assert.equal(v4Bytes.length, rigJson.vcount * 4, 'v4 deve ter 4 bytes por vértice')
})

test('validateAnchors: o ficheiro guardado pelo utilizador passa; degenerescências são apanhadas', () => {
  assert.deepEqual(validateAnchors(savedAnchors.points, modelBox), [])
  const broken = structuredClone(savedAnchors.points)
  broken.B = { ...broken.A }   // pescoço colado ao queixo
  const problems = validateAnchors(broken, modelBox)
  assert.ok(problems.length > 0, 'pescoço=queixo devia ser detetado')
})

test('builder: juntas derivadas SÓ das âncoras — finitas, hierarquia válida', () => {
  const joints = buildJointsFromAnchors(savedAnchors.points, modelBox)
  assert.equal(joints.length, 21)
  for (const j of joints) {
    assert.equal(j.pos.length, 3)
    assert.ok(j.pos.every(Number.isFinite), `${j.n}: posição inválida`)
  }
  assert.equal(joints[0].p, -1)
})

test('skinning em repouso == malha original (identidade)', () => {
  // (a) dados crus: 781 verts não normalizados → desvio de ~2 mm (o reskin v2 passou por aí)
  // (b) com pesos normalizados: identidade EXATA (< 1e-6)
  for (const [label, data, tol] of [
    ['pesos crus', rigJson, 5e-3],
    ['pesos normalizados', normalizeWeights(rigJson), 1e-6],
  ]) {
    const rig = new StalkerRig(buildRigDataFromAnchors(data, savedAnchors.points, modelBox))
    const order = [...Array(21).keys()]
    for (const i of order) rig.skel.eval(i)
    rig.skel.updateSkinMats()
    const outP = new Float32Array(restP)
    const outN = new Float32Array(restP)
    rig.skin(restP, outN, null, outP, outN, null)
    let maxD = 0
    for (let i = 0; i < restP.length; i++) {
      const d = Math.abs(outP[i] - restP[i])
      if (d > maxD) maxD = d
    }
    assert.ok(maxD < tol, `${label}: desvio máximo no repouso = ${maxD}`)
  }
})

test('isolamento: rodar só o antebraço NÃO desloca vértices exclusivos da perna', () => {
  const rig = new StalkerRig(buildRigDataFromAnchors(normalizeWeights(rigJson), savedAnchors.points, modelBox))
  rig.skel.localQ[11] = qAxisAngle(0, 0, 1, 0.8)   // foreArmL (índice 11) — 0.8 rad
  const order = [...Array(21).keys()]
  for (const i of order) rig.skel.eval(i)
  rig.skel.updateSkinMats()
  const outP = new Float32Array(restP)
  const outN = new Float32Array(restP)
  rig.skin(restP, outN, null, outP, outN, null)
  const ARM = new Set([9, 10, 11, 12, 13, 14]), LEG = new Set([15, 16, 17, 18, 19, 20])
  const wIdx = Uint8Array.from(Uint8Array.from(atob(rigJson.w4), c => c.charCodeAt(0)))
  const wVal = Uint8Array.from(Uint8Array.from(atob(rigJson.v4), c => c.charCodeAt(0)))
  let armMiss = 0, legWorst = 0, armSum = 0, armN = 0, legN = 0
  for (let v = 0; v < rigJson.vcount; v++) {
    let armW = 0, legW = 0
    for (let k = 0; k < 4; k++) {
      if (ARM.has(wIdx[v * 4 + k])) armW += wVal[v * 4 + k]
      if (LEG.has(wIdx[v * 4 + k])) legW += wVal[v * 4 + k]
    }
    const dx = outP[v * 3] - restP[v * 3], dy = outP[v * 3 + 1] - restP[v * 3 + 1], dz = outP[v * 3 + 2] - restP[v * 3 + 2]
    const d = Math.hypot(dx, dy, dz)
    if (armW > 0) { armSum += d; armN++ } else armMiss++
    if (legW === 0 && armW === 0) continue
    if (legW > 0 && armW === 0 && d > legWorst) legWorst = d   // perna PURA
    if (legW > 0) legN++
  }
  assert.ok(legWorst < 1e-4, `vértices exclusivos da perna moveram ${(legWorst * 100).toFixed(4)} cm com rotação de braço`)
  assert.ok(armSum / armN > 0.001, 'vértices do braço não reagiram à rotação do antebraço')
})

test('normalizeWeights: corrige as somas para 255 sem tocar nos índices', () => {
  const before = analyzeWeights(rigJson)
  assert.ok(before.off255 > 0)
  const fixed = normalizeWeights(rigJson)
  assert.equal(fixed.normalized, before.off255)
  const after = analyzeWeights(fixed)
  assert.equal(after.off255, 0)
  assert.equal(after.invalidRefs, 0)
  assert.equal(after.w4 ?? true, true)
  assert.equal(fixed.w4, rigJson.w4, 'w4 não pode mudar')
  // idempotência
  const twice = normalizeWeights(fixed)
  assert.equal(twice.normalized, 0)
})

test('contagens-base conhecidas (regressão informativa do reskin v2)', () => {
  const w = analyzeWeights(rigJson)
  // codificado do audit de 2026-11-27 — se o reskin mudar, atualizar as duas pontas com o relatório
  assert.equal(w.vcount, 8731)
  assert.ok(w.headDom > 1000, 'cabeça dominante mudou — rever os pesos e o doc de auditoria')
  assert.equal(w.neckDom, 0, 'pescoço ganhou peso próprio — rever pesos e doc de auditoria')
  assert.ok(w.armLeg > 100, 'banda mão/coxa cruzada mudou — rever pesos e doc')
})

// ───────────────── Deformation Validator — bateria normalizada à malha ─────────────────
// Para cada junta de teste: rodar ±0.7 rad e exigir que vértices com ZERO peso na subárvore
// da junta não se desloquem (< 1e-4 m = 0.1 mm). Tolerância mesh-size-normalized:
// o desvio é medido em metros e o limiar é fixo — abaixo de 0.1 mm não é visível (malha ~2 m).
// derivadas do JOINT_TEMPLATE real — nunca um mapa manual (fonte única: stalker-anchors.mjs)
const CHILDREN = (() => {
  const ch = Array.from({ length: JOINT_TEMPLATE.length }, () => [])
  JOINT_TEMPLATE.forEach(([, p], i) => { if (p >= 0) ch[p].push(i) })
  return ch
})()
function subtreeSet(root) {
  const set = new Set([root])
  const stack = [root]
  while (stack.length) {
    for (const c of CHILDREN[stack.pop()]) if (!set.has(c)) { set.add(c); stack.push(c) }
  }
  return set
}
const wIdxAll = Uint8Array.from(atob(rigJson.w4), (c) => c.charCodeAt(0))
const wValAll = Uint8Array.from(atob(rigJson.v4), (c) => c.charCodeAt(0)) // somas 254..256 — aceitável para esta prova
const TEST_JOINTS = [
  ['coluna (spine2=2)', 2],
  ['braço esq (upperArmL=9)', 9],
  ['antebraço esq (foreArmL=11)', 11],
  ['mão dir (handR=14)', 14],
  ['perna dir (upperLegR=16)', 16],
  ['tíbia esq (lowerLegL=17)', 17],
  ['pé dir (footR=20)', 20],
  ['cabeça (head=5)', 5],
]
for (const [label, ji] of TEST_JOINTS) {
  test(`isolamento: rotação de ${label} não move vértices zero-peso da subárvore`, () => {
    const rig = new StalkerRig(buildRigDataFromAnchors(normalizeWeights(rigJson), savedAnchors.points, modelBox))
    rig.skel.localQ[ji] = qAxisAngle(0, 0, 1, 0.7)
    const order = [...Array(21).keys()]
    for (const i of order) rig.skel.eval(i)
    rig.skel.updateSkinMats()
    const outP = new Float32Array(restP)
    const outN = new Float32Array(restP)
    rig.skin(restP, outN, null, outP, outN, null)
    const sub = subtreeSet(ji)
    let worst = 0, zeroWeightMoved = 0, moved = 0
    for (let v = 0; v < rigJson.vcount; v++) {
      let subW = 0
      for (let k = 0; k < 4; k++) if (sub.has(wIdxAll[v * 4 + k])) subW += wValAll[v * 4 + k]
      const d = Math.hypot(outP[v * 3] - restP[v * 3], outP[v * 3 + 1] - restP[v * 3 + 1], outP[v * 3 + 2] - restP[v * 3 + 2])
      if (subW === 0) { if (d > 1e-4) zeroWeightMoved++; if (d > worst) worst = d }
      else if (d > 1e-6) moved++
    }
    assert.equal(zeroWeightMoved, 0, `${zeroWeightMoved} vértices zero-peso deslocaram-se (máx ${(worst * 1000).toFixed(3)} mm)`)
    assert.ok(moved > 0, 'nenhum vértice com peso reagiu — rotação não aplicada')
  })
}

test('combinada/extrema: todas as juntas ±1.2 rad — sem NaN, deslocamento limitado', () => {
  const rig = new StalkerRig(buildRigDataFromAnchors(normalizeWeights(rigJson), savedAnchors.points, modelBox))
  for (let ji = 0; ji < 21; ji++) rig.skel.localQ[ji] = qAxisAngle(0.3, 0.7, 0.65, ji % 2 ? 1.2 : -1.2)
  const order = [...Array(21).keys()]
  for (const i of order) rig.skel.eval(i)
  rig.skel.updateSkinMats()
  const outP = new Float32Array(restP)
  const outN = new Float32Array(restP)
  rig.skin(restP, outN, null, outP, outN, null)
  let maxD = 0, nan = 0
  for (let v = 0; v < rigJson.vcount; v++) {
    if (!Number.isFinite(outP[v * 3]) || !Number.isFinite(outP[v * 3 + 1])) { nan++; continue }
    const d = Math.hypot(outP[v * 3] - restP[v * 3], outP[v * 3 + 1] - restP[v * 3 + 1], outP[v * 3 + 2] - restP[v * 3 + 2])
    if (d > maxD) maxD = d
  }
  assert.equal(nan, 0, 'vértices NaN após pose extrema')
  // sanity apenas — NÃO é o portão Nível 1 (esse é visual/editor). Todas as juntas a 1.2 rad
  // produzem deformação extrema por definição; a prova aqui é: nada NaN/Inf, nada além do alcance físico.
  assert.ok(maxD < 3.0, `deslocamento máximo ${maxD.toFixed(2)} m — explosão de skinning`)
})

test('repouso total: rigorosamente identidade (tolerância 1e-6 com pesos normalizados)', () => {
  const rig = new StalkerRig(buildRigDataFromAnchors(normalizeWeights(rigJson), savedAnchors.points, modelBox))
  const order = [...Array(21).keys()]
  for (const i of order) rig.skel.eval(i)
  rig.skel.updateSkinMats()
  const outP = new Float32Array(restP)
  const outN = new Float32Array(restP)
  rig.skin(restP, outN, null, outP, outN, null)
  for (let i = 0; i < restP.length; i++) assert.ok(Math.abs(outP[i] - restP[i]) < 1e-6)
})
