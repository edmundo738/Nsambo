// NSAMBO · stalker-anchors — CONSTRUTOR ÚNICO do esqueleto a partir das âncoras A…M
// Usado pelo editor (ANIMAÇÃO) e pelos testes. O JOGO ainda não consome este
// módulo (o utilizador integra quando terminar a organização do esqueleto).
//
// Regras invioláveis:
//  1. Uma única fonte de verdade: as posições saem SÓ das âncoras do utilizador.
//  2. O bind legado (stalker.rig.json.pos) NUNCA entra nos cálculos — os seus
//     únicos dados reutilizados são os pesos (w4/v4), que são índices de
//     vértice→junta (ordem fixa de 21 juntas).
//  3. Derivações inevitáveis, EXCLUSIVAMENTE função das âncoras + frações fixas:
//       spine1/2  = pontos F→M / F→B (0.24 / 0.52) · spine3 = M (ou lerp 0.78 F→B)
//       clavícula = 38% de B→ombro
//       cabeça    = B prolongando a linha A→B ×1.3
//       ancas     = J e K (âncoras próprias) — fallback 10% F→joelho se ausentes
//       calcanhar I1/I2 NÃO entra — o rig não tem osso de calcanhar
// Ordem das 21 juntas = índices de peso do ficheiro (não alterar):
// pelvis0 spine1 1 spine2 2 spine3 3 neck4 head5 jaw6 clavL7 clavR8
// upperArmL9 upperArmR10 foreArmL11 foreArmR12 handL13 handR14 upperLegL15
// upperLegR16 lowerLegL17 lowerLegR18 footL19 footR20
export const JOINT_TEMPLATE = [
  ['pelvis', -1], ['spine1', 0], ['spine2', 1], ['spine3', 2], ['neck', 3], ['head', 4], ['jaw', 5],
  ['clavL', 3], ['clavR', 3], ['upperArmL', 7], ['upperArmR', 8], ['foreArmL', 9], ['foreArmR', 10],
  ['handL', 11], ['handR', 12], ['upperLegL', 0], ['upperLegR', 0], ['lowerLegL', 15], ['lowerLegR', 16], ['footL', 17], ['footR', 18],
]
export const JOINT_NAMES = JOINT_TEMPLATE.map(([n]) => n)
export const JOINT_COUNT = JOINT_TEMPLATE.length   // 21

const clamp01 = (v) => Math.min(1, Math.max(0, v))
export const projectAnchor = (a, modelBox = null) => {
  const m = a?.model
  if (m && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)) return [m.x, m.y, m.z]
  if (!modelBox) return [0, 0, 0]
  const nx = clamp01(a?.nx ?? 0.5), ny = clamp01(a?.ny ?? 0.5), nz = Math.max(-2, Math.min(2, a?.nz ?? 0))
  return [
    modelBox.min[0] + nx * modelBox.size[0],
    modelBox.max[1] - ny * modelBox.size[1],
    modelBox.center[2] + nz * modelBox.size[2] * 0.5,
  ]
}
export const modelBoxFromPositions = (restP) => {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < restP.length; i += 3) {
    const x = restP[i], y = restP[i + 1], z = restP[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  return {
    min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  }
}
const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]

// Verifica integridade estrutural mínima das âncoras — devolve lista de falhas (vazia = ok)
export function validateAnchors(P, modelBox = null) {
  const problems = []
  const need = ['A', 'B', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F', 'G1', 'G2', 'H1', 'H2', 'I1', 'I2']
  for (const id of need) {
    const p = P?.[id]
    if (!p) { problems.push(`${id}: em falta`); continue }
    const m = p.model
    const ok = (m && ['x', 'y', 'z'].every(k => Number.isFinite(m[k])))
      || ['nx', 'ny', 'nz'].every(k => Number.isFinite(p[k]))
    if (!ok) problems.push(`${id}: coordenadas inválidas`)
  }
  if (problems.length) return problems
  const A = projectAnchor(P.A, modelBox), B = projectAnchor(P.B, modelBox), F = projectAnchor(P.F, modelBox)
  const dAB = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
  if (dAB < 0.03) problems.push('queixo (A) e pescoço (B) colados — a linha da cabeça fica indefinida')
  for (const [i1, i2] of [['C1', 'D1'], ['D1', 'E1'], ['C2', 'D2'], ['D2', 'E2'], ['F', 'G1'], ['G1', 'H1'], ['F', 'G2'], ['G2', 'H2']]) {
    const p = projectAnchor(P[i1], modelBox), q = projectAnchor(P[i2], modelBox)
    const len = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
    if (len < 0.02) problems.push(`${i1}→${i2}: segmento de ${(len * 100).toFixed(1)} cm — degenerado`)
  }
  return problems
}

// Constrói as 21 juntas SÓ a partir das âncoras (+ opcionais J, K, M)
export function buildJointsFromAnchors(P, modelBox = null) {
  const problems = validateAnchors(P, modelBox)
  if (problems.length) throw new Error('âncoras inválidas: ' + problems.join('; '))
  const A = projectAnchor(P.A, modelBox), B = projectAnchor(P.B, modelBox), F = projectAnchor(P.F, modelBox)
  const C1 = projectAnchor(P.C1, modelBox), C2 = projectAnchor(P.C2, modelBox)
  const D1 = projectAnchor(P.D1, modelBox), D2 = projectAnchor(P.D2, modelBox)
  const E1 = projectAnchor(P.E1, modelBox), E2 = projectAnchor(P.E2, modelBox)
  const G1 = projectAnchor(P.G1, modelBox), G2 = projectAnchor(P.G2, modelBox)
  const H1 = projectAnchor(P.H1, modelBox), H2 = projectAnchor(P.H2, modelBox)
  const M = P.M ? projectAnchor(P.M, modelBox) : null
  const J = P.J ? projectAnchor(P.J, modelBox) : null
  const K = P.K ? projectAnchor(P.K, modelBox) : null
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
  const abLen = Math.hypot(ab[0], ab[1], ab[2]) || 0.2
  const head = [B[0] + (ab[0] / abLen) * abLen * 1.3, B[1] + (ab[1] / abLen) * abLen * 1.3, B[2] + (ab[2] / abLen) * abLen * 1.3]
  const spine3 = M ?? lerp3(F, B, 0.78)
  const spine2 = M ? lerp3(F, M, 0.62) : lerp3(F, B, 0.52)
  const spine1 = lerp3(F, spine3, 0.42)
  const pos = {
    pelvis: F,
    spine1, spine2, spine3,
    neck: B, head, jaw: A,
    clavL: lerp3(B, C1, 0.38), clavR: lerp3(B, C2, 0.38),
    upperArmL: C1, upperArmR: C2, foreArmL: D1, foreArmR: D2, handL: E1, handR: E2,
    upperLegL: J ?? lerp3(F, G1, 0.10), upperLegR: K ?? lerp3(F, G2, 0.10),
    lowerLegL: G1, lowerLegR: G2, footL: H1, footR: H2,
  }
  return JOINT_TEMPLATE.map(([n, p]) => ({ n, p, pos: pos[n].slice() }))
}
// Rig completo: juntas derivadas + pesos do ficheiro (índices intactos)
export function buildRigDataFromAnchors(rigJson, P, modelBox = null) {
  return { ...rigJson, joints: buildJointsFromAnchors(P, modelBox) }
}
// integridade de pesos (v4 0..255): devolve métricas + índice de correções
export function analyzeWeights(rigJson) {
  const dec = (b64) => Uint8Array.from(atob ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'), (c) => c.charCodeAt(0))
  const wIdx = dec(rigJson.w4), wVal = dec(rigJson.v4)
  const vcount = rigJson.vcount
  let zero = 0, off255 = 0, invalidRefs = 0, minSum = 255, maxSum = 0
  for (let v = 0; v < vcount; v++) {
    let sum = 0
    for (let k = 0; k < 4; k++) {
      const bi = wIdx[v * 4 + k]
      if (bi >= JOINT_COUNT) invalidRefs++
      sum += wVal[v * 4 + k]
    }
    if (sum === 0) zero++
    if (sum !== 255) off255++
    if (sum < minSum) minSum = sum
    if (sum > maxSum) maxSum = sum
  }
  // pares cruzados braço×perna acima de 0.20 (bbox de região mão↔coxa)
  const ARM = new Set([9, 10, 11, 12, 13, 14]), LEG = new Set([15, 16, 17, 18, 19, 20])
  const HEAD = 5, NECK = 4
  const TH = 51
  let armLeg = 0, headDom = 0, neckDom = 0
  for (let v = 0; v < vcount; v++) {
    let arm = 0, leg = 0, bw = -1, bi = -1
    for (let k = 0; k < 4; k++) {
      const j = wIdx[v * 4 + k], wv = wVal[v * 4 + k]
      if (ARM.has(j)) arm += wv
      if (LEG.has(j)) leg += wv
      if (wv > bw) { bw = wv; bi = j }
    }
    if (arm > TH && leg > TH) armLeg++
    if (bi === HEAD) headDom++
    if (bi === NECK) neckDom++
  }
  return { vcount, zero, off255, invalidRefs, minSum, maxSum, armLeg, headDom, neckDom }
}
// Normaliza as somas para 255 (preserva distribuição; regista correções)
export function normalizeWeights(rigJson) {
  const dec = (b64) => Uint8Array.from(atob ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'), (c) => c.charCodeAt(0))
  const wVal = dec(rigJson.v4)
  const vcount = rigJson.vcount
  let fixed = 0
  for (let v = 0; v < vcount; v++) {
    const o = v * 4
    const sum = wVal[o] + wVal[o + 1] + wVal[o + 2] + wVal[o + 3]
    if (sum === 255 || sum === 0) continue
    // sparsity-preserving: zeros stay zero (não inventar influências novas),
    // os não-zero absorvem o erro de arredondamento até somar exatamente 255.
    const nz = []
    for (let k = 0; k < 4; k++) if (wVal[o + k] > 0) nz.push(k)
    if (nz.length === 0) continue
    const unit = 255 / sum
    let acc = 0, biggest = nz[0]
    for (const k of nz) {
      wVal[o + k] = Math.floor(wVal[o + k] * unit)
      acc += wVal[o + k]
      if (wVal[o + k] > wVal[o + biggest]) biggest = k
    }
    wVal[o + biggest] += 255 - acc
    fixed++
  }
  const enc = (u8) => (typeof btoa === 'function' ? btoa(String.fromCharCode(...u8)) : Buffer.from(u8).toString('base64'))
  return { ...rigJson, v4: enc(wVal), normalized: fixed }
}
