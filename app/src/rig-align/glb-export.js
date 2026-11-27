// NSAMBO · rig-align — Exportação GLB com skin + pesos (glTF 2.0)
// Construído sobre o stalker.glb original: geometria, normais, UVs, índices e material
// são COPIADOS byte a byte dos accessors originais; acrescenta-se:
//   · hierarquia de juntas (nós) a partir das âncoras do utilizador (bind = identidade)
//   · skin com inverseBindMatrices  · JOINTS_0 (UNSIGNED_BYTE) · WEIGHTS_0 (FLOAT 0..1)
// Opcional (--demo-anim / demoAnim:true): 1 clipe de teste "rigtest-elbow" de 1 s para
// provar que o canal de animação também faz a viagem de ida e volta. NÃO é conteúdo
// do jogo — é um artefacto de teste, desligado por omissão.
// Referência: glTF 2.0 §skins, §mesh.primitives, §accessor (normalized weights permitido).

const CT = { 5120: 'i8', 5121: 'u8', 5122: 'i16', 5123: 'u16', 5125: 'u32', 5126: 'f32' }
const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const VN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

// ── leitura dos accessors originais (sem fetch — bin em memória) ──
function readAccessor(bin, json, i) {
  const view = bin instanceof Uint8Array ? bin : new Uint8Array(bin)
  const base = view.byteOffset
  const a = json.accessors[i]
  const bv = json.bufferViews[a.bufferView ?? 0]
  const n = VN[a.type], sz = SZ[a.componentType]
  const byteOffset = base + (bv?.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const stride = bv?.byteStride ?? n * sz
  const Ctor = a.componentType === 5126 ? Float32Array
    : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array
    : a.componentType === 5121 ? Uint8Array : a.componentType === 5122 ? Int16Array : Int8Array
  if (stride === n * sz) return new Ctor(view.buffer, byteOffset, a.count * n).slice()
  const out = new Ctor(a.count * n)
  for (let v = 0; v < a.count; v++)
    for (let k = 0; k < n; k++)
      out[v * n + k] = new Ctor(view.buffer, byteOffset + v * stride + k * sz, 1)[0]
  return out
}
const bboxOf = (arr, n) => {
  const min = Array.from({ length: n }, () => Infinity)
  const max = Array.from({ length: n }, () => -Infinity)
  for (let v = 0; v < arr.length; v += n)
    for (let k = 0; k < n; k++) { const x = arr[v + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x }
  return { min, max }
}
const align4 = (n) => (n + 3) & ~3

// ── montador de buffer: alinha cada bufferView a 4 bytes ──
class BinBuilder {
  constructor() { this.chunks = []; this.offset = 0 }
  push(bytes, pad = 4) {
    const o = this.offset
    this.chunks.push(bytes)
    this.offset += bytes.byteLength
    this.padTo(pad)
    return { offset: o, length: bytes.byteLength }
  }
  padTo(p) { const rem = this.offset % p; if (rem) { this.chunks.push(new Uint8Array(p - rem)); this.offset += p - rem } }
  build() { const out = new Uint8Array(this.offset); let o = 0; for (const c of this.chunks) { out.set(c, o); o += c.byteLength } return out }
}

export function buildSkinnedGLB({ glb, rigJson, joints, demoAnim = false, clipName = 'rigtest-elbow' }) {
  const clen = glb.readUInt32LE(12)
  const srcJson = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
  let bOff = 20 + clen, bin = null
  while (bOff < glb.length) {
    const len = glb.readUInt32LE(bOff), type = glb.readUInt32LE(bOff + 4)
    if (type === 0x004e4942) bin = glb.subarray(bOff + 8, bOff + 8 + len)
    bOff += 8 + len
  }
  if (!bin) throw new Error('GLB sem chunk BIN')
  const srcMesh = srcJson.meshes?.[0]
  const srcPrim = srcMesh?.primitives?.[0]
  if (!srcPrim) throw new Error('GLB sem meshes[0].primitives[0]')
  const srcMat = srcJson.materials?.[0] ?? null

  const POSITION = readAccessor(bin, srcJson, srcPrim.attributes.POSITION)
  const NORMAL = readAccessor(bin, srcJson, srcPrim.attributes.NORMAL)
  const TEXCOORD_0 = readAccessor(bin, srcJson, srcPrim.attributes.TEXCOORD_0)
  const hasIndex = srcPrim.indices != null
  const indices = hasIndex ? readAccessor(bin, srcJson, srcPrim.indices) : null
  const indexCT = hasIndex ? srcJson.accessors[srcPrim.indices].componentType : null
  const nVerts = srcJson.accessors[srcPrim.attributes.POSITION].count
  if (rigJson.vcount !== nVerts) throw new Error(`vcount divergente: rig ${rigJson.vcount} ≠ GLB ${nVerts}`)

  // pesos: rig-data são bytes 0..255 → glTF FLOAT 0..1
  const w4 = Uint8Array.from(atob ? atob(rigJson.w4) : Buffer.from(rigJson.w4, 'base64').toString('binary'), c => c.charCodeAt(0))
  const v4 = Uint8Array.from(atob ? atob(rigJson.v4) : Buffer.from(rigJson.v4, 'base64').toString('binary'), c => c.charCodeAt(0))
  const WEIGHTS = new Float32Array(nVerts * 4)
  for (let i = 0; i < nVerts * 4; i++) WEIGHTS[i] = v4[i] / 255

  // IBM: bind pose = só translações ⇒ IBM_i = translate(-rest_i)
  const IBM = new Float32Array(joints.length * 16)
  joints.forEach((j, i) => {
    const o = i * 16
    IBM.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.pos[0], -j.pos[1], -j.pos[2], 1], o)
  })

  const bb = bboxOf(POSITION, 3)

  // ── buffer ──
  const binB = new BinBuilder()
  const put = (typed, ct, comps, vtype, withBB = false) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength)
    const bv = binB.push(bytes)
    return { bufferView: null, ct, comps, vtype, bv, withBB, typed }
  }
  const pPos = put(POSITION, 5126, 3, 'VEC3', true)
  const pNor = put(NORMAL, 5126, 3, 'VEC3')
  const pUv = put(TEXCOORD_0, 5126, 2, 'VEC2')
  const pIdx = hasIndex ? put(indices, indexCT, 1, 'SCALAR') : null
  const pJ = put(w4, 5121, 4, 'VEC4')   // JOINTS_0 UNSIGNED_BYTE
  const pW = put(WEIGHTS, 5126, 4, 'VEC4') // WEIGHTS_0 FLOAT 0..1 (glTF nativo)
  const pIBM = put(IBM, 5126, 16, 'MAT4')

  // animação de teste (opcional): cotovelo direito (junta 12), 1 s
  let anim = null
  if (demoAnim) {
    const T = new Float32Array([0, 0.5, 1.0])
    const Q = new Float32Array([0, 0, 0, 1, 0, 0, Math.sin(0.3), Math.cos(0.3), 0, 0, 0, 1])
    const pT = put(T, 5126, 1, 'SCALAR', true)
    const pQ = put(Q, 5126, 4, 'VEC4')
    anim = { pT, pQ, jointNode: 12 }
  }

  // ── JSON glTF ──
  const accessors = [], bufferViews = [], addAcc = (p) => {
    const a = { bufferView: bufferViews.length, componentType: p.ct, count: p.typed.length / p.comps, type: p.vtype }
    if (p.withBB) { const b = bboxOf(p.typed, p.comps); a.min = b.min; a.max = b.max }
    accessors.push(a)
    bufferViews.push({ buffer: 0, byteOffset: p.bv.offset, byteLength: p.bv.length })
    return accessors.length - 1
  }
  const aPos = addAcc(pPos), aNor = addAcc(pNor), aUv = addAcc(pUv)
  const aIdx = pIdx ? addAcc(pIdx) : null
  const aJ = addAcc(pJ), aW = addAcc(pW), aIBM = addAcc(pIBM)
  let aAnimT = null, aAnimQ = null
  if (anim) { aAnimT = addAcc(anim.pT); aAnimQ = addAcc(anim.pQ) }

  const nJoints = joints.length
  const nodes = joints.map((j, i) => {
    const p = j.p
    const t = p >= 0
      ? [j.pos[0] - joints[p].pos[0], j.pos[1] - joints[p].pos[1], j.pos[2] - joints[p].pos[2]]
      : [j.pos[0], j.pos[1], j.pos[2]]
    return { name: j.n, translation: t, children: [] }
  })
  joints.forEach((j, i) => { if (j.p >= 0) nodes[j.p].children.push(i) })
  for (const n of nodes) if (n.children.length === 0) delete n.children
  const meshNode = nJoints
  nodes.push({ name: 'stalker', mesh: 0, skin: 0 })
  const sceneNodes = [0, meshNode]

  const material = srcMat ? JSON.parse(JSON.stringify(srcMat)) : { name: 'stalker', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }

  const gltf = {
    asset: { version: '2.0', generator: 'NSAMBO Rig-Align v2 (skinned export)' },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes: [{
      name: srcMesh?.name ?? 'stalker',
      primitives: [{
        attributes: { POSITION: aPos, NORMAL: aNor, TEXCOORD_0: aUv, JOINTS_0: aJ, WEIGHTS_0: aW },
        indices: aIdx ?? undefined,
        material: 0,
      }],
    }],
    skins: [{ name: 'stalker-skin', joints: joints.map((_, i) => i), inverseBindMatrices: aIBM }],
    materials: [material],
    accessors, bufferViews,
    buffers: [{ byteLength: binB.offset }],
  }
  if (anim) {
    gltf.animations = [{
      name: clipName,
      samplers: [{ input: aAnimT, output: aAnimQ, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: anim.jointNode, path: 'rotation' } }],
    }]
  }
  if (aIdx == null) delete gltf.meshes[0].primitives[0].indices

  const binBytes = binB.build()
  const jsonStr = JSON.stringify(gltf)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (binBytes.length % 4)) % 4
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + binBytes.length + binPad
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20
  const bStart = 20 + jsonBytes.length + jsonPad
  dv.setUint32(bStart, binBytes.length + binPad, true); dv.setUint32(bStart + 4, 0x004e4942, true)
  out.set(binBytes, bStart + 8)
  return out
}
