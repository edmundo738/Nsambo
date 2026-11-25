// Inspetor de GLB: imprime estrutura (JSON chunk + BIN) sem desenhar nada.
import { readFileSync } from 'node:fs'
const file = process.argv[2]
if (!file) { console.error('uso: node glb-inspect.mjs ficheiro.glb'); process.exit(1) }
const buf = readFileSync(file)
const magic = buf.readUInt32LE(0)
if (magic !== 0x46546c67) { console.error('não é GLB (magic errado)'); process.exit(1) }
const version = buf.readUInt32LE(4)
console.log('ficheiro:', file, '| GLB v' + version, '|', (buf.length/1e6).toFixed(2), 'MB')
let off = 12, json = null, binSize = 0
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4)
  if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'))
  else if (type === 0x004e4942) binSize = len
  off += 8 + len
}
if (!json) { console.error('sem chunk JSON'); process.exit(1) }
console.log('meshes   :', (json.meshes ?? []).length, '| nodes:', (json.nodes ?? []).length, '| skins:', (json.skins ?? []).length, '| animations:', (json.animations ?? []).length)
console.log('materials:', (json.materials ?? []).map(m => m.name ?? '(sem nome)').join(', ') || '(nenhum)')
console.log('images   :', (json.images ?? []).map(i => i.uri ? 'uri:' + i.uri : 'embed#' + (i.bufferView ?? '?')).join(' | ') || '(nenhuma)')
console.log('textures :', (json.textures ?? []).length, '| accessors:', (json.accessors ?? []).length, '| bufferViews:', (json.bufferViews ?? []).length, '| BIN:', (binSize/1e6).toFixed(2), 'MB')
for (const [i, m] of (json.meshes ?? []).entries()) {
  for (const [j, p] of m.primitives.entries()) {
    const attrs = Object.keys(p.attributes).join(',')
    const pos = json.accessors[p.attributes.POSITION]
    console.log(`  mesh[${i}] prim[${j}] mode=${p.mode ?? 4} attrs=${attrs} verts=${pos.count} indices=${p.indices != null ? json.accessors[p.indices].count : '—'} mat=${p.material ?? 0}`)
  }
}
console.log('nodes    :', (json.nodes ?? []).map(n => (n.name ?? '?') + (n.skin != null ? ' [skin]' : '')).join(', '))
if (json.scenes?.length) console.log('scenes   :', json.scenes.map(s => (s.nodes ?? []).length + ' nodes').join(', '))
