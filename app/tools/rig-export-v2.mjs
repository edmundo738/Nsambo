// CLI: exporta um esqueleto v2 + stalker.glb → GLB skinned (RASCUNHO de pesos automáticos)
// uso: node rig-export-v2.mjs --skeleton humanoid|preservar|ficheiro.json --out saida.glb
// AVISO: pesos por distância inversa — NÃO usar para aprovação Nível 1 (pintura manual pendente).
import { readFileSync, writeFileSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JOINT_TEMPLATE, buildRigDataFromAnchors, normalizeWeights, modelBoxFromPositions } from '../src/backrooms/game/stalker-anchors.mjs'
import { humanoidTemplate, fromGameJointTemplate, fromV1, toEngineJoints, validateSkeleton, SCHEMA_V2 } from '../src/rig-align/skeleton-schema.mjs'
import { autoSkinWeights } from '../src/rig-align/skin-transfer.mjs'
import { buildSkinnedGLB } from '../src/rig-align/glb-export.js'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const skArg = opt('skeleton', 'humanoid')
let skeleton
if (skArg === 'humanoid') skeleton = humanoidTemplate()
else if (skArg === 'preservar' || skArg === 'game') skeleton = fromGameJointTemplate(JOINT_TEMPLATE)
else {
  const p = isAbsolute(skArg) ? skArg : join(ROOT, skArg)
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  skeleton = raw.schema === SCHEMA_V2 ? raw : fromV1(raw)
}
const v = validateSkeleton(skeleton)
if (v.errors.length) { console.error('esqueleto inválido:\n' + v.errors.map(e => '  ✗ ' + e).join('\n')); process.exit(1) }
if (v.warnings.length) for (const w of v.warnings) console.warn('  ⚠ ' + w)
const joints = toEngineJoints(skeleton)
const missing = joints.filter(j => !j.pos)
if (missing.length) { console.error(`esqueleto "${skeleton.name}" sem posições em ${missing.length} juntas — exporta só esqueletos com posições (ex.: humanoid)`); process.exit(1) }
const glb = readFileSync(join(ROOT, 'assets', 'models', 'stalker.glb'))
const clen = glb.readUInt32LE(12)
const srcJson = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
const prim = srcJson.meshes[0].primitives[0]
const acc = srcJson.accessors[prim.attributes.POSITION]
const bv = srcJson.bufferViews[acc.bufferView]
let bOff = 20 + clen, bin = null
while (bOff < glb.length) { const len = glb.readUInt32LE(bOff), t = glb.readUInt32LE(bOff + 4); if (t === 0x004e4942) bin = glb.subarray(bOff + 8, bOff + 8 + len); bOff += 8 + len }
const restP = new Float32Array(acc.count * 3)
const base = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
for (let x = 0; x < acc.count; x++) { const o = base + x * (bv.byteStride ?? 12); restP[x*3] = glb.readFloatLE(o); restP[x*3+1] = glb.readFloatLE(o+4); restP[x*3+2] = glb.readFloatLE(o+8) }
console.log('a computar pesos automáticos (distância inversa, k=4)…')
const auto = autoSkinWeights(restP, joints)
console.log('pesos auto: somas exatamente 255 · índices < ' + joints.length)
const bytes = buildSkinnedGLB({ glb, rigJson: auto, joints })
const out = opt('out', `assets/models/stalker.${skeleton.name ?? 'v2'}.draft.glb`)
const outPath = isAbsolute(out) ? out : join(ROOT, out)
writeFileSync(outPath, bytes)
console.log(`escrito ${outPath} — ${(bytes.length / 1e6).toFixed(2)} MB · ${joints.length} juntas (${skeleton.name}) [RASCUNHO]`)
