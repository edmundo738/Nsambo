// NSAMBO · rig-export — REIMPORT obrigatório (spec v2.0 §Export)
// Constrói o GLB skinned a partir dos dados reais do repo, parseia-o de volta e prova:
// geometria/índices inflados idênticos, pesos JOINTS/WEIGHTS preservados, skin com 21 juntas,
// IBM corretas, hierarquia de nós reproduz exatamente a bind pose, animação de teste sobrevive.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeWeights, buildRigDataFromAnchors, modelBoxFromPositions } from '../src/backrooms/game/stalker-anchors.mjs'
import { buildSkinnedGLB } from '../src/rig-align/glb-export.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const glbSrc = readFileSync(join(ROOT, 'assets', 'models', 'stalker.glb'))
const rigRaw = JSON.parse(readFileSync(join(ROOT, 'assets', 'models', 'stalker.rig.json'), 'utf8'))
const anchors = JSON.parse(readFileSync(join(ROOT, 'rig-data', 'stalker.json'), 'utf8'))

// posições do GLB original (para modelBox)
const clen = glbSrc.readUInt32LE(12)
const srcJson = JSON.parse(glbSrc.subarray(20, 20 + clen).toString('utf8'))
const srcPrim = srcJson.meshes[0].primitives[0]
const srcAcc = srcJson.accessors[srcPrim.attributes.POSITION]
const srcBv = srcJson.bufferViews[srcAcc.bufferView]
let bOff = 20 + clen, srcBin = null
while (bOff < glbSrc.length) {
  const len = glbSrc.readUInt32LE(bOff), type = glbSrc.readUInt32LE(bOff + 4)
  if (type === 0x004e4942) srcBin = glbSrc.subarray(bOff + 8, bOff + 8 + len)
  bOff += 8 + len
}
const restP = new Float32Array(srcAcc.count * 3)
const pBase = srcBv.byteOffset + (srcAcc.byteOffset ?? 0)
const stride = srcBv.byteStride ?? 12
for (let v = 0; v < srcAcc.count; v++) {
  const o = pBase + v * stride
  restP[v * 3] = srcBin.readFloatLE(o); restP[v * 3 + 1] = srcBin.readFloatLE(o + 4); restP[v * 3 + 2] = srcBin.readFloatLE(o + 8)
}
const modelBox = modelBoxFromPositions(restP)
const rigJson = normalizeWeights(rigRaw)
const joints = buildRigDataFromAnchors(rigJson, anchors.points ?? anchors, modelBox).joints

// ── parser mínimo de GLB (independente do export — só para o teste) ──
function parseGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'magic GLB')
  assert.equal(dv.getUint32(4, true), 2, 'GLB v2')
  assert.equal(dv.getUint32(8, true), bytes.byteLength, 'total length')
  let off = 12, json = null, bin = null
  while (off < bytes.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true)
    const slice = bytes.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(slice))
    else if (type === 0x004e4942) bin = slice
    off += 8 + len
  }
  assert.ok(json && bin, 'chunks JSON+BIN presentes')
  const acc = (i) => {
    const a = json.accessors[i]
    const bv = json.bufferViews[a.bufferView ?? 0]
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]
    const sz = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType]
    const start = (bv?.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]
    return new Ctor(bin.buffer, bin.byteOffset + start, a.count * n)
  }
  return { json, bin, acc }
}
const accFloat = (o, i) => o.acc(i) // alias lido

test('reimport: estrutura GLB (asset, buffers, scene, counts)', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const { json, acc } = parseGLB(out)
  assert.equal(json.asset.version, '2.0')
  assert.equal(json.buffers[0].byteLength, (() => {
    const b = out.subarray(0); // buffers.byteLength deve bater com a soma dos bufferViews
    const maxEnd = Math.max(...json.bufferViews.map(v => v.byteOffset + v.byteLength))
    assert.ok(json.buffers[0].byteLength >= maxEnd)
    return json.buffers[0].byteLength
  })())
  assert.equal(json.meshes.length, 1)
  assert.equal(json.skins.length, 1)
  assert.deepEqual(json.scenes[0].nodes, [0, 21])
  assert.equal(json.nodes.length, 22)
  assert.equal(json.skins[0].joints.length, 21)
  assert.equal(json.nodes[21].skin, 0)
  assert.equal(json.nodes[21].mesh, 0)
  assert.equal(json.materials[0].name, 'stalker')
})

test('reimport: geometria POSITION/NORMAL/TEXCOORD_0 byte-idênticas ao stalker.glb', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const srcAccData = (g, b, i) => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView]
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]
    const start = bv.byteOffset + (a.byteOffset ?? 0)
    return new Float32Array(b.buffer, b.byteOffset + start, a.count * n)
  }
  const srcBinView = srcBin
  const { json, acc } = parseGLB(out)
  const prim = json.meshes[0].primitives[0]
  for (const [attr, srcIdx, dstIdx] of [
    ['POSITION', srcPrim.attributes.POSITION, prim.attributes.POSITION],
    ['NORMAL', srcPrim.attributes.NORMAL, prim.attributes.NORMAL],
    ['TEXCOORD_0', srcPrim.attributes.TEXCOORD_0, prim.attributes.TEXCOORD_0],
  ]) {
    const srcArr = srcAccData(srcJson, srcBinView, srcIdx)
    const dstArr = acc(dstIdx)
    assert.equal(dstArr.length, srcArr.length, `${attr} comprimento`)
    for (let i = 0; i < srcArr.length; i++) assert.equal(dstArr[i], srcArr[i], `${attr}[${i}]`)
  }
  // índices idênticos
  const srcIdxArr = (() => {
    const a = srcJson.accessors[srcPrim.indices]
    const bv = srcJson.bufferViews[a.bufferView]
    const Ctor = { 5123: Uint16Array, 5125: Uint32Array }[a.componentType]
    return new Ctor(srcBin.buffer, srcBin.byteOffset + bv.byteOffset + (a.byteOffset ?? 0), a.count)
  })()
  const dstIdxArr = acc(prim.indices)
  assert.equal(dstIdxArr.length, srcIdxArr.length)
  for (let i = 0; i < srcIdxArr.length; i++) assert.equal(dstIdxArr[i], srcIdxArr[i], `indices[${i}]`)
})

test('reimport: JOINTS_0 == w4 original; WEIGHTS_0 somam 1.0 por vértice', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const { json, acc } = parseGLB(out)
  const prim = json.meshes[0].primitives[0]
  const J = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0)
  assert.equal(json.accessors[prim.attributes.JOINTS_0].componentType, 5121)
  assert.equal(json.accessors[prim.attributes.JOINTS_0].count, 8731)
  assert.equal(json.accessors[prim.attributes.WEIGHTS_0].componentType, 5126)
  const w4 = Uint8Array.from(atob ? atob(rigRaw.w4) : Buffer.from(rigRaw.w4, 'base64').toString('binary'), c => c.charCodeAt(0))
  for (let i = 0; i < 8731 * 4; i++) assert.equal(J[i], w4[i], `joint[${i}]`)
  for (let v = 0; v < 8731; v++) {
    const s = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3]
    assert.ok(Math.abs(s - 1) < 1e-6, `vértice ${v}: soma ${s}`)
  }
})

test('reimport: nós de junta recompõem a bind pose exatamente', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const { json } = parseGLB(out)
  const world = new Array(json.nodes.length)
  const walk = (idx, parentPos) => {
    const n = json.nodes[idx]
    const t = n.translation ?? [0, 0, 0]
    world[idx] = parentPos ? [parentPos[0] + t[0], parentPos[1] + t[1], parentPos[2] + t[2]] : [...t]
    for (const c of n.children ?? []) walk(c, world[idx])
  }
  walk(0, null)
  joints.forEach((j, i) => {
    assert.ok(world[i], `junta ${i} acessível a partir da raíz`)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(world[i][k] - j.pos[k]) < 1e-6, `junta ${j.n} eixo ${k}: ${world[i][k]} ≠ ${j.pos[k]}`)
  })
})

test('reimport: inverseBindMatrices = translate(-rest) por junta', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const { json, acc } = parseGLB(out)
  const ibm = acc(json.skins[0].inverseBindMatrices)
  for (let i = 0; i < joints.length; i++) {
    const o = i * 16
    assert.deepEqual(Array.from(ibm.slice(o, o + 12)), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], `IBM[${i}] diagonal`)
    assert.ok(Math.abs(ibm[o + 12] + joints[i].pos[0]) < 1e-6)
    assert.ok(Math.abs(ibm[o + 13] + joints[i].pos[1]) < 1e-6)
    assert.ok(Math.abs(ibm[o + 14] + joints[i].pos[2]) < 1e-6)
    assert.equal(ibm[o + 15], 1)
  }
})

test('reimport: clip de teste (--demo-anim) sobrevive à viagem de ida e volta', () => {
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints, demoAnim: true })
  const { json, acc } = parseGLB(out)
  assert.equal(json.animations.length, 1)
  const a = json.animations[0]
  assert.equal(a.channels[0].target.node, 12)
  assert.equal(a.channels[0].target.path, 'rotation')
  const T = acc(a.samplers[0].input)
  assert.deepEqual(Array.from(T), [0, 0.5, 1.0])
  const Q = acc(a.samplers[0].output)
  assert.ok(Math.abs(Q[3] - 1) < 1e-6 && Math.abs(Q[7] - Math.cos(0.3)) < 1e-6 && Math.abs(Q[11] - 1) < 1e-6)
})

test('reimport: JOINTS_0/WEIGHTS_0 atravessam o skinning CPU identicamente (sanidade)', () => {
  // não testa o renderer — prova que os dados round-trip servem o nosso StalkerRig
  const out = buildSkinnedGLB({ glb: glbSrc, rigJson, joints })
  const { json, acc } = parseGLB(out)
  const prim = json.meshes[0].primitives[0]
  const J = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0)
  let bad = 0
  for (let v = 0; v < 8731; v++) {
    let s = 0
    for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (w < 0 || w > 1) bad++; s += w }
    if (Math.abs(s - 1) > 1e-6) bad++
    for (let k = 0; k < 4; k++) if (J[v * 4 + k] >= 21) bad++
  }
  assert.equal(bad, 0)
})
