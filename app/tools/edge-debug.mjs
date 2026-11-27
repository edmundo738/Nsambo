import { readFileSync } from 'fs'
import { StalkerRig } from '/home/user/Nsambo/app/src/backrooms/game/stalker-rig.mjs'
import { loadGLB } from '/home/user/Nsambo/app/src/backrooms/engine/gltf.js'
const glb = await loadGLB('data:model/gltf-binary;base64,' + readFileSync('/home/user/Nsambo/assets/models/stalker.glb').toString('base64'))
const rest = Float32Array.from(glb.positions)
const restN = Float32Array.from(glb.normals)
const vcount = glb.verts
const rigData = JSON.parse(readFileSync(process.argv[2] ?? '/home/user/Nsambo/assets/models/stalker.rig.json', 'utf8'))
const rig = new StalkerRig(rigData)
const outP = new Float32Array(rest.length)
rig.update(1/60, { dt: 1/60, state: 'dormant', speed: 0, walkDist: 0, hunt01: 0, pounce01: 0, stagger01: 0, lookYaw: 0, lookPitch: 0, time: 0 })
rig.skin(rest, restN, null, outP, new Float32Array(restN.length), null)
// stats por vértice
let mx = 0, over = 0
for (let v = 0; v < vcount; v++) {
  const d = Math.hypot(outP[v*3]-rest[v*3], outP[v*3+1]-rest[v*3+1], outP[v*3+2]-rest[v*3+2])
  if (d > mx) mx = d
  if (d > 0.02) over++
}
console.log('frame0 dormant: max |out-rest| =', (mx*100).toFixed(1), 'cm · verts>2cm =', over, '/', vcount)
// agora com walkDist 2.4 (meio-passo)
for (const [state, speed, hunt01, walkDist] of [['stalk', 1.15, 0.35, 2.4], ['hunt', 3.1, 1, 7.96], ['hunt', 4.3, 1, 10.5]]) {
  const r2 = new StalkerRig(rigData)
  const o = new Float32Array(rest.length)
  r2.update(1/60, { dt: 1/60, state, speed, walkDist, hunt01, pounce01: state==='hunt'&&speed>4 ? 0.9 : 0, stagger01: 0, lookYaw: 0.2, lookPitch: 0.1, time: 2 })
  r2.skin(rest, restN, null, o, new Float32Array(restN.length), null)
  let m = 0
  for (let v = 0; v < vcount; v++) { const d = Math.hypot(o[v*3]-rest[v*3], o[v*3+1]-rest[v*3+1], o[v*3+2]-rest[v*3+2]); if (d > m) m = d }
  console.log(`${state} speed=${speed} walk=${walkDist}: max disp ${(m*100).toFixed(1)} cm`)
}
