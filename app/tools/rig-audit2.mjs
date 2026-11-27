import { readFileSync } from 'node:fs'
const rig = JSON.parse(readFileSync('assets/models/stalker.rig.json'))
const glb = readFileSync('assets/models/stalker.glb')
const clen = glb.readUInt32LE(12)
const gjs = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
const binOff = 20 + clen + 8
const prim = gjs.meshes[0].primitives[0]
const acc = gjs.accessors[prim.attributes.POSITION]
const bv = gjs.bufferViews[acc.bufferView]
const elemBytes = 4, comps = 3
const base = binOff + bv.byteOffset + (acc.byteOffset ?? 0) + (bv.byteStride ? 0 : 0)
const stride = bv.byteStride ?? comps * elemBytes
const vcount = acc.count
const restP = new Float32Array(vcount * 3)
for (let v = 0; v < vcount; v++) {
  const o = base + v * stride
  restP[v*3] = glb.readFloatLE(o); restP[v*3+1] = glb.readFloatLE(o+4); restP[v*3+2] = glb.readFloatLE(o+8)
}
const wIdx = Buffer.from(rig.w4, 'base64'), wVal = Buffer.from(rig.v4, 'base64')
const JNAME = ['pelvis','spine1','spine2','spine3','neck','head','jaw','clavL','clavR','upperArmL','upperArmR','foreArmL','foreArmR','handL','handR','upperLegL','upperLegR','lowerLegL','lowerLegR','footL','footR']
const ARM = new Set([9,10,11,12,13,14]), LEG = new Set([15,16,17,18,19,20])
const dom = new Array(21).fill(0)
const yList = []
let armLeg = 0
let headDom = 0
let armLegYRange = [Infinity, -Infinity]
for (let v = 0; v < vcount; v++) {
  let bi = -1, bw = -1, arm = 0, leg = 0
  for (let k = 0; k < 4; k++) {
    const j = wIdx[v*4+k], w = wVal[v*4+k]
    if (ARM.has(j)) arm += w; if (LEG.has(j)) leg += w
    if (w > bw) { bw = w; bi = j }
  }
  dom[bi]++
  if (bi === 5) headDom++
  if (arm > 51 && leg > 51) {
    armLeg++
    const y = restP[v*3+1]
    yList.push(y)
    if (y < armLegYRange[0]) armLegYRange[0] = y
    if (y > armLegYRange[1]) armLegYRange[1] = y
  }
}
console.log('vértices por junta DOMINANTE (argmax):')
for (let i = 0; i < 21; i++) console.log(' ', JNAME[i].padEnd(10), String(dom[i]).padStart(5), `(${(100*dom[i]/vcount).toFixed(1)}%)`)
if (yList.length) {
  yList.sort((a,b)=>a-b)
  console.log('\nbanda vertical dos verts braço∩perna >0.2: min y=%s · max y=%s · mediana y=%s', yList[0].toFixed(3), yList[yList.length-1].toFixed(3), yList[Math.floor(yList.length/2)].toFixed(3))
}
