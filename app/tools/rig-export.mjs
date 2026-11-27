// CLI: exporta stalker.glb + âncoras + pesos → GLB skinned (ver src/rig-align/glb-export.js)
// uso: node rig-export.mjs [--glb stalker.glb] [--rig stalker.rig.json] [--anchors rig-data/stalker.json]
//      [--out assets/models/stalker.skinned.glb] [--demo-anim]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRigDataFromAnchors, normalizeWeights, modelBoxFromPositions, JOINT_NAMES } from '../src/backrooms/game/stalker-anchors.mjs'
import { buildSkinnedGLB } from '../src/rig-align/glb-export.js'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const flag = (k) => args.includes('--' + k)
const glb = readFileSync(join(ROOT, opt('glb', 'assets/models/stalker.glb')))
const rigRaw = JSON.parse(readFileSync(join(ROOT, opt('rig', 'assets/models/stalker.rig.json')), 'utf8'))
const anchorsJson = JSON.parse(readFileSync(join(ROOT, opt('anchors', 'rig-data/stalker.json')), 'utf8'))
const outOpt = opt('out', 'assets/models/stalker.skinned.glb')
const outPath = outOpt.startsWith('/') ? outOpt : join(ROOT, outOpt)
// pesos normalizados (esparsidade preservada) — exportar pesos válidos é o objectivo
const rigJson = normalizeWeights(rigRaw)
if (rigJson.normalized) console.log(`pesos normalizados: ${rigJson.normalized} vértices corrigidos`)
// posições GLB para o modelBox
const clen = glb.readUInt32LE(12)
const srcJson = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
const prim = srcJson.meshes[0].primitives[0]
const acc = srcJson.accessors[prim.attributes.POSITION]
const bv = srcJson.bufferViews[acc.bufferView]
let bOff = 20 + clen, bin = null
while (bOff < glb.length) { const len = glb.readUInt32LE(bOff), type = glb.readUInt32LE(bOff + 4); if (type === 0x004e4942) bin = glb.subarray(bOff + 8, bOff + 8 + len); bOff += 8 + len }
const pBase = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
const restP = new Float32Array(acc.count * 3)
for (let v = 0; v < acc.count; v++) { const o = pBase + v * (bv.byteStride ?? 12); restP[v*3] = glb.readFloatLE(o); restP[v*3+1] = glb.readFloatLE(o+4); restP[v*3+2] = glb.readFloatLE(o+8) }
const modelBox = modelBoxFromPositions(restP)
const joints = buildRigDataFromAnchors(rigJson, anchorsJson.points ?? anchorsJson, modelBox).joints
const bytes = buildSkinnedGLB({ glb, rigJson, joints, demoAnim: flag('demo-anim') })
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, bytes)
console.log(`escrito ${outPath} — ${(bytes.length / 1e6).toFixed(2)} MB · ${joints.length} juntas · ${acc.count} verts`)
console.log('juntas:', JOINT_NAMES.join(', '))
