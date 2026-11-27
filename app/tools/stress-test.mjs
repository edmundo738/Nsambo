// Stress test do rig: pesos ORIGINAIS (backup) vs NOVOS (re-skin v2) no MESMO rig
import { readFileSync } from 'fs'
import { StalkerRig } from '/home/user/Nsambo/app/src/backrooms/game/stalker-rig.mjs'
import { loadGLB } from '/home/user/Nsambo/app/src/backrooms/engine/gltf.js'

const glb = await loadGLB('data:model/gltf-binary;base64,' + readFileSync('/home/user/Nsambo/assets/models/stalker.glb').toString('base64'))
const rest = new Float32Array(glb.positions)
const restN = new Float32Array(glb.normals)
const restT = new Float32Array(glb.tangents)
const vcount = glb.verts ?? rest.length / 3
const oldRig = JSON.parse(readFileSync('/tmp/stalker.rig.json.bak-2026-11-27', 'utf8'))
const newRig = JSON.parse(readFileSync('/home/user/Nsambo/assets/models/stalker.rig.json', 'utf8'))

// sequência extrema: stalk → hunt (arma a cabeça p/ trás) → pounce → recuo → morte
const SEQ = []
for (let t = 0; t < 1.2; t += 1/60) SEQ.push({ state: 'stalk', speed: 1.3, hunt01: 0.35, pounce01: 0, stagger01: 0, walkDist: t * 1.3, lookYaw: 0.2, lookPitch: 0.05, time: t })
for (let t = 1.2; t < 3.2; t += 1/60) SEQ.push({ state: 'hunt', speed: 3.2, hunt01: 1, pounce01: 0, stagger01: 0, walkDist: 1.56 + (t-1.2)*3.2, lookYaw: 0.0, lookPitch: 0.35, time: t })
for (let t = 3.2; t < 4.4; t += 1/60) SEQ.push({ state: 'hunt', speed: 4.3, hunt01: 1, pounce01: 0.95, stagger01: 0, walkDist: 7.96 + (t-3.2)*4.3, lookYaw: 0.3, lookPitch: 0.1, time: t })
for (let t = 4.4; t < 5.6; t += 1/60) SEQ.push({ state: 'hunt', speed: 0.4, hunt01: 0.85, pounce01: 0.1, stagger01: 0.9, walkDist: 13.1, lookYaw: -0.3, lookPitch: -0.3, time: t })

const runSeq = (rigData, dieAt = Infinity) => {
  const rig = new StalkerRig(rigData)
  const baseEnv = { dt: 1/60 }
  const outP = new Float32Array(rest.length), outN = new Float32Array(restN.length), outT = new Float32Array(restT.length)
  let peak = new Float32Array(vcount).fill(0)
  let dispSum = 0, frames = 0
  let diedYet = false
  for (const e of SEQ) {
    if (e.time >= 4.4 && !diedYet && dieAt <= e.time) { rig.die(0.55, -0.85, 4.8); diedYet = true }
    rig.update(1/60, { ...baseEnv, ...e })
    rig.skin(rest, restN, restT, outP, outN, outT)
    for (let v = 0; v < vcount; v++) {
      const dx = outP[v*3]-rest[v*3], dy = outP[v*3+1]-rest[v*3+1], dz = outP[v*3+2]-rest[v*3+2]
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz)
      if (d > peak[v]) peak[v] = d
      dispSum += d
    }
    frames++
  }
  return { peak, mean: dispSum / (frames * vcount) }
}
// regiões anatómicas (bind)
const glbPos = glb.positions
const regions = {
  skull:  (i) => glbPos[i*3+1] > 0.46,
  torso:  (i) => Math.abs(glbPos[i*3]) <= 0.28 && glbPos[i*3+1] > -0.05 && glbPos[i*3+1] <= 0.42,
  armL:   (i) => glbPos[i*3] < -0.28,
  armR:   (i) => glbPos[i*3] >  0.28,
  legL:   (i) => glbPos[i*3+1] <= -0.25 && glbPos[i*3] < 0,
  legR:   (i) => glbPos[i*3+1] <= -0.25 && glbPos[i*3] >= 0,
}
const a = runSeq(oldRig), b = runSeq(newRig)
// sem morte — isola a locomoção (ragdoll contamina os picos)
const SEQ_LIVE = SEQ.filter(e => e.time < 4.4)
const runLive = (rigData) => {
  const rig = new StalkerRig(rigData)
  const baseEnv = { dt: 1/60 }
  const outP = new Float32Array(rest.length), outN = new Float32Array(restN.length), outT = new Float32Array(restT.length)
  let peak = new Float32Array(vcount).fill(0)
  let dispSum = 0, frames = 0
  for (const e of SEQ_LIVE) {
    rig.update(1/60, { ...baseEnv, ...e })
    rig.skin(rest, restN, restT, outP, outN, outT)
    for (let v = 0; v < vcount; v++) {
      const dx = outP[v*3]-rest[v*3], dy = outP[v*3+1]-rest[v*3+1], dz = outP[v*3+2]-rest[v*3+2]
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz)
      if (d > peak[v]) peak[v] = d
      dispSum += d
    }
    frames++
  }
  return { peak, mean: dispSum / (frames * vcount) }
}
const a2 = runLive(oldRig), b2 = runLive(newRig)
console.log('\n— SEM RAGDOLL (só locomoção/pounce/recuo) —')
for (const [name, fn] of Object.entries(regions)) {
  const idxs = []
  for (let v = 0; v < vcount; v++) if (fn(v)) idxs.push(v)
  const stat = (r) => {
    const arr = idxs.map(v => r.peak[v]).sort((x, y) => x - y)
    const p = (q) => arr[Math.floor(arr.length * q)]
    return `máx ${(arr[arr.length-1]*100).toFixed(1)}cm · p99 ${(p(0.99)*100).toFixed(1)}cm · p50 ${(p(0.5)*100).toFixed(1)}cm`
  }
  console.log(`${name.padEnd(6)} ANTES  ${stat(a2)}\n        DEPOIS ${stat(b2)}`)
}
console.log('mean total ANTES %.1f cm  DEPOIS %.1f cm', a2.mean*100, b2.mean*100)
for (const [name, fn] of Object.entries(regions)) {
  const idxs = []
  for (let v = 0; v < vcount; v++) if (fn(v)) idxs.push(v)
  const stat = (r) => {
    const arr = idxs.map(v => r.peak[v]).sort((x, y) => x - y)
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length
    return `máx ${(arr[arr.length-1]*100).toFixed(1)}cm · p50 ${(arr[Math.floor(arr.length/2)]*100).toFixed(1)}cm · média ${(mean*100).toFixed(1)}cm`
  }
  console.log(`${name.padEnd(6)} ANTES  ${stat(a)}\n        DEPOIS ${stat(b)}`)
}
console.log('mean total ANTES %.1f cm  DEPOIS %.1f cm', a.mean*100, b.mean*100)
