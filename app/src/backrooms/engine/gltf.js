// NSAMBO ENGINE — gltf.js — loader GLB mínimo (glTF 2.0)
// Suporta: 1 mesh, primitivas TRIANGLES, POSITION/NORMAL/TEXCOORD_0
// (+JOINTS_0/WEIGHTS_0 para bake de animação na CPU), texturas embebidas,
// TRS/matrix de nós, hierarquia, 1 animação por chamada (LINEAR/STEP), slerp.
// SEM suporte: múltiplas meshes por nó, morph targets, KE length>1 pós-bake.
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }
const SZ = { 5126: 4, 5125: 4, 5123: 2, 5121: 1, 5122: 2, 5120: 1 }
const VN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

async function fetchJSON(url) {
  const buf = await (await fetch(url)).arrayBuffer()
  return buf
}

export async function loadGLB(url, { anim = null, animTime = 0 } = {}) {
  const buf = await fetchJSON(url)
  const dv = new DataView(buf)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB inválido: ' + url)
  let off = 12, json = null, bin = null
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true)
    const slice = buf.slice(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(slice))
    else if (type === 0x004e4942) bin = slice
    off += 8 + len
  }
  if (!json) throw new Error('GLB sem JSON: ' + url)

  const readAccessor = (i) => {
    const a = json.accessors[i]
    const n = VN[a.type]
    const bv = json.bufferViews[a.bufferView ?? 0]
    const byteOffset = (bv?.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const Ctor = CT[a.componentType]
    const stride = bv?.byteStride
    const flat = new Ctor(bin, byteOffset, a.count * n)
    if (!stride || stride === n * SZ[a.componentType]) return { arr: flat, count: a.count, type: a.type, comps: n }
    // des-stride
    const out = new Ctor(a.count * n)
    const src = new Ctor(bin, byteOffset, (a.count - 1) * stride / SZ[a.componentType] + n)
    for (let r = 0; r < a.count; r++) for (let c = 0; c < n; c++) out[r * n + c] = src[r * (stride / SZ[a.componentType]) + c]
    return { arr: out, count: a.count, type: a.type, comps: n }
  }

  // ── materiais/texturas embebidas ────────────────────────────────
  let textureBlob = null
  const tex = json.textures?.[json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index ?? -1]
  const img = tex ? json.images?.[tex.source] : null
  if (img?.bufferView != null && bin) {
    const bv = json.bufferViews[img.bufferView]
    textureBlob = new Blob([bin.slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)], { type: img.mimeType ?? 'image/png' })
  } else if (img?.uri) {
    textureBlob = await (await fetch(new URL(img.uri, url).href)).blob()
  }

  // ── nós: hierarquia + TRS ───────────────────────────────────────
  const nodes = json.nodes ?? []
  const q2m = (q) => { // quat [x,y,z,w] → mat3x3 (column-major m rotation 3x3)
    const [x, y, z, w] = q
    const xx = x * x, yy = y * y, zz = z * z
    const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z
    return [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy),
            2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx),
            2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)]
  }
  const localMatrix = (n) => {
    if (n.matrix) return Float32Array.from(n.matrix)
    const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1]
    const r = q2m(q)
    return new Float32Array([
      r[0] * s[0], r[1] * s[0], r[2] * s[0], 0,
      r[3] * s[1], r[4] * s[1], r[5] * s[1], 0,
      r[6] * s[2], r[7] * s[2], r[8] * s[2], 0,
      t[0], t[1], t[2], 1,
    ])
  }
  const parentOf = new Map()
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)))
  const global = new Array(nodes.length).fill(null)
  const globalMatrix = (i) => {
    if (global[i]) return global[i]
    const local = localMatrix(nodes[i])
    const p = parentOf.get(i)
    global[i] = p === undefined ? local : mat4mul(globalMatrix(p), local)
    return global[i]
  }
  function mat4mul(a, b) {
    const o = new Float32Array(16)
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
    return o
  }
  const mat4mulVec = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]
  const mat3x3MulVec = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]

  // ── animação (amostra linear) ────────────────────────────────────
  const animNodeIndices = new Set()
  if (anim) {
    const a = json.animations?.find((x) => x.name === anim)
    if (a) {
      for (const ch of a.channels) {
        const s = a.samplers[ch.sampler]
        const input = readAccessor(s.input).arr
        const output = readAccessor(s.output)
        // encontrar segmento
        let t = Math.min(Math.max(animTime, input[0]), input[input.length - 1])
        let i = 0
        while (i < input.length - 2 && t > input[i + 1]) i++
        const f = input[i + 1] === input[i] ? 0 : (t - input[i]) / (input[i + 1] - input[i])
        const node = nodes[ch.target.node]
        const path = ch.target.path // translation | rotation | scale
        const n = VN[output.type]
        const v0 = [], v1 = []
        for (let k = 0; k < n; k++) { v0.push(output.arr[i * n + k]); v1.push(output.arr[(i + 1) * n + k]) }
        const STEP = s.interpolation === 'STEP'
        const mix = (fa, fb) => STEP ? v0 : fa.map((x, k) => x + (v1[k] - x) * (fb ?? f))
        if (path === 'rotation') {
          const q0 = v0, q1 = STEP ? v0 : v1
          let dot = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]
          let a0 = q0, b0 = q1
          if (dot < 0) { dot = -dot; b0 = q1.map((x) => -x) }
          let q
          if (dot > 0.9995) q = a0.map((x, k) => x + (b0[k] - x) * (STEP ? 0 : f))
          else {
            const theta = Math.acos(Math.min(1, dot))
            const s0 = Math.sin((1 - f) * theta) / Math.sin(theta), s1 = Math.sin(f * theta) / Math.sin(theta)
            q = [0, 1, 2, 3].map((k) => a0[k] * s0 + b0[k] * s1)
          }
          const L = Math.hypot(q[0], q[1], q[2], q[3]) || 1
          node.rotation = [q[0] / L, q[1] / L, q[2] / L, q[3] / L]
        } else if (path === 'translation') {
          node.translation = mix(v0, f)
        } else if (path === 'scale') {
          node.scale = mix(v0, f)
        }
        animNodeIndices.add(ch.target.node)
      }
    }
  }

  // ── malha + skinning bake ────────────────────────────────────────
  const meshNode = nodes.findIndex((n) => n.mesh !== undefined)
  if (meshNode < 0) throw new Error('GLB sem mesh: ' + url)
  const skin = nodes[meshNode].skin != null ? json.skins[nodes[meshNode].skin] : null
  // multi-primitiva: concatenar todas as primitivas numa só (posição/normal/uv/índices).
  // O motor usa UM material por mesh — o modelo deve portanto coser os materiais numa só textura
  // (as tampas da pilha AA usam uma amostra de aço na própria textura — ver make-battery-glb.py).
  const prims = json.meshes[nodes[meshNode].mesh].primitives
  const prim = prims[0]
  const P = prims.map((p) => readAccessor(p.attributes.POSITION)).reduce((acc, p) => ({ arr: Float32Array.from([...acc.arr, ...p.arr]), count: acc.count + p.count, type: 'VEC3', comps: 3 }), { arr: new Float32Array(0), count: 0, type: 'VEC3', comps: 3 })
  const N = prims.some((p) => p.attributes.NORMAL !== undefined)
    ? prims.map((p) => (p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : (() => { const a = new Float32Array(readAccessor(p.attributes.POSITION).count * 3); a.fill(0); a[1] = 1; return { arr: a, count: a.length / 3, type: 'VEC3', comps: 3 } })()))
        .reduce((acc, p) => ({ arr: Float32Array.from([...acc.arr, ...p.arr]), count: acc.count + p.count, type: 'VEC3', comps: 3 }), { arr: new Float32Array(0), count: 0, type: 'VEC3', comps: 3 })
    : null
  const UV = prims.every((p) => p.attributes.TEXCOORD_0 !== undefined)
    ? prims.map((p) => readAccessor(p.attributes.TEXCOORD_0)).reduce((acc, p) => ({ arr: Float32Array.from([...acc.arr, ...p.arr]), count: acc.count + p.count, type: 'VEC2', comps: 2 }), { arr: new Float32Array(0), count: 0, type: 'VEC2', comps: 2 })
    : null
  const J = null   // skinning continua a exigir 1 primitiva (o Stalker tem uma) — ver abaixo
  const W = null
  const Jraw = prims.length === 1 && prim.attributes.JOINTS_0 !== undefined ? readAccessor(prim.attributes.JOINTS_0) : null
  const Wraw = prims.length === 1 && prim.attributes.WEIGHTS_0 !== undefined ? readAccessor(prim.attributes.WEIGHTS_0) : null
  const indices = (() => {
    if (prims.length === 1) return prim.indices !== undefined ? readAccessor(prim.indices).arr : (() => { const a = new Uint32Array(P.count); for (let i = 0; i < P.count; i++) a[i] = i; return a })()
    const merged = []
    let base = 0
    for (let pi = 0; pi < prims.length; pi++) {
      const pr = prims[pi]
      const cnt = readAccessor(pr.attributes.POSITION).count
      const idx = pr.indices !== undefined ? readAccessor(pr.indices).arr : (() => { const a = new Uint32Array(cnt); for (let i = 0; i < cnt; i++) a[i] = i; return a })()
      for (let i = 0; i < idx.length; i++) merged.push(base + idx[i])
      base += cnt
    }
    return new Uint32Array(merged)
  })()

  const pos = new Float32Array(P.count * 3)
  const nor = new Float32Array(P.count * 3)
  let jointFinal = null
  if (skin) {
    const ibm = readAccessor(skin.inverseBindMatrices).arr // MAT4 float32
    jointFinal = skin.joints.map((jn, k) => {
      const g = globalMatrix(jn)
      // final = g * IBM
      return mat4mul(g, Float32Array.from(ibm.slice(k * 16, k * 16 + 16)))
    })
  }
  const M0 = globalMatrix(meshNode) // transform do próprio nó da malha (pós-bake, normalmente identidade aqui)
  for (let v = 0; v < P.count; v++) {
    const p = [P.arr[v * 3], P.arr[v * 3 + 1], P.arr[v * 3 + 2]]
    const n = N ? [N.arr[v * 3], N.arr[v * 3 + 1], N.arr[v * 3 + 2]] : [0, 1, 0]
    if (jointFinal) {
      const i0 = Jraw.arr[v * 4], i1 = Jraw.arr[v * 4 + 1], i2 = Jraw.arr[v * 4 + 2], i3 = Jraw.arr[v * 4 + 3]
      const w0 = Wraw.arr[v * 4], w1 = Wraw.arr[v * 4 + 1], w2 = Wraw.arr[v * 4 + 2], w3 = Wraw.arr[v * 4 + 3]
      const pl = [0, 0, 0], nl = [0, 0, 0]
      const acc = [[i0, w0], [i1, w1], [i2, w2], [i3, w3]]
      for (const [ji, w] of acc) {
        if (w === 0) continue
        const m = jointFinal[ji]
        const tp = mat4mulVec(m, p)
        pl[0] += tp[0] * w; pl[1] += tp[1] * w; pl[2] += tp[2] * w
        const tn = mat3x3MulVec(m, n)
        nl[0] += tn[0] * w; nl[1] += tn[1] * w; nl[2] += tn[2] * w
      }
      pos.set(pl, v * 3)
      const L = Math.hypot(nl[0], nl[1], nl[2]) || 1
      nor.set([nl[0] / L, nl[1] / L, nl[2] / L], v * 3)
    } else {
      const pl = mat4mulVec(M0, p)
      pos.set(pl, v * 3)
      const nm = mat3x3MulVec(M0, n)
      const L = Math.hypot(nm[0], nm[1], nm[2]) || 1
      nor.set([nm[0] / L, nm[1] / L, nm[2] / L], v * 3)
    }
  }
  const uvs = UV ? new Float32Array(UV.arr) : new Float32Array(P.count * 2)
  const tangents = genTangents(pos, nor, uvs, indices)
  const idxU32 = indices.constructor === Uint32Array ? indices : new Uint32Array(indices)

  return {
    url, positions: pos, normals: nor, uvs, indices: idxU32, tangents,
    textureBlob, materialName: json.materials?.[prim.material ?? 0]?.name ?? 'model',
    anim: anim ?? null, verts: P.count, tris: idxU32.length / 3,
  }
}

function genTangents(pos, nor, uvs, indices) {
  const t = new Float32Array((pos.length / 3) * 4)
  const tan1 = new Float32Array(pos.length), tan2 = new Float32Array(pos.length)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]]
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2]
    const e1 = [pos[b * 3] - ax, pos[b * 3 + 1] - ay, pos[b * 3 + 2] - az]
    const e2 = [pos[c * 3] - ax, pos[c * 3 + 1] - ay, pos[c * 3 + 2] - az]
    const duv1 = [uvs[b * 2] - uvs[a * 2], uvs[b * 2 + 1] - uvs[a * 2 + 1]]
    const duv2 = [uvs[c * 2] - uvs[a * 2], uvs[c * 2 + 1] - uvs[a * 2 + 1]]
    const det = duv1[0] * duv2[1] - duv2[0] * duv1[1]
    const f = det === 0 ? 0 : 1 / det
    const tx = (e1[0] * duv2[1] - e2[0] * duv1[1]) * f
    const ty = (e1[1] * duv2[1] - e2[1] * duv1[1]) * f
    const tz = (e1[2] * duv2[1] - e2[2] * duv1[1]) * f
    const bx = (e2[0] * duv1[0] - e1[0] * duv2[0]) * f
    const by = (e2[1] * duv1[0] - e1[1] * duv2[0]) * f
    const bz = (e2[2] * duv1[0] - e1[2] * duv2[0]) * f
    for (const vi of [a, b, c]) {
      tan1[vi * 3] += tx; tan1[vi * 3 + 1] += ty; tan1[vi * 3 + 2] += tz
      tan2[vi * 3] += bx; tan2[vi * 3 + 1] += by; tan2[vi * 3 + 2] += bz
    }
  }
  for (let v = 0; v < pos.length / 3; v++) {
    const N = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]]
    let T = [tan1[v * 3], tan1[v * 3 + 1], tan1[v * 3 + 2]]
    const d = T[0] * N[0] + T[1] * N[1] + T[2] * N[2]
    T = [T[0] - N[0] * d, T[1] - N[1] * d, T[2] - N[2] * d]
    const L = Math.hypot(T[0], T[1], T[2]) || 1
    const B = [tan2[v * 3], tan2[v * 3 + 1], tan2[v * 3 + 2]]
    // handedness: sinal de dot(cross(N,T), B)
    const cx = N[1] * T[2] - N[2] * T[1], cy = N[2] * T[0] - N[0] * T[2], cz = N[0] * T[1] - N[1] * T[0]
    const hand = (cx * B[0] + cy * B[1] + cz * B[2]) < 0 ? -1 : 1
    t[v * 4] = T[0] / L; t[v * 4 + 1] = T[1] / L; t[v * 4 + 2] = T[2] / L; t[v * 4 + 3] = hand
  }
  return t
}
