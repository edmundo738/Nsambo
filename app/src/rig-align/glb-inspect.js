// NSAMBO · rig-align — Inspetor GLB (read-only)
// Parte 5 da spec v2.0: ANTES de construir o rig, o GLB é inspecionado e o relatório
// fica visível no editor. Não altera nada — só mede e reporta.
// Referência estrutural: glTF 2.0 (meshes/nodes/skins/animations/accessors/bufferViews).

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array,
             5125: Uint32Array, 5126: Float32Array }
const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const VN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

const fmtBytes = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`

function readAccessorMinMax(json, bin, i) {
  const a = json.accessors[i]
  if (!a) return null
  const bv = json.bufferViews[a.bufferView ?? 0]
  if (!bv) return null
  const n = VN[a.type] ?? 1
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const stride = bv.byteStride ?? 0
  const Ctor = CT[a.componentType]
  if (!Ctor) return null
  let min = a.min, max = a.max
  if (!min || !max) {
    min = Array.from({ length: n }, () => Infinity)
    max = Array.from({ length: n }, () => -Infinity)
    const step = stride && stride !== n * SZ[a.componentType] ? stride / SZ[a.componentType] : n
    for (let v = 0; v < a.count; v++) {
      const o = off / SZ[a.componentType] + v * step
      for (let k = 0; k < n; k++) {
        const x = new Ctor(bin, (o + k) * SZ[a.componentType], 1)[0]
        if (x < min[k]) min[k] = x
        if (x > max[k]) max[k] = x
      }
    }
  }
  return { min, max, count: a.count }
}

// Lê os arrays JOINTS_0/WEIGHTS_0 crus (para estatísticas de skinning)
function readAccessorArray(json, bin, i) {
  const a = json.accessors[i]
  if (!a) return null
  const bv = json.bufferViews[a.bufferView ?? 0]
  const n = VN[a.type] ?? 1
  const off = (bv?.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const stride = bv?.byteStride ?? 0
  const Ctor = CT[a.componentType]
  if (stride && stride !== n * SZ[a.componentType]) {
    const out = new Ctor(a.count * n)
    for (let v = 0; v < a.count; v++)
      for (let k = 0; k < n; k++)
        out[v * n + k] = new Ctor(bin, off + v * stride + k * SZ[a.componentType], 1)[0]
    return out
  }
  return new Ctor(bin, off, a.count * n)
}

export async function inspectGLB(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`)
  const buf = await res.arrayBuffer()
  const dv = new DataView(buf)
  if (buf.byteLength < 12 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('não é um GLB (magic inválido)')
  const version = dv.getUint32(4, true)
  const total = dv.getUint32(8, true)
  let off = 12, json = null, bin = null
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true)
    const slice = buf.slice(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(slice))
    else if (type === 0x004e4942) bin = slice
    off += 8 + len
  }
  if (!json) throw new Error('GLB sem chunk JSON')

  const report = {
    url, bytes: total, version,
    scenes: (json.scenes ?? []).map((s, i) => ({ index: i, name: s.name ?? `scene_${i}`, nodes: (s.nodes ?? []).length })),
    defaultScene: json.scene ?? 0,
    meshes: [], nodes: [], skins: [], animations: [], materials: [], images: [], textures: [],
    accessors: (json.accessors ?? []).length, bufferViews: (json.bufferViews ?? []).length,
    binBytes: bin?.byteLength ?? 0,
  }

  for (const [i, m] of (json.meshes ?? []).entries()) {
    for (const [j, prim] of m.primitives.entries()) {
      const attrs = {}
      for (const [name, ai] of Object.entries(prim.attributes)) {
        const a = json.accessors[ai]
        attrs[name] = { count: a?.count ?? 0, type: a?.type ?? '?', component: a?.componentType ?? 0 }
      }
      const info = {
        mesh: i, primitive: j, mode: prim.mode ?? 4,
        material: prim.material != null ? (json.materials?.[prim.material]?.name ?? `#${prim.material}`) : '(nenhum)',
        attributes: attrs,
        indices: prim.indices != null ? json.accessors[prim.indices]?.count ?? 0 : null,
        positionBB: prim.attributes.POSITION != null ? readAccessorMinMax(json, bin, prim.attributes.POSITION) : null,
        targets: (prim.targets ?? []).length,
      }
      // estatísticas de pesos/joints, se existirem
      if (prim.attributes.JOINTS_0 != null && prim.attributes.WEIGHTS_0 != null) {
        const J = readAccessorArray(json, bin, prim.attributes.JOINTS_0)
        const W = readAccessorArray(json, bin, prim.attributes.WEIGHTS_0)
        let maxJoint = -1, minSum = Infinity, maxSum = -Infinity, maxW = 0
        const nV = J.length / 4
        for (let v = 0; v < nV; v++) {
          let sum = 0
          for (let k = 0; k < 4; k++) {
            const w = W[v * 4 + k]
            if (w > maxW) maxW = w
            sum += w
            const jj = J[v * 4 + k]
            if (jj > maxJoint) maxJoint = jj
          }
          if (sum < minSum) minSum = sum
          if (sum > maxSum) maxSum = sum
        }
        const looksFloat = maxW <= 1.0
        info.skinning = {
          jointsAccessor: prim.attributes.JOINTS_0, weightsAccessor: prim.attributes.WEIGHTS_0,
          maxJointIndex: maxJoint, vertices: nV,
          weightFormat: looksFloat ? 'float 0..1 (glTF)' : '0..255 (bytes)',
          sumMin: looksFloat ? minSum.toFixed(4) : minSum,
          sumMax: looksFloat ? maxSum.toFixed(4) : maxSum,
          note: looksFloat ? 'pesos glTF — somas ≈ 1' : 'pesos em bytes — somas ≈ 255',
        }
      }
      report.meshes.push(info)
    }
  }

  for (const [i, n] of (json.nodes ?? []).entries()) {
    report.nodes.push({
      index: i, name: n.name ?? `node_${i}`,
      mesh: n.mesh ?? null, skin: n.skin ?? null,
      children: (n.children ?? []).length,
      hasMatrix: !!n.matrix, translation: n.translation ?? null, rotation: n.rotation ?? null, scale: n.scale ?? null,
    })
  }
  for (const [i, s] of (json.skins ?? []).entries()) {
    report.skins.push({
      index: i, name: s.name ?? `skin_${i}`,
      joints: (s.joints ?? []).length,
      skeletonRoot: s.skeleton ?? null,
      ibm: s.inverseBindMatrices != null ? json.accessors[s.inverseBindMatrices]?.count ?? 0 : 0,
    })
  }
  for (const [i, a] of (json.animations ?? []).entries()) {
    let keyframes = 0, duration = 0
    for (const ch of a.channels ?? []) {
      const sam = a.samplers[ch.sampler]
      const acc = json.accessors[sam.input]
      keyframes += acc.count
      const maxT = acc.max?.[0] ?? 0
      if (maxT > duration) duration = maxT
    }
    report.animations.push({
      index: i, name: a.name ?? `anim_${i}`,
      channels: (a.channels ?? []).length, samplers: (a.samplers ?? []).length,
      keyframes, duration,
      targets: [...new Set((a.channels ?? []).map(c => c.target?.path))].join('+') || '—',
    })
  }
  for (const [i, m] of (json.materials ?? []).entries()) {
    report.materials.push({
      index: i, name: m.name ?? `material_${i}`,
      baseColor: m.pbrMetallicRoughness?.baseColorFactor ?? null,
      metallic: m.pbrMetallicRoughness?.metallicFactor ?? null,
      roughness: m.pbrMetallicRoughness?.roughnessFactor ?? null,
      doubleSided: !!m.doubleSided, alphaMode: m.alphaMode ?? 'OPAQUE',
      hasBaseColorTexture: m.pbrMetallicRoughness?.baseColorTexture != null,
    })
  }
  for (const [i, im] of (json.images ?? []).entries()) {
    report.images.push({ index: i, name: im.name ?? `image_${i}`, mime: im.mimeType ?? '(uri)', bytes: im.bufferView != null ? (json.bufferViews[im.bufferView]?.byteLength ?? 0) : 0, uri: im.uri ?? null })
  }
  for (const [i, t] of (json.textures ?? []).entries()) {
    report.textures.push({ index: i, sampler: t.sampler ?? null, source: t.source ?? null })
  }
  return report
}

// ───────────────── render do relatório (HTML) ─────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const row = (k, v, cls = '') => `<tr class="${cls}"><th>${esc(k)}</th><td>${v}</td></tr>`

export function renderInspectorReport(r) {
  const H = []
  H.push('<table class="inspect-table"><tbody>')
  H.push(row('ficheiro', esc(r.url)))
  H.push(row('tamanho', `${fmtBytes(r.bytes)} · GLB v${r.version} · BIN ${fmtBytes(r.binBytes)}`))
  H.push(row('bufferViews', String(r.bufferViews)))
  H.push(row('accessors', String(r.accessors)))
  H.push(row('cenas', r.scenes.map(s => `${esc(s.name)} (${s.nodes} nós)`).join(' · ') || '(nenhuma)'))
  H.push('</tbody></table>')

  H.push('<div class="inspect-h">meshes / primitivas</div>')
  for (const m of r.meshes) {
    const attrs = Object.entries(m.attributes).map(([n, a]) => `${n}:${a.count}`).join(' ')
    H.push('<table class="inspect-table"><tbody>')
    H.push(row('mesh', `#${m.mesh}[${m.primitive}] · mode ${m.mode}${m.targets ? ` · ${m.targets} morph targets` : ''}`))
    H.push(row('material', esc(m.material)))
    H.push(row('atributos', esc(attrs)))
    H.push(row('índices', m.indices != null ? String(m.indices) : '(não-indexada)'))
    if (m.positionBB) {
      const b = m.positionBB
      H.push(row('bbox POSITION', `min(${b.min.map(v => v.toFixed(3)).join(', ')}) max(${b.max.map(v => v.toFixed(3)).join(', ')})`))
    }
    if (m.skinning) {
      const sk = m.skinning
      H.push(row('skinning', `JOINTS_0 → ${sk.jointsAccessor} · WEIGHTS_0 → ${sk.weightsAccessor} · ${sk.vertices} verts · maior índice de junta = ${sk.maxJointIndex}`))
      H.push(row('pesos', `formato ${sk.weightFormat} · somas [${sk.sumMin}, ${sk.sumMax}]`, 'anal-warn'))
    }
    H.push('</tbody></table>')
  }

  H.push('<div class="inspect-h">nós (' + r.nodes.length + ')</div>')
  if (r.nodes.length) {
    H.push('<table class="inspect-table"><thead><tr><th>#</th><th>nome</th><th>mesh</th><th>skin</th><th>filhos</th></tr></thead><tbody>')
    for (const n of r.nodes) {
      H.push(`<tr><td>${n.index}</td><td>${esc(n.name)}</td><td>${n.mesh ?? '—'}</td><td>${n.skin ?? '—'}</td><td>${n.children}</td></tr>`)
    }
    H.push('</tbody></table>')
  } else H.push('<p class="mini">(nenhum nó com malha)</p>')

  H.push('<div class="inspect-h">skins (' + r.skins.length + ')</div>')
  if (r.skins.length) {
    H.push('<table class="inspect-table"><tbody>')
    for (const s of r.skins) H.push(row(esc(s.name), `${s.joints} juntas · IBM ${s.ibm} · raíz de skeleton ${s.skeletonRoot ?? '—'}`))
    H.push('</tbody></table>')
  } else H.push('<p class="mini anal-warn">(nenhuma skin — o esqueleto do jogo NÃO vem deduzido deste GLB; vem do .rig.json + âncoras)</p>')

  H.push('<div class="inspect-h">animações (' + r.animations.length + ')</div>')
  if (r.animations.length) {
    H.push('<table class="inspect-table"><thead><tr><th>#</th><th>nome</th><th>canais</th><th>keys</th><th>duração (s)</th><th>alvos</th></tr></thead><tbody>')
    for (const a of r.animations) H.push(`<tr><td>${a.index}</td><td>${esc(a.name)}</td><td>${a.channels}</td><td>${a.keyframes}</td><td>${a.duration.toFixed(2)}</td><td>${esc(a.targets)}</td></tr>`)
    H.push('</tbody></table>')
  } else H.push('<p class="mini">(nenhuma — as animações do Stalker são geradas proceduralmente pelo motor)</p>')

  H.push('<div class="inspect-h">materiais (' + r.materials.length + ')</div>')
  if (r.materials.length) {
    H.push('<table class="inspect-table"><thead><tr><th>#</th><th>nome</th><th>cor base</th><th>metal</th><th>rough</th><th>α</th><th>tex</th></tr></thead><tbody>')
    for (const m of r.materials) {
      const c = m.baseColor ? m.baseColor.map(v => (v * 255).toFixed(0)).join(',') : '—'
      H.push(`<tr><td>${m.index}</td><td>${esc(m.name)}</td><td>${c}</td><td>${m.metallic ?? '—'}</td><td>${m.roughness ?? '—'}</td><td>${m.alphaMode}${m.doubleSided ? ' ·2s' : ''}</td><td>${m.hasBaseColorTexture ? 'sim' : 'não'}</td></tr>`)
    }
    H.push('</tbody></table>')
  }

  H.push('<div class="inspect-h">imagens (' + r.images.length + ') · texturas (' + r.textures.length + ')</div>')
  if (r.images.length) {
    H.push('<table class="inspect-table"><tbody>')
    for (const im of r.images) H.push(row(im.name, `${esc(im.mime)} · ${im.uri ? esc(im.uri) : fmtBytes(im.bytes) + ' embebido'}`))
    H.push('</tbody></table>')
  } else H.push('<p class="mini">(nenhuma)</p>')
  return H.join('')
}
