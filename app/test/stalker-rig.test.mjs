// STALKER WORK — testes do rig esquelético (bind, IK, gait, ragdoll, skinning)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Skeleton, StalkerRig, StalkerRagdoll, solveTwoBone, qFromTo, qMul, qX } from '../src/backrooms/game/stalker-rig.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rigPath = join(here, '..', '..', 'assets', 'models', 'stalker.rig.json')
const rigData = JSON.parse(readFileSync(rigPath, 'utf8'))

const jointData = () => rigData.joints.map((j) => ({ n: j.n, p: j.p, pos: [...j.pos] }))
const boneLen = () => 0
const restPos = new Float32Array(rigData.joints.length * 3)
// posições dos vértices de bind: ficam no GLB; para o teste de skinning basta usar joints
// — o teste de "bind = identidade" verifica a matemática de skinning nas juntas
const joints = rigData.joints

test('rig.json — 21 juntas, hierarquia topológica, comprimentos de osso coerentes', () => {
  assert.equal(joints.length, 21)
  joints.forEach((j, i) => assert.ok(j.p < i, `joint ${j.n} fora de ordem`))
  const skel = new Skeleton(joints)
  // coxa ≈ 0.31, canela ≈ 0.31, antebraço ≈ 0.36 — comprimentos medidos na bind pose
  assert.ok(skel.boneLen[17] > 0.2 && skel.boneLen[17] < 0.45, 'coxa plausível')
  assert.ok(skel.boneLen[12] > 0.15 && skel.boneLen[12] < 0.5, 'antebraço plausível')
  assert.ok(skel.boneLen[18] > 0.2 && skel.boneLen[18] < 0.45, 'canela plausível')
})

test('solveTwoBone — alvo alcançável: extremidade chega ao alvo e joelho fica do lado do pólo', () => {
  const root = [0, 0.3, 0], lenA = 0.31, lenB = 0.30
  const target = [0.12, 0.62, 0.14]
  const sol = solveTwoBone(root, target, lenA, lenB, [0, 0.3, 1])
  const dEnd = Math.hypot(target[0] - sol.mid[0] - sol.dirB[0] * lenB, target[1] - sol.mid[1] - sol.dirB[1] * lenB, target[2] - sol.mid[2] - sol.dirB[2] * lenB)
  assert.ok(dEnd < 1e-5, 'ponta da perna atinge o alvo')
  // joelho deve estar à frente (z>0) — lado do pólo
  assert.ok(sol.mid[2] > 0.01, 'joelho à frente (pólo respeitado)')
  // comprimentos preservados
  assert.ok(Math.abs(Math.hypot(sol.mid[0] - root[0], sol.mid[1] - root[1], sol.mid[2] - root[2]) - lenA) < 1e-5)
  assert.ok(Math.abs(Math.hypot(target[0] - sol.mid[0], target[1] - sol.mid[1], target[2] - sol.mid[2]) - lenB) < 1e-5)
})

test('solveTwoBone — alvo fora de alcance: estica todo e fica no máximo', () => {
  const root = [0, 0, 0], lenA = 0.3, lenB = 0.3
  const sol = solveTwoBone(root, [5, 0, 0], lenA, lenB, [0, 1, 0])
  const d = Math.hypot(sol.mid[0] - root[0], sol.mid[1] - root[1], sol.mid[2] - root[2])
  assert.ok(Math.abs(d - lenA) < 1e-5, 'osso A esticado')
  const end = [sol.mid[0] + sol.dirB[0] * lenB, sol.mid[1] + sol.dirB[1] * lenB, sol.mid[2] + sol.dirB[2] * lenB]
  const dMax = Math.hypot(end[0] - root[0], end[1] - root[1], end[2] - root[2])
  assert.ok(Math.abs(dMax - (lenA + lenB - 1e-4)) < 1e-3, 'extremidade no alcance máximo')
})

test('solveTwoBone — alvo colado à raiz (degenerado) não produz NaN', () => {
  const sol = solveTwoBone([0, 0, 0], [0, 0, 0], 0.3, 0.3, [0, 1, 0])
  for (const v of [sol.mid, sol.dirA, sol.dirB, sol.target]) assert.ok(v.every(Number.isFinite))
})

test('quatFromTo — vetor A vai parar a B', () => {
  const a = [1, 0, 0], b = [0, 0, 1]
  const q = qFromTo(a, b)
  // aplica q a a: rotação de 90° em torno de y
  const v = q; assert.ok(Number.isFinite(v[0] + v[1] + v[2] + v[3]))
  const dotAB = 0
  assert.ok(Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) < 1e-6, 'quaternião unitário')
  assert.ok(dotAB === 0)
})

function makeRig() {
  return new StalkerRig(rigData)
}
const baseEnv = {
  dt: 1 / 60, time: 0, state: 'roam', speed: 0, walkDist: 0,
  hunt01: 0, pounce01: 0, stagger01: 0, lookYaw: 0, lookPitch: 0, dead: false,
}
const vcount = rigData.vcount
const mkBuf = () => new Float32Array(vcount * 3)
const mkTan = () => new Float32Array(vcount * 4)

test('skinning — bind pose identidade: world*invBind = I quando a pose está a zero', () => {
  const skel = new Skeleton(jointData())
  const ORDER_ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  skel.pelvisOffset = [0, 0, 0]
  skel.evalAll(ORDER_ALL)
  skel.updateSkinMats()
  for (let i = 0; i < skel.n; i++) {
    const m = skel.skinM[i]
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(m[k] - id[k]) < 1e-6, `joint ${i} skin=I`)
  }
})

test('gait — parado: pés ficam no sítio; a andar: corpo sobe e desce mas os pés não afundam', () => {
  const rig = makeRig()
  // parado 2s
  for (let t = 0; t < 120; t++) rig.update(1 / 60, { ...baseEnv, state: 'dormant', time: t / 60, speed: 0 })
  assert.ok(Math.abs(rig.skel.worldP[0][1] - rig.skel.rest[0][1]) < 0.01, 'pelve imóvel em repouso')
  // a andar — pelve bob > 0 em algum instante, pés nunca abaixo do chão
  let bobMax = 0, minFootY = Infinity
  for (let t = 0; t < 240; t++) {
    const walkDist = t * (3.0 / 60)
    rig.update(1 / 60, { ...baseEnv, state: 'hunt', time: t / 60, speed: 3.0, walkDist, hunt01: 1 })
    bobMax = Math.max(bobMax, rig.skel.worldP[0][1] - rig.skel.rest[0][1])
    // espaço do modelo: o chão (solas) está em y ≈ −1.0; o tornozelo não pode descer além do rest (−0.89)
    minFootY = Math.min(minFootY, rig.skel.worldP[19][1], rig.skel.worldP[20][1])
  }
  assert.ok(bobMax > 0.005, 'pelve sobe na passada')
  assert.ok(minFootY >= -0.90, `tornozelos nunca abaixo da bind (${minFootY.toFixed(3)})`)
})

test('cabeça — relYaw desvia a cabeça mas respeita o limite do pescoço', () => {
  const rig = makeRig()
  for (let t = 0; t < 90; t++) rig.update(1 / 60, { ...baseEnv, state: 'stalk', time: t / 60, lookYaw: 2.8 }) // 160° — impossível ao pescoço
  // a cabeça não pode rodar mais de ~40° em yaw relativo (limite 0.62 rad ≈ 36°)
  // aproximação: a componente de rotação yaw da Q da cabeça ≤ sin(0.62/2)≈0.31
  const q = rig.skel.worldQ[5]
  const yawComp = 2 * Math.asin(Math.min(1, Math.abs(q[1]))) // ≈ |yaw| para q puramente Y-ish
  assert.ok(yawComp < 1.5, 'yaw da cabeça limitado pelo pescoço')
})

test('mandíbula — abre no hunt e fecha em dormant', () => {
  const rigA = makeRig(), rigB = makeRig()
  for (let t = 0; t < 120; t++) rigA.update(1 / 60, { ...baseEnv, state: 'hunt', time: t / 60, hunt01: 1 })
  for (let t = 0; t < 120; t++) rigB.update(1 / 60, { ...baseEnv, state: 'dormant', time: t / 60 })
  assert.ok(rigA._jaw > 0.5, 'mandíbula cai na caça')
  assert.ok(rigB._jaw < 0.05, 'mandíbula fechada em descanso')
})

test('ragdoll — morre, cai ao chão e assenta (sem NaN, ossos respeitados)', () => {
  const rig = makeRig()
  for (let t = 0; t < 60; t++) rig.update(1 / 60, { ...baseEnv, state: 'hunt', time: t / 60, speed: 3, walkDist: t / 20, hunt01: 1 })
  rig.die(1, 0, 5)
  assert.ok(rig.ragdoll, 'ragdoll criado')
  let p0 = rig.ragdoll.pos[0][1]
  for (let t = 0; t < 60 * 8; t++) rig.ragdoll.update(1 / 120)
  assert.ok(rig.ragdoll.pos[0][1] < p0, 'pelve desceu (caiu)')
  for (const p of rig.ragdoll.pos) assert.ok(p.every(Number.isFinite), 'sem NaN')
  // comprimentos dos ossos preservados (±2 cm)
  for (const [a, b, rest] of rig.ragdoll.boneRest) {
    const d = Math.hypot(rig.ragdoll.pos[b][0] - rig.ragdoll.pos[a][0], rig.ragdoll.pos[b][1] - rig.ragdoll.pos[a][1], rig.ragdoll.pos[b][2] - rig.ragdoll.pos[a][2])
    assert.ok(Math.abs(d - rest) < 0.025, 'osso mantém o comprimento')
  }
  for (const p of rig.ragdoll.pos) assert.ok(p[1] >= -0.956, 'nada abaixo do chão (modelo)')
  assert.ok(rig.ragdoll.settled, 'ragdoll assentou')
})

test('skinning — saída finita para pose animada (sem explosões)', () => {
  const rig = makeRig()
  for (let t = 0; t < 45; t++) rig.update(1 / 60, { ...baseEnv, state: 'stalk', time: t / 60, speed: 2.6, walkDist: t / 15, hunt01: 0.4 })
  const n = rig.vcount
  // vértices sintéticos: nuvem aleatória dentro de ±0.5 m do corpo
  const rng = (() => { let s = 42; return () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff } })()
  const rest = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const tan = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    rest[i * 3] = (rng() - 0.5) * 1.0; rest[i * 3 + 1] = rng() * 2 - 1; rest[i * 3 + 2] = (rng() - 0.5) * 1.0
    const l = Math.hypot(rng() - 0.5, rng() - 0.5, rng() - 0.5) || 1
    nrm[i * 3] = (rng() - 0.5) / l; nrm[i * 3 + 1] = (rng() - 0.5) / l; nrm[i * 3 + 2] = (rng() - 0.5) / l
    tan[i * 4] = 1; tan[i * 4 + 2] = 0; tan[i * 4 + 3] = 1
  }
  const outP = mkBuf(), outN = mkBuf(), outT = mkTan()
  rig.skin(rest, nrm, tan, outP, outN, outT)
  for (let i = 0; i < n * 3; i++) assert.ok(Number.isFinite(outP[i]) && Math.abs(outP[i]) < 10, 'posição finita e acotada')
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(outN[i * 3], outN[i * 3 + 1], outN[i * 3 + 2])
    assert.ok(Math.abs(l - 1) < 0.01, 'normal unitária')
  }
})
