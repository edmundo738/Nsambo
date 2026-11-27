import { readFileSync } from 'fs'
import { StalkerRig } from '/home/user/Nsambo/app/src/backrooms/game/stalker-rig.mjs'
import { loadGLB } from '/home/user/Nsambo/app/src/backrooms/engine/gltf.js'
const glb = await loadGLB('data:model/gltf-binary;base64,' + readFileSync('/home/user/Nsambo/assets/models/stalker.glb').toString('base64'))
const rigData = JSON.parse(readFileSync('/home/user/Nsambo/assets/models/stalker.rig.json', 'utf8'))
const rig = new StalkerRig(rigData)
rig.update(1/60, { dt: 1/60, state: 'dormant', speed: 0, walkDist: 0, hunt01: 0, pounce01: 0, stagger01: 0, lookYaw: 0, lookPitch: 0, time: 0 })
const ORDER = [0,1,2,3,4,5,6,15,16,17,18,19,20,7,8,9,10,11,12,13,14]
const name = rigData.joints.map(j => j.n)
const angOf = (q) => 2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180 / Math.PI
for (const i of ORDER) {
  const q = rig.skel.worldQ[i]
  const wp = rig.skel.worldP[i]
  const rp = rigData.joints[i].pos
  const dp = Math.hypot(wp[0]-rp[0], wp[1]-rp[1], wp[2]-rp[2])
  console.log(`${String(i).padStart(2)} ${name[i].padEnd(10)} |q|rot= ${angOf(q).toFixed(2)}°  Δpos= ${(dp*100).toFixed(2)} cm`)
}
