// Edge-stretch: mede rasgões/collisões de pele comparando arestas bind vs animada
import { readFileSync } from 'fs'
import { StalkerRig } from '/home/user/Nsambo/app/src/backrooms/game/stalker-rig.mjs'
import { loadGLB } from '/home/user/Nsambo/app/src/backrooms/engine/gltf.js'
const glb = await loadGLB('data:model/gltf-binary;base64,' + readFileSync('/home/user/Nsambo/assets/models/stalker.glb').toString('base64'))
const rest = Float32Array.from(glb.positions)
const restN = Float32Array.from(glb.normals)
const restT = glb.tangents ? Float32Array.from(glb.tangents) : null
const idx = glb.indices
const vcount = glb.verts ?? rest.length / 3
// arestas únicas
const edgeSet = new Set()
const E = (a, b) => a < b ? a * vcount + b : b * vcount + a
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t], b = idx[t+1], c = idx[t+2]
  edgeSet.add(E(a, b)); edgeSet.add(E(b, c)); edgeSet.add(E(c, a))
}
// funde posições coincidentes (xatlas duplica verts em seams UV — aresta de comprimento 0
// aqui é um ARTEFACTO DE MEDIÇÃO, não rasgão de pele)
const keyOf = (v) => `${rest[v*3].toFixed(4)},${rest[v*3+1].toFixed(4)},${rest[v*3+2].toFixed(4)}`
const uniqId = new Int32Array(vcount)
let nUniq = 0
const keyMap = new Map()
for (let v = 0; v < vcount; v++) {
  const k = keyOf(v)
  let id = keyMap.get(k)
  if (id === undefined) { id = nUniq++; keyMap.set(k, id) }
  uniqId[v] = id
}
const edgesAll = [...edgeSet].map(e => [Math.floor(e / vcount), e % vcount])
const edges = []
const bindLenArr = []
for (const [a, b] of edgesAll) {
  if (uniqId[a] === uniqId[b]) continue          // aresta de comprimento zero garantido
  const len = Math.hypot(rest[a*3]-rest[b*3], rest[a*3+1]-rest[b*3+1], rest[a*3+2]-rest[b*3+2])
  if (len < 5e-4) continue
  edges.push([a, b]); bindLenArr.push(len)
}
console.log('verts únicos:', nUniq, 'de', vcount, '· arestas válidas:', edges.length, 'de', edgesAll.length)
const bindLen = new Float32Array(bindLenArr)
console.log('arestas únicas:', edges.length)
const SEQ = []
for (let t = 0; t < 1.2; t += 1/60) SEQ.push({ state: 'stalk', speed: 1.3, hunt01: 0.35, pounce01: 0, stagger01: 0, walkDist: t * 1.3, lookYaw: 0.2, lookPitch: 0.05, time: t })
for (let t = 1.2; t < 3.2; t += 1/60) SEQ.push({ state: 'hunt', speed: 3.2, hunt01: 1, pounce01: 0, stagger01: 0, walkDist: 1.56 + (t-1.2)*3.2, lookYaw: 0.0, lookPitch: 0.35, time: t })
for (let t = 3.2; t < 4.4; t += 1/60) SEQ.push({ state: 'hunt', speed: 4.3, hunt01: 1, pounce01: 0.95, stagger01: 0, walkDist: 7.96 + (t-3.2)*4.3, lookYaw: 0.3, lookPitch: 0.1, time: t })
for (let t = 4.4; t < 5.6; t += 1/60) SEQ.push({ state: 'hunt', speed: 0.4, hunt01: 0.85, pounce01: 0.1, stagger01: 0.9, walkDist: 13.1, lookYaw: -0.3, lookPitch: -0.3, time: t })
const analyze = (rigData, withDeath) => {
  const rig = new StalkerRig(rigData)
  const outP = new Float32Array(rest.length), outN = new Float32Array(restN.length)
  let worst = 0, over30 = 0, over60 = 0, frames = 0
  let diedYet = false
  for (const e of SEQ) {
    if (withDeath && e.time >= 4.4 && !diedYet) { rig.die(0.55, -0.85, 4.8); diedYet = true }
    rig.update(1/60, { dt: 1/60, state: e.state, speed: e.speed, walkDist: e.walkDist, hunt01: e.hunt01, pounce01: e.pounce01, stagger01: e.stagger01, lookYaw: e.lookYaw, lookPitch: e.lookPitch, time: e.time })
    rig.skin(rest, restN, restT, outP, outN, null)
    for (let k = 0; k < edges.length; k++) {
      const [a, b] = edges[k]
      const len = Math.hypot(outP[a*3]-outP[b*3], outP[a*3+1]-outP[b*3+1], outP[a*3+2]-outP[b*3+2])
      const r = len / bindLen[k]
      const stretch = Math.abs(r - 1)
      if (stretch > worst) worst = stretch
      if (stretch > 0.30) over30++
      if (stretch > 0.60) over60++
    }
    frames++
  }
  return { worst, over30, over60, avg: over30 / frames, avg60: over60 / frames, frames }
}
for (const [tag, file] of [['ANTES (original)', '/tmp/stalker.rig.json.bak-2026-11-27'], ['DEPOIS (re-skin v2)', '/home/user/Nsambo/assets/models/stalker.rig.json']]) {
  const rigData = JSON.parse(readFileSync(file, 'utf8'))
  for (const withDeath of [false, true]) {
    const r = analyze(rigData, withDeath)
    console.log(`${tag} ${withDeath ? 'com morte   ' : 'sem morte   '} pior ${(r.worst*100).toFixed(0)}% · arestas >30%: ${r.over30} (~${r.avg.toFixed(0)}/frame) · >60%: ${r.over60} (~${r.avg60.toFixed(0)}/frame)`)
  }
}
