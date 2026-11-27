// exporta poses do rig para OBJ (v/vt/vn/f) — para render Blender e auditoria visual
// Uso: node tools/pose-export.mjs <outdir>   (gera <outdir>/manifest.json + <outdir>/pose-*.obj)
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { StalkerRig } from '../src/backrooms/game/stalker-rig.mjs'
import { loadGLB } from '../src/backrooms/engine/gltf.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '..', '..')
const mode = (process.argv[3] ?? 'poses')
const outDir = process.argv[2] ?? resolve(root, 'fotos_tmp')
mkdirSync(outDir, { recursive: true })

const rigData = JSON.parse(readFileSync(resolve(root, 'assets/models/stalker.rig.json'), 'utf8'))
const glb = await loadGLB('data:model/gltf-binary;base64,' + readFileSync(resolve(root, 'assets/models/stalker.glb')).toString('base64'))
const vcount = rigData.vcount
const restP = new Float32Array(glb.positions)
const restN = new Float32Array(glb.normals)
const restT = new Float32Array(glb.tangents)
const uvs = glb.uvs // Float32Array x2 por vértice (ou null)
const idx = glb.indices
if (!uvs || !idx) throw new Error('GLB sem uvs/indices necessários para o OBJ')

const baseEnv = { dt: 1 / 60, time: 0, state: 'dormant', speed: 0, walkDist: 0, hunt01: 0, pounce01: 0, stagger01: 0, lookYaw: 0, lookPitch: 0 }

// cada pose: aquece o rig com env até estabilizar e depois peleja
const POSES = [
  { name: '01-idle', warm: ['dormant', 90, {}], env: { state: 'dormant', speed: 0, time: 1.3 } },
  { name: '02-espreita', warm: ['stalk', 150, { speed: 1.15, hunt01: 0.35 }], env: { state: 'stalk', speed: 1.15, hunt01: 0.35, time: 2.5 } },
  { name: '03-caca-contacto', warm: ['hunt', 140, { speed: 3.0, hunt01: 1, walkDist: 0 }], env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0, time: 3 } },
  { name: '04-caca-passada', warm: ['hunt', 140, { speed: 3.0, hunt01: 1, walkDist: 0.38 }], env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0.38, time: 3.06 } },
  { name: '05-caca-estendida', warm: ['hunt', 140, { speed: 3.0, hunt01: 1, walkDist: 0.76 }], env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0.76, time: 3.13 } },
  { name: '06-caca-estendida2', warm: ['hunt', 140, { speed: 3.0, hunt01: 1, walkDist: 1.14 }], env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 1.14, time: 3.2 } },
  { name: '07-bote-pounce', warm: ['hunt', 60, { speed: 4.4, hunt01: 1, pounce01: 0.9, walkDist: 0.5 }], env: { state: 'hunt', speed: 4.4, hunt01: 1, pounce01: 0.95, walkDist: 0.55, time: 4 } },
  { name: '08-recuo-p-lamina', warm: ['hunt', 60, { speed: 3.0, hunt01: 1, stagger01: 0.85, walkDist: 0.3 }], env: { state: 'hunt', speed: 0.0, hunt01: 0.8, stagger01: 0.9, walkDist: 0.35, time: 4.3 } },
  { name: '09-queda-1-abano', ragdoll: { warm: ['hunt', 90, { speed: 3.2, hunt01: 1, walkDist: 0.9 }], frames: 7 }, env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0.95 } },
  { name: '10-queda-2-chama', ragdoll: { warm: ['hunt', 90, { speed: 3.2, hunt01: 1, walkDist: 0.9 }], frames: 22 }, env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0.95 } },
  { name: '11-morto-chao', ragdoll: { warm: ['hunt', 90, { speed: 3.2, hunt01: 1, walkDist: 0.9 }], frames: 210 }, env: { state: 'hunt', speed: 3.0, hunt01: 1, walkDist: 0.95 } },
  { name: '12-mandibula-aberta', warm: ['hunt', 70, { speed: 0.4, hunt01: 1, pounce01: 0.55 }], env: { state: 'hunt', speed: 0.4, hunt01: 1, pounce01: 0.6, walkDist: 1.4, time: 5 } },
]

function skinTo(rig, envExtra, steps, state) {
  for (let i = 0; i < steps; i++) rig.update(1 / 60, { ...baseEnv, state, time: i / 60 + (envExtra.time ?? 0), ...envExtra })
}

if (mode === 'track') {
  const trackDir = outDir
  const rig = new StalkerRig(rigData)
  const dt = 1 / 60, FPS = 24, FRAMES = 216
  let walkDist = 0, diedAt = -1
  const track = []
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS
    let env
    if (f < 36) { env = { state: 'dormant', speed: 0, hunt01: 0, pounce01: 0, stagger01: 0, lookYaw: 0.12, lookPitch: 0.02 } }
    else if (f < 84) { walkDist += 1.15 * dt; env = { state: 'stalk', speed: 1.15, hunt01: 0.35, lookYaw: 0.18, lookPitch: 0.03, walkDist } }
    else if (f < 132) { walkDist += 3.1 * dt; env = { state: 'hunt', speed: 3.1, hunt01: 1, lookYaw: 0.3, lookPitch: 0.06, walkDist } }
    else if (f < 148) { const u = (f - 132) / 15; walkDist += 4.3 * dt; env = { state: 'hunt', speed: 4.3, hunt01: 1, pounce01: Math.sin(u * Math.PI), stagger01: 0, lookYaw: 0.35, lookPitch: 0.1, walkDist } }
    else if (f < 162) { const u = (f - 148) / 13; env = { state: 'hunt', speed: 0.6, hunt01: 0.7, pounce01: 0, stagger01: Math.max(0, 1 - u * 1.4), lookYaw: 0.15, lookPitch: 0.08, walkDist } }
    else {
      if (diedAt < 0) { rig.die(0.55, -0.85, 4.6); diedAt = f }
      env = { state: 'hunt', speed: 0, hunt01: 0.5, walkDist }
    }
    rig.update(dt, { dt, time: t, ...env })
    const outP = new Float32Array(restP.length), outN = new Float32Array(restN.length), outT = new Float32Array(restT.length)
    rig.skin(restP, restN, restT, outP, outN, outT)
    const buf = Buffer.alloc((vcount * 3 + vcount * 3) * 4)
    let o = 0
    for (const x of outP) { buf.writeFloatLE(x, o); o += 4 }
    for (const x of outN) { buf.writeFloatLE(x, o); o += 4 }
    writeFileSync(resolve(trackDir, String(f).padStart(4, '0') + '.bin'), buf)
    track.push({ frame: f, t: +t.toFixed(3), state: env.state, speed: env.speed ?? 0 })
  }
  writeFileSync(resolve(trackDir, 'track.json'), JSON.stringify({ fps: FPS, frames: FRAMES, vcount, track }, null, 1))
  console.log('track:', FRAMES, 'frames em', trackDir)
  process.exit(0)
}

const manifest = []
for (const pose of POSES) {
  const rig = new StalkerRig(rigData)
  let envUse = { ...baseEnv, ...pose.env }
  if (pose.ragdoll) {
    const { warm, frames } = pose.ragdoll
    skinTo(rig, { ...warm[2], time: 0 }, warm[1], warm[0])
    rig.die(0.55, -0.85, 4.8)
    for (let i = 0; i < frames; i++) rig.ragdoll.update(1 / 60)
  } else {
    const [state, steps, over] = pose.warm
    skinTo(rig, over, steps, state)
    // algumas poses querem time exato — reaplica sem acumular walkDist
    rig.update(1 / 60, { ...baseEnv, ...envUse })
  }
  const outP = new Float32Array(restP.length), outN = new Float32Array(restN.length), outT = new Float32Array(restT.length)
  rig.skin(restP, restN, restT, outP, outN, outT)

  const f = (n) => n.toFixed(6)
  const chunks = []
  chunks.push(`# pose ${pose.name}\n`)
  for (let v = 0; v < vcount; v++) chunks.push(`v ${f(outP[v * 3])} ${f(outP[v * 3 + 1])} ${f(outP[v * 3 + 2])}\n`)
  for (let v = 0; v < vcount; v++) chunks.push(`vt ${uvs[v * 2].toFixed(6)} ${(1 - uvs[v * 2 + 1]).toFixed(6)}\n`)   // OBJ v flipped
  for (let v = 0; v < vcount; v++) chunks.push(`vn ${f(outN[v * 3])} ${f(outN[v * 3 + 1])} ${f(outN[v * 3 + 2])}\n`)
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] + 1, b = idx[i + 1] + 1, c = idx[i + 2] + 1
    chunks.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`)
  }
  const file = resolve(outDir, `${pose.name}.obj`)
  writeFileSync(file, chunks.join(''))
  const size = Buffer.byteLength(chunks.join(''))
  console.log('pose', pose.name, '→', (size / 1e6).toFixed(2), 'MB')
  manifest.push({ name: pose.name, file: `${pose.name}.obj`, bytes: size })
}
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log('manifest:', manifest.length, 'poses em', outDir)
