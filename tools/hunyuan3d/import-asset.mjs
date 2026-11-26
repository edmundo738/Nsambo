#!/usr/bin/env node
// IMPORTADOR DE ASSETS (Hunyuan3D ou qualquer GLB externo) → assets/models/
// Uso:
//   node tools/hunyuan3d/import-asset.mjs caminho/entrada.glb [--out assets/models/faca.glb] [--max-tris 5000] [--keep]
// Sem dependências (parser GLB próprio). Com --max-tris, usa @gltf-transform/cli via npx para simplificar.
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const input = args[0]
if (!input) { console.error('uso: import-asset.mjs entrada.glb [--out destino.glb] [--max-tris N]'); process.exit(2) }
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const has = (name) => args.includes(name)

const out = opt('--out', join(root, 'assets', 'models', basename(input)))
if (out === input || join(root, input) === out) { console.error('ERRO: --out igual à entrada — nada a fazer.'); process.exit(2) }
const maxTris = Number(opt('--max-tris', 0))

// ── parser GLB: magic 'glTF' + chunk JSON + chunk BIN ──────────────────────
const buf = readFileSync(input)
if (buf.readUInt32LE(0) !== 0x46546C67) { console.error('ERRO: não é um GLB (magic inválido). Exporta como .glb, não .gltf solto.'); process.exit(1) }
const vers = buf.readUInt32LE(4)
if (vers !== 2) { console.error('ERRO: GLB versão', vers, '— esperava v2.'); process.exit(1) }
const jsonLen = buf.readUInt32LE(12)
const chunkType = buf.readUInt32LE(16)
if (chunkType !== 0x4E4F534A) { console.error('ERRO: primeiro chunk não é JSON.'); process.exit(1) }
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

const g = (a, d = []) => json[a] ?? d
const accessors = g('accessors')
let tris = 0
const posMin = [Infinity, Infinity, Infinity], posMax = [-Infinity, -Infinity, -Infinity]
for (const m of g('meshes')) {
  for (const p of m.primitives ?? []) {
    const idxAcc = p.indices != null ? accessors[p.indices] : null
    const posAcc = p.attributes?.POSITION != null ? accessors[p.attributes.POSITION] : null
    const count = idxAcc?.count ?? posAcc?.count ?? 0
    if (posAcc?.min && posAcc?.max) for (let i = 0; i < 3; i++) { posMin[i] = Math.min(posMin[i], posAcc.min[i]); posMax[i] = Math.max(posMax[i], posAcc.max[i]) }
    tris += Math.floor(count / 3)
  }
}
const ext = (json.images ?? []).filter(i => i.uri && !i.uri.startsWith('data:'))
const bytes = statSync(input).size / 1024 / 1024
console.log(`GLB v${json.asset?.version ?? '?'}  ${bytes.toFixed(2)} MB`)
console.log(`meshes=${g('meshes').length}  primitives=${g('meshes').reduce((a, m) => a + (m.primitives?.length ?? 0), 0)}  triangles=${tris}`)
console.log(`materials=${g('materials').length}  textures=${g('textures').length}  images=${g('images').length}${ext.length ? `  (${ext.length} EXTERNAS — embute ou falha no browser!)` : '  (todas embutidas)'}`)
if (isFinite(posMin[0])) console.log(`bounds min=[${posMin.map(v => v.toFixed(3))}] max=[${posMax.map(v => v.toFixed(3))}]  size=[${posMin.map((v, i) => (posMax[i] - v).toFixed(3))}]`)
if (!g('meshes').length) { console.error('ERRO: GLB sem meshes.'); process.exit(1) }
if (ext.length) { console.error('ERRO: há texturas externas — o jogo carrega tudo embutido (GLB/data URI).'); process.exit(1) }

if (maxTris && tris > maxTris) {
  console.log(`\nsimplificar ${tris} tris → alvo ≤ ${maxTris} (gltf-transform via npx)…`)
  const tmp = out.replace(/\.glb$/i, '.tmp.glb')
  execFileSync('npx', ['--yes', '@gltf-transform/cli@latest', 'simplify', input, tmp, '--ratio', String(maxTris / tris), '--error', '0.01'], { stdio: 'inherit' })
  execFileSync('npx', ['--yes', '@gltf-transform/cli@latest', 'prune', tmp, out], { stdio: 'inherit' })
  console.log('simplificado →', out)
} else {
  if (has('--keep') || !maxTris) {
    execFileSync('node', ['-e', `require('fs').copyFileSync(${JSON.stringify(input)}, ${JSON.stringify(out)})`])
    console.log('copiado →', out)
  }
}
console.log('\nATRIBUIÇÃO (colar em ATTRIBUTIONS.md após confirmar a origem):')
console.log(`- \`assets/models/${basename(out)}\` — gerado com Tencent Hunyuan3D-2 a partir de imagem de referência do projeto. Licença do modelo: Tencent Hunyuan 3D 2.0 Community License (território exclui UE/Reino Unido/Coreia do Sul). Outputs não reivindicados pela Tencent.`)
