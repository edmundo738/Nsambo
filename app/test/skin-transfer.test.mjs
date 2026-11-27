// Auto-skin por distância inversa — provas de integridade de dados (NÃO de qualidade visual)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoSkinWeights } from '../src/rig-align/skin-transfer.mjs'
import { buildRigDataFromAnchors, modelBoxFromPositions, normalizeWeights } from '../src/backrooms/game/stalker-anchors.mjs'
import { humanoidTemplate, toEngineJoints } from '../src/rig-align/skeleton-schema.mjs'
import { buildSkinnedGLB } from '../src/rig-align/glb-export.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const glbSrc = readFileSync(join(ROOT, 'assets', 'models', 'stalker.glb'))
const rigRaw = JSON.parse(readFileSync(join(ROOT, 'assets', 'models', 'stalker.rig.json'), 'utf8'))
const anchors = JSON.parse(readFileSync(join(ROOT, 'rig-data', 'stalker.json'), 'utf8'))

const clen = glbSrc.readUInt32LE(12)
const srcJson = JSON.parse(glbSrc.subarray(20, 20 + clen).toString('utf8'))
const prim = srcJson.meshes[0].primitives[0]
const acc = srcJson.accessors[prim.attributes.POSITION]
const bv = srcJson.bufferViews[acc.bufferView]
let bOff = 20 + clen, bin = null
while (bOff < glbSrc.length) { const len = glbSrc.readUInt32LE(bOff), t = glbSrc.readUInt32LE(bOff + 4); if (t === 0x004e4942) bin = glbSrc.subarray(bOff + 8, bOff + 8 + len); bOff += 8 + len }
const restP = new Float32Array(acc.count * 3)
const pBase = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
for (let v = 0; v < acc.count; v++) { const o = pBase + v * (bv.byteStride ?? 12); restP[v*3] = glbSrc.readFloatLE(o); restP[v*3+1] = glbSrc.readFloatLE(o+4); restP[v*3+2] = glbSrc.readFloatLE(o+8) }
const modelBox = modelBoxFromPositions(restP)
// juntas reais do stalker a partir das âncoras (mesma moldura — obrigatório)
const gameJoints = buildRigDataFromAnchors(normalizeWeights(rigRaw), anchors.points ?? anchors, modelBox).joints

test('sintético: vértice sobre a junta → 100% nessa junta', () => {
  const p = new Float32Array([1, 1, 1])
  const j = [{ pos: [1, 1, 1] }, { pos: [5, 5, 5] }, { pos: [9, 9, 9] }]
  const out = autoSkinWeights(p, j, { k: 2 })
  const idx = Uint8Array.from(atob(out.w4), c => c.charCodeAt(0))
  const val = Uint8Array.from(atob(out.v4), c => c.charCodeAt(0))
  assert.equal(idx[0], 0)
  assert.equal(val[0], 255)
  assert.equal(val[1] + val[2] + val[3], 0)
})

test('sintético: equidistante às duas juntas → 128/127', () => {
  const p = new Float32Array([0, 0, 0])
  const j = [{ pos: [-1, 0, 0] }, { pos: [1, 0, 0] }]
  const out = autoSkinWeights(p, j, { k: 2 })
  const val = Uint8Array.from(atob(out.v4), c => c.charCodeAt(0))
  assert.equal(val[0] + val[1], 255)
  assert.ok(Math.abs(val[0] - val[1]) <= 1)
})

test('stalker real: 8731 vértices, somas EXATAMENTE 255, índices < 21', () => {
  const out = autoSkinWeights(restP, gameJoints)
  assert.equal(out.vcount, 8731)
  const idx = Uint8Array.from(atob(out.w4), c => c.charCodeAt(0))
  const val = Uint8Array.from(atob(out.v4), c => c.charCodeAt(0))
  for (let v = 0; v < 8731; v++) {
    const s = val[v*4] + val[v*4+1] + val[v*4+2] + val[v*4+3]
    assert.equal(s, 255, `vértice ${v}`)
    for (let k = 0; k < 4; k++) assert.ok(idx[v*4+k] < 21)
  }
})

test('v2 humanoide (99 juntas) → GLB skinned round-trip estrutural', () => {
  const t = humanoidTemplate()
  const v2Joints = toEngineJoints(t)
  const auto = autoSkinWeights(restP, v2Joints)
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson: auto, joints: v2Joints })
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength)
  assert.equal(dv.getUint32(0, true), 0x46546c67)
  // parse mínimo
  let off = 12, json = null
  while (off < out.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(out.subarray(off + 8, off + 8 + len)))
    off += 8 + len
  }
  assert.equal(json.skins[0].joints.length, 99)
  assert.equal(json.nodes.length, 100) // 99 juntas + nó da malha
  assert.equal(json.skins[0].inverseBindMatrices != null, true)
  const prim = json.meshes[0].primitives[0]
  assert.equal(json.accessors[prim.attributes.JOINTS_0].count, 8731)
  assert.equal(json.accessors[prim.attributes.WEIGHTS_0].count, 8731)
  // índices de junta ≤ 98
  const maxJ = Math.max(...json.skins[0].joints)
  assert.equal(maxJ, 98)
  // a hierarquia reconstrói a bind pose do template (soma de translações locais = posição da junta)
  const world = new Map()
  const walk = (i, parentPos) => {
    const n = json.nodes[i]
    const t = n.translation ?? [0, 0, 0]
    const w = parentPos ? [parentPos[0]+t[0], parentPos[1]+t[1], parentPos[2]+t[2]] : [...t]
    world.set(i, w)
    for (const c of n.children ?? []) walk(c, w)
  }
  walk(0, null)
  v2Joints.forEach((j, i) => {
    const w = world.get(i)
    assert.ok(w, `junta ${i} inacessível`)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(w[k] - j.pos[k]) < 1e-6, `${j.n} eixo ${k}`)
  })
})

test('determinismo: mesma entrada → bytes idênticos', () => {
  const a = autoSkinWeights(restP, gameJoints)
  const b = autoSkinWeights(restP, gameJoints)
  assert.equal(a.w4, b.w4)
  assert.equal(a.v4, b.v4)
})
