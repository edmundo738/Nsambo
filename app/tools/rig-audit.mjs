// NSAMBO · auditoria da arquitectura rig-align × jogo × ANIMAÇÃO
// Corre OFFLINE. Imprime factos medidos — nada de suposições.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const rig = JSON.parse(readFileSync('assets/models/stalker.rig.json'))
const saved = JSON.parse(readFileSync('rig-data/stalker.json'))
const glb = readFileSync('assets/models/stalker.glb')

// ── GLB ──
const clen = glb.readUInt32LE(12)
const gjs = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
console.log('══ GLB ══')
console.log('nodes:', gjs.nodes.length, '· skins:', (gjs.skins ?? []).length, '· meshes:', gjs.meshes.length,
  '· animations:', (gjs.animations ?? []).length, '· imagens:', (gjs.images ?? []).length,
  '· materiais:', (gjs.materials ?? []).map(m => m.name ?? 'sem nome').join(', ') || '(nenhum)')
console.log('attrs:', Object.keys(gjs.meshes[0].primitives[0].attributes).join(', '), '· vcount GLB:', gjs.accessors[gjs.meshes[0].primitives[0].attributes.POSITION].count)

// ── pesos (stalker.rig.json) ──
const dec = (b64) => Buffer.from(b64, 'base64')
const wIdx = dec(rig.w4), wVal = dec(rig.v4)
const vcount = rig.vcount
console.log('\n══ PESOS (', vcount, 'verts ) ══')
console.log('w4 bytes:', wIdx.length, '· v4 bytes:', wVal.length)
let badIdx = 0, badSum = 0, zeroSum = 0, sumMin = 255, sumMax = 0
const sumHist = new Map()
for (let v = 0; v < vcount; v++) {
  let sum = 0
  for (let k = 0; k < 4; k++) {
    const bi = wIdx[v * 4 + k], wv = wVal[v * 4 + k]
    if (bi >= 21) badIdx++
    sum += wv
  }
  if (sum === 0) zeroSum++
  if (sum !== 255) badSum++
  if (sum < sumMin) sumMin = sum
  if (sum > sumMax) sumMax = sum
  sumHist.set(sum, (sumHist.get(sum) ?? 0) + 1)
}
console.log('soma de pesos por vértice — min:', sumMin, 'máx:', sumMax)
console.log('vértices com soma != 255:', badSum, `(${(100 * badSum / vcount).toFixed(2)}%)`, '· soma == 0:', zeroSum, '· índices inválidos (≥21):', badIdx)
console.log('histograma somas (top 5):', [...sumHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))

// distribuição por junta
const perJoint = new Array(21).fill(0)
for (let v = 0; v < vcount; v++) for (let k = 0; k < 4; k++) perJoint[wIdx[v * 4 + k]] += wVal[v * 4 + k]
const total = perJoint.reduce((a, b) => a + b, 0)
const JNAME = ['pelvis','spine1','spine2','spine3','neck','head','jaw','clavL','clavR','upperArmL','upperArmR','foreArmL','foreArmR','handL','handR','upperLegL','upperLegR','lowerLegL','lowerLegR','footL','footR']
console.log('\ninfluência total por junta (%):')
for (let i = 0; i < 21; i++) console.log(' ', JNAME[i].padEnd(10), (100 * perJoint[i] / total).toFixed(2) + '%')

// cruzados extremos — conjuntos de ossos incompatíveis no mesmo vértice (w>0.20 em ambos os lados)
const ARM = new Set([9, 10, 11, 12, 13, 14]), LEG = new Set([15, 16, 17, 18, 19, 20]), JAW = new Set([6]), TORSO = new Set([0, 1, 2, 3])
const TH = 0.20 * 255
let armLeg = 0, jawLeg = 0, jawArm = 0, armLegVerts = []
for (let v = 0; v < vcount; v++) {
  let arm = 0, leg = 0, jaw = 0
  for (let k = 0; k < 4; k++) {
    const bi = wIdx[v * 4 + k], wv = wVal[v * 4 + k]
    if (ARM.has(bi)) arm += wv
    if (LEG.has(bi)) leg += wv
    if (JAW.has(bi)) jaw += wv
  }
  if (arm > TH && leg > TH) { armLeg++; if (armLegVerts.length < 3) armLegVerts.push(v) }
  if (jaw > TH && leg > TH) jawLeg++
  if (jaw > TH && arm > TH) jawArm++
}
console.log('\n══ PESOS CRUZADOS (limiar 0.20) ══')
console.log('vértices com braço E perna >0.20:', armLeg, '(ex. verts:', armLegVerts.join(', ') || '—', ')')
console.log('vértices com queixo E perna >0.20:', jawLeg, '· queixo E braço >0.20:', jawArm)

// ── anchors guardados × bind do jogo ──
console.log('\n══ ÂNCORAS DO USER (rig-data/stalker.json', saved.updatedAt, ') × BIND DO JOGO (stalker.rig.json) ══')
const bind = Object.fromEntries(rig.joints.map(j => [j.n, j.pos]))
const mapAnchor = { A: 'jaw', B: 'neck', C1: 'upperArmL', C2: 'upperArmR', D1: 'foreArmL', D2: 'foreArmR', E1: 'handL', E2: 'handR', F: 'pelvis', G1: 'lowerLegL', G2: 'lowerLegR', H1: 'footL', H2: 'footR' }
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
for (const [a, j] of Object.entries(mapAnchor)) {
  const m = saved.points[a]?.model
  if (!m) continue
  const delta = d([m.x, m.y, m.z], bind[j])
  console.log(`  ${a.padEnd(3)} → ${j.padEnd(10)} |Δ bind jogo| = ${delta.toFixed(3)} m`)
}
