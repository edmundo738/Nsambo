// NSAMBO ENGINE — stalker-rig.mjs — RIG ESQUELÉTICO + IK + RAGDOLL do stalker
// A MECÂNICA CENTRAL DO STALKER WORK (2026-11-27):
//   · esqueleto de 21 juntas extraído da própria malha (rest = pose autoral do white_mesh)
//   · skinning Linear-Blend na CPU (4 influências/vértice), normais+tangentes rotacionadas analiticamente
//   · IK de dois ossos (cosenos + pólo) para pernas e braços — cada passo calculado, joelhos adaptam-se
//   · pelve dinâmica (bob por passada, rolo, arfamento), espinha segmentada com lean de caça
//   · cabeça pot-latch para o jogador (yaw/pitch com limites + micro-saccades) — «ele vê-te»
//   · mandíbula com wobble, rajadas de fôlego em stalk, arco de pounce
//   · morte → ragdoll de verlets com constraints de osso (corpo colapsa, nada de pose congelada)
// Zero dependências — quaternions/mats próprios (column-major, estilo do motor).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const clamp01 = (v) => clamp(v, 0, 1)
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t) }
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

// ───────────────────────── quaternions (x,y,z,w) ─────────────────────────
export const qIdentity = () => [0, 0, 0, 1]
export const qNormalize = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l] }
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]]
export const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
export const qAxisAngle = (ax, ay, az, ang) => {
  const h = ang * 0.5, s = Math.sin(h)
  return qNormalize([ax * s, ay * s, az * s, Math.cos(h)])
}
export const qX = (ang) => qAxisAngle(1, 0, 0, ang)
export const qY = (ang) => qAxisAngle(0, 1, 0, ang)
export const qZ = (ang) => qAxisAngle(0, 0, 1, ang)
export const qFromTo = (a, b) => {
  let ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2]
  const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1
  ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb
  const dot = clamp(ax * bx + ay * by + az * bz, -1, 1)
  if (dot > 0.999999) return qIdentity()
  if (dot < -0.999999) {
    // antiparalelo — eixo perpendicular qualquer
    let px = Math.abs(ay) < 0.9 ? 0 : 1, py = Math.abs(ay) < 0.9 ? 1 : 0
    const cx = ay * 0 - az * py + 0, cy = az * px - ax * 0, cz = ax * py - ay * px
    return qNormalize([cx, cy, cz, 0])
  }
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
  return qNormalize([cx, cy, cz, 1 + dot])
}
const qRotateVec = (q, v) => {
  // v' = q * v * q⁻¹ (otimizado)
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1]
  const iy = w * v[1] + z * v[0] - x * v[2]
  const iz = w * v[2] + x * v[1] - y * v[0]
  const iw = -x * v[0] - y * v[1] - z * v[2]
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ]
}

// ───────────────────────── mat4 (column-major) ─────────────────────────
const mat4Translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
const mat4FromTQ = (t, q) => {
  const [x, y, z, w] = q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z
  const m = new Float32Array(16)
  m[0] = 1 - 2 * (yy + zz); m[1] = 2 * (xy + wz); m[2] = 2 * (xz - wy)
  m[4] = 2 * (xy - wz); m[5] = 1 - 2 * (xx + zz); m[6] = 2 * (yz + wx)
  m[8] = 2 * (xz + wy); m[9] = 2 * (yz - wx); m[10] = 1 - 2 * (xx + yy)
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1
  return m
}
const mat4Mul = (out, a, b) => {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  return out
}
const mat4TransformPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

// ───────────────────────── IK de dois ossos ─────────────────────────
export function solveTwoBone(root, target, lenA, lenB, pole) {
  const dx = target[0] - root[0], dy = target[1] - root[1], dz = target[2] - root[2]
  let len = Math.hypot(dx, dy, dz)
  const maxD = lenA + lenB - 1e-4, minD = Math.abs(lenA - lenB) + 1e-3
  const cl = clamp(len, minD, maxD)
  const inv = len > 1e-9 ? 1 / len : 0
  const nx = dx * inv, ny = dy * inv, nz = dz * inv
  const tc = [root[0] + nx * cl, root[1] + ny * cl, root[2] + nz * cl]
  const cosA = clamp((lenA * lenA + cl * cl - lenB * lenB) / (2 * lenA * cl), -1, 1)
  const alpha = Math.acos(cosA)
  // componente do pólo perpendicular à linha raiz→alvo
  let px = pole[0] - nx * (pole[0] * nx + pole[1] * ny + pole[2] * nz)
  let py = pole[1] - ny * (pole[0] * nx + pole[1] * ny + pole[2] * nz)
  let pz = pole[2] - nz * (pole[0] * nx + pole[1] * ny + pole[2] * nz)
  let pl = Math.hypot(px, py, pz)
  if (pl < 1e-6) {
    // pólo degenerado — perpendicular arbitrária
    px = -nz; py = 0; pz = nx; pl = Math.hypot(px, py, pz) || 1
  }
  px /= pl; py /= pl; pz /= pl
  const ca = Math.cos(alpha), sa = Math.sin(alpha)
  const dirA = [nx * ca + px * sa, ny * ca + py * sa, nz * ca + pz * sa]
  const mid = [root[0] + dirA[0] * lenA, root[1] + dirA[1] * lenA, root[2] + dirA[2] * lenA]
  const ddx = tc[0] - mid[0], ddy = tc[1] - mid[1], ddz = tc[2] - mid[2]
  const dl = Math.hypot(ddx, ddy, ddz) || 1
  return { mid, dirA, dirB: [ddx / dl, ddy / dl, ddz / dl], target: tc }
}

// rotação local que alinha o osso (na moldura do pai) à direção desejada (mundo)
const boneLocalQ = (parentWorldQ, restDir, desiredDir) => {
  const cur = qRotateVec(parentWorldQ, restDir)
  const corr = qFromTo(cur, desiredDir)
  const worldQ = qMul(corr, parentWorldQ)
  return qMul(qConj(parentWorldQ), worldQ)
}

const len3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// ───────────────────────── esqueleto ─────────────────────────
export class Skeleton {
  constructor(joints) {
    this.n = joints.length
    this.parent = joints.map((j) => j.p)
    this.rest = joints.map((j) => [j.pos[0], j.pos[1], j.pos[2]])
    this.local = joints.map((j, i) => j.p >= 0
      ? [j.pos[0] - joints[j.p].pos[0], j.pos[1] - joints[j.p].pos[1], j.pos[2] - joints[j.p].pos[2]]
      : [j.pos[0], j.pos[1], j.pos[2]])
    // inversa da bind (bind = só translação — a pose do white_mesh É a bind pose)
    this.invBind = this.rest.map((p) => mat4Translate(-p[0], -p[1], -p[2]))
    this.children = Array.from({ length: this.n }, () => [])
    for (let i = 0; i < this.n; i++) if (this.parent[i] >= 0) this.children[this.parent[i]].push(i)
    this.boneLen = this.rest.map((r, i) => (this.parent[i] >= 0 ? len3(r, this.rest[this.parent[i]]) : 0))
    // eixo de cada osso = da junta PARA O FILHO PRINCIPAL (não pai→junta!)
    const BONE_CHILD = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 7: 9, 8: 10, 9: 11, 10: 12, 11: 13, 12: 14, 15: 17, 16: 18, 17: 19, 18: 20 }
    this.boneDir = this.rest.map((r, i) => {
      const c = BONE_CHILD[i]
      if (c === undefined) return [0, 1, 0]
      const d = [this.rest[c][0] - r[0], this.rest[c][1] - r[1], this.rest[c][2] - r[2]]
      const l = Math.hypot(d[0], d[1], d[2]) || 1
      return [d[0] / l, d[1] / l, d[2] / l]
    })
    this.worldM = new Array(this.n)
    this.worldQ = new Array(this.n)
    this.worldP = new Array(this.n)
    this.skinM = new Array(this.n)
    for (let i = 0; i < this.n; i++) {
      this.worldM[i] = mat4Translate(this.rest[i][0], this.rest[i][1], this.rest[i][2])
      this.worldQ[i] = qIdentity()
      this.worldP[i] = [this.rest[i][0], this.rest[i][1], this.rest[i][2]]
      this.skinM[i] = mat4Translate(0, 0, 0)
    }
    this.localQ = new Array(this.n).fill(null).map(() => qIdentity())
    this.pelvisOffset = [0, 0, 0]
  }
  setLocalQ(i, q) { this.localQ[i] = q }
  // avalia a cadeia até à junta i (pais primeiro — a ordem de joints é topológica)
  eval(i) {
    const p = this.parent[i]
    const lt = this.local[i]
    const t = (i === 0)
      ? [lt[0] + this.pelvisOffset[0], lt[1] + this.pelvisOffset[1], lt[2] + this.pelvisOffset[2]]
      : lt
    const lq = this.localQ[i]
    if (p < 0) {
      this.worldP[i] = [t[0], t[1], t[2]]
      this.worldQ[i] = lq
      this.worldM[i] = mat4FromTQ(t, lq)
      return
    }
    this.worldP[i] = mat4TransformPoint(this.worldM[p], t[0], t[1], t[2])
    this.worldQ[i] = qMul(this.worldQ[p], lq)
    const child = mat4FromTQ(t, lq)
    this.worldM[i] = mat4Mul(new Float32Array(16), this.worldM[p], child)
  }
  evalAll(order) { for (const i of order) this.eval(i) }
  // matrizes de skinning = world * invBind (refaz só quando necessário)
  updateSkinMats() {
    for (let i = 0; i < this.n; i++) this.skinM[i] = mat4Mul(new Float32Array(16), this.worldM[i], this.invBind[i])
    return this.skinM
  }
}

// ordem topológica pensada para FK + IK em passe único
const ORDER = [0, 1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 14]
// índices: pelvis0 spine1 1 spine2 2 spine3 3 neck4 head5 jaw6 upLegL15 upLegR16 lowLegL17 lowLegR18 footL19 footR20 clavL7 clavR8 upArmL9 upArmR10 foreL11 foreR12 handL13 handR14
const IX = { pelvis: 0, spine1: 1, spine2: 2, spine3: 3, neck: 4, head: 5, jaw: 6, clavL: 7, clavR: 8, upperArmL: 9, upperArmR: 10, foreArmL: 11, foreArmR: 12, handL: 13, handR: 14, upperLegL: 15, upperLegR: 16, lowerLegL: 17, lowerLegR: 18, footL: 19, footR: 20 }

// ═════════════════════════ o rig completo ═════════════════════════
export class StalkerRig {
  constructor(rigData) {
    this.rig = rigData                    // { joints: [{n,p,pos}], vcount, w4, v4 }
    this.skel = new Skeleton(rigData.joints)
    const dec = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    this.wIdx = dec(rigData.w4)           // uint8 ×4 por vértice
    this.wVal = dec(rigData.v4)           // uint8 ×4 por vértice (0..255)
    this.vcount = rigData.vcount
    // estado animado (amortecido)
    this._jaw = 0; this._stagger = 0; this._sacca = Math.random() * 10
    this.ragdoll = null                   // StalkerRagdoll quando morto
    this.settled = false
    this._settleT = 0
  }

  static async load(url) {
    const res = await fetch(url)
    const rigData = await res.json()
    return new StalkerRig(rigData)
  }

  // ── env: { dt, time, state, speed, walkDist, hunt01, pounce01, stagger01, lookYaw, lookPitch, dead }
  update(dt, env) {
    if (this.ragdoll) {
      this.ragdoll.update(dt)
      this._ragAge = (this._ragAge ?? 0) + dt
      if (this.ragdoll.settled) this._settleT += dt
      // fallback determinístico: após 4 s de ragdoll, considera-se assentado mesmo que
      // o solver ainda respire micro-movimento (o limiar de 0.0045 nunca era atingido)
      else if (this._ragAge > 4) { this.ragdoll.settled = true; this.settled = true }
      return { phase: 0, gait: 0 }
    }
    const s = this.skel
    const speed = env.speed ?? 0
    const gait = smooth(speed / 3.4)
    const hunt01 = clamp01(env.hunt01 ?? 0)
    const pounce01 = clamp01(env.pounce01 ?? 0)
    this._stagger = Math.max(0, damp(this._stagger, env.stagger01 ?? 0, 6.5, dt))
    const stagger = this._stagger
    const phase = ((env.walkDist ?? 0) / 1.52) * Math.PI * 2
    const time = env.time ?? 0
    const state = env.state ?? 'stalk'

    // ── pelve dinâmica ──
    const bob = Math.abs(Math.cos(phase)) * 0.048 * gait
    const roll = Math.sin(phase) * 0.055 * gait
    const swayX = Math.sin(phase) * 0.045 * gait
    const yawWob = Math.sin(phase * 0.5 + 1.1) * 0.035 * gait
    const lean = 0.035 + hunt01 * 0.215 - stagger * 0.30 - pounce01 * 0.16
    s.pelvisOffset = [swayX, bob, 0]

    // ── junta a junta, em ordem ──
    const lq = s.localQ
    lq[IX.pelvis] = qMul(qY(yawWob), qMul(qX(lean * 0.42), qZ(-roll * 0.85)))
    // respiração torácica (some na corrida)
    const breath = Math.sin(time * 1.72) * 0.5 + 0.5
    const brPitch = Math.sin(time * 1.72 + 0.6) * 0.010 * (1 - gait * 0.6)
    lq[IX.spine1] = qX(lean * 0.22)
    lq[IX.spine2] = qMul(qX(lean * 0.34 + brPitch * 0.4), qZ(Math.sin(phase + 0.6) * 0.020 * gait))
    lq[IX.spine3] = qMul(qX(lean * 0.30 + brPitch), qZ(Math.sin(phase) * 0.028 * gait))
    lq[IX.neck] = qMul(qX(lean * 0.20), qZ(Math.sin(time * 0.53 + 0.4) * 0.03 * (1 - gait)))

    // ── cabeça: alvo absoluto + limites + saccades ──
    const sac = Math.sin(time * 6.7 + this._sacca) * 0.006 + Math.sin(time * 11.3 + this._sacca * 2.3) * 0.004
    const relYaw = clamp((env.lookYaw ?? 0) + sac, -0.62, 0.62)
    const relPitch = clamp((env.lookPitch ?? 0) + Math.sin(time * 9.1 + this._sacca) * 0.004, -0.34, 0.40)
    const tilt = clamp(relYaw, -1, 1) * 0.17
    const hx = -relPitch - stagger * 0.34 + pounce01 * 0.14
    lq[IX.head] = null // resolvida depois de avaliar o pescoço (absoluto)
    // placeholders FK-first para cabeça/mandíbula/clavículas — ordem topológica
    lq[IX.jaw] = qIdentity()
    lq[IX.clavL] = qMul(qY(0.05 * Math.sin(phase) * gait), qZ(-(0.028 + breath * 0.022)))
    lq[IX.clavR] = qMul(qY(-0.05 * Math.sin(phase) * gait), qZ(0.028 + breath * 0.022))

    // ── pernas: alvos de IK no espaço do modelo ──
    const ankleL = s.rest[IX.footL], ankleR = s.rest[IX.footR]
    // primeiro avalia a cadeia da pélvis até clavículas (sem pernas/braços/cabeça final)
    s.eval(IX.pelvis); s.eval(IX.spine1); s.eval(IX.spine2); s.eval(IX.spine3); s.eval(IX.neck)
    // cabeça — orientação absoluta (olhos no jogador)
    const neckWorldQ = s.worldQ[IX.neck]
    const headDesired = qMul(qY(relYaw), qMul(qX(hx), qZ(tilt)))
    lq[IX.head] = qMul(qConj(neckWorldQ), headDesired)
    s.eval(IX.head)
    // mandíbula (local, abre para baixo)
    const jawBase = state === 'hunt' ? 0.85 : state === 'stalk' ? 0.30 : state === 'lost' ? 0.18 : 0.0
    const jawTarget = Math.max(jawBase, pounce01 * 1.0, stagger > 0.25 ? 0.12 : 0)
    const rate = jawTarget > this._jaw ? 0.09 : 0.30
    this._jaw = damp(this._jaw, jawTarget, 1 / rate, dt)
    lq[IX.jaw] = qX(this._jaw * 0.42 + Math.sin(time * 1.15) * 0.022 * this._jaw)
    s.eval(IX.jaw)
    s.eval(IX.clavL); s.eval(IX.clavR)

    const solveLeg = (side) => {
      const upI = side < 0 ? IX.upperLegL : IX.upperLegR
      const loI = side < 0 ? IX.lowerLegL : IX.lowerLegR
      const ftI = side < 0 ? IX.footL : IX.footR
      const ankle = side < 0 ? ankleL : ankleR
      const sp = phase + (side < 0 ? 0 : Math.PI)
      const maxGait = gait
      const fwd = Math.sin(sp) * 0.47 * maxGait
      const lift = Math.max(0, Math.cos(sp)) * 0.165 * maxGait
      const tx = ankle[0] + side * (0.010 * gait + hunt01 * 0.012)   // arqueamento lateral ≈ bind ampliado
      const ty = ankle[1] + lift   // rest = chão do modelo (solas em y ≈ −1.0)
      const tz = ankle[2] + fwd
      const hip = mat4TransformPoint(s.worldM[IX.pelvis], s.local[upI][0], s.local[upI][1], s.local[upI][2])
      const L1 = s.boneLen[upI], L2 = s.boneLen[loI]
      // pólo = direção anatómica do joelho na bind pose — o IK reconstrói o joelho do lado certo
      const pole = [s.rest[loI][0] - s.rest[upI][0], s.rest[loI][1] - s.rest[upI][1], s.rest[loI][2] - s.rest[upI][2]]
      const sol = solveTwoBone(hip, [tx, ty, tz], L1, L2, pole)
      lq[upI] = boneLocalQ(s.worldQ[IX.pelvis], s.boneDir[upI], sol.dirA)
      s.eval(upI)
      lq[loI] = boneLocalQ(s.worldQ[upI], s.boneDir[loI], sol.dirB)
      s.eval(loI)
      // pé achatado + pitch de passada
      const footPitch = Math.sin(sp + 0.55) * 0.34 * maxGait - 0.04 + (1 - gait) * 0.0
      const desired = qMul(qY(0), qX(footPitch))
      lq[ftI] = qMul(qConj(s.worldQ[loI]), desired)
      s.eval(ftI)
    }
    solveLeg(-1); solveLeg(1)

    // ── braços: balanço contra fase + alcance de caça/pounce ──
    const solveArm = (side) => {
      const uaI = side < 0 ? IX.upperArmL : IX.upperArmR
      const faI = side < 0 ? IX.foreArmL : IX.foreArmR
      const hdI = side < 0 ? IX.handL : IX.handR
      const sp = phase + (side < 0 ? Math.PI : 0)
      const swing = Math.sin(sp) * 0.55 * gait
      const out = side * (0.13 + 0.10 * gait)
      const huntReach = hunt01 * 0.52 + pounce01 * 1.15 - stagger * 0.85
      lq[uaI] = qMul(qY(out), qX(swing + huntReach))
      s.eval(uaI)
      const bend = 0.30 + gait * (0.42 + 0.38 * Math.sin(sp + 1.15)) + hunt01 * 0.55 + pounce01 * 0.80 - stagger * 0.35
      lq[faI] = qMul(qY(side * 0.14 * gait), qX(clamp(bend, 0.08, 2.4)))
      s.eval(faI)
      lq[hdI] = qMul(qZ(-side * 0.12), qX(0.28 + 0.13 * Math.sin(sp + 0.4) * gait))
      s.eval(hdI)
    }
    solveArm(-1); solveArm(1)

    s.updateSkinMats()
    const gaitOut = gait
    return { phase, gait: gaitOut, jaw: this._jaw }
  }

  // dispara o ragdoll (morte) — pose atual congelada vira simulação verlet
  die(kbX = 0, kbZ = 0, strength = 4.2) {
    if (this.ragdoll) return
    const s = this.skel
    this.ragdoll = new StalkerRagdoll(s, kbX, kbZ, strength)
    this.settled = false
    this._settleT = 0
    this._ragAge = 0
  }

  // peleja os vértices: out* ← skinned
  skin(restPos, restNormals, restTangents, outPos, outNormals, outTangents) {
    if (this.ragdoll) this.ragdoll.writeSkin(restPos, restNormals, restTangents, outPos, outNormals, outTangents, this.vcount, this.wIdx, this.wVal)
    else this._skinWithMats(restPos, restNormals, restTangents, outPos, outNormals, outTangents, this.skel.skinM)
  }
  _skinWithMats(restPos, restNormals, restTangents, outPos, outNormals, outTangents, skinM) {
    const wIdx = this.wIdx, wVal = this.wVal
    for (let v = 0; v < this.vcount; v++) {
      const b0 = wIdx[v * 4], b1 = wIdx[v * 4 + 1], b2 = wIdx[v * 4 + 2], b3 = wIdx[v * 4 + 3]
      const w0 = wVal[v * 4] / 255, w1 = wVal[v * 4 + 1] / 255, w2 = wVal[v * 4 + 2] / 255, w3 = wVal[v * 4 + 3] / 255
      const x = restPos[v * 3], y = restPos[v * 3 + 1], z = restPos[v * 3 + 2]
      const mA = skinM[b0], mB = skinM[b1], mC = skinM[b2], mD = skinM[b3]
      let px = 0, py = 0, pz = 0
      // posição (inline — zero closures no hot path)
      px += (mA[0] * x + mA[4] * y + mA[8] * z + mA[12]) * w0 + (mB[0] * x + mB[4] * y + mB[8] * z + mB[12]) * w1 + (mC[0] * x + mC[4] * y + mC[8] * z + mC[12]) * w2 + (mD[0] * x + mD[4] * y + mD[8] * z + mD[12]) * w3
      py += (mA[1] * x + mA[5] * y + mA[9] * z + mA[13]) * w0 + (mB[1] * x + mB[5] * y + mB[9] * z + mB[13]) * w1 + (mC[1] * x + mC[5] * y + mC[9] * z + mC[13]) * w2 + (mD[1] * x + mD[5] * y + mD[9] * z + mD[13]) * w3
      pz += (mA[2] * x + mA[6] * y + mA[10] * z + mA[14]) * w0 + (mB[2] * x + mB[6] * y + mB[10] * z + mB[14]) * w1 + (mC[2] * x + mC[6] * y + mC[10] * z + mC[14]) * w2 + (mD[2] * x + mD[6] * y + mD[10] * z + mD[14]) * w3
      outPos[v * 3] = px; outPos[v * 3 + 1] = py; outPos[v * 3 + 2] = pz
      // normal
      const nx = restNormals[v * 3], ny = restNormals[v * 3 + 1], nz = restNormals[v * 3 + 2]
      let ax = 0, ay = 0, az = 0
      ax += (mA[0] * nx + mA[4] * ny + mA[8] * nz) * w0 + (mB[0] * nx + mB[4] * ny + mB[8] * nz) * w1 + (mC[0] * nx + mC[4] * ny + mC[8] * nz) * w2 + (mD[0] * nx + mD[4] * ny + mD[8] * nz) * w3
      ay += (mA[1] * nx + mA[5] * ny + mA[9] * nz) * w0 + (mB[1] * nx + mB[5] * ny + mB[9] * nz) * w1 + (mC[1] * nx + mC[5] * ny + mC[9] * nz) * w2 + (mD[1] * nx + mD[5] * ny + mD[9] * nz) * w3
      az += (mA[2] * nx + mA[6] * ny + mA[10] * nz) * w0 + (mB[2] * nx + mB[6] * ny + mB[10] * nz) * w1 + (mC[2] * nx + mC[6] * ny + mC[10] * nz) * w2 + (mD[2] * nx + mD[6] * ny + mD[10] * nz) * w3
      const nl = Math.hypot(ax, ay, az) || 1
      outNormals[v * 3] = ax / nl; outNormals[v * 3 + 1] = ay / nl; outNormals[v * 3 + 2] = az / nl
      // tangente (xyz rotacionada, w mantida)
      if (restTangents && outTangents) {
        const tx = restTangents[v * 4], ty = restTangents[v * 4 + 1], tz = restTangents[v * 4 + 2]
        let bx = 0, by = 0, bz = 0
        bx += (mA[0] * tx + mA[4] * ty + mA[8] * tz) * w0 + (mB[0] * tx + mB[4] * ty + mB[8] * tz) * w1 + (mC[0] * tx + mC[4] * ty + mC[8] * tz) * w2 + (mD[0] * tx + mD[4] * ty + mD[8] * tz) * w3
        by += (mA[1] * tx + mA[5] * ty + mA[9] * tz) * w0 + (mB[1] * tx + mB[5] * ty + mB[9] * tz) * w1 + (mC[1] * tx + mC[5] * ty + mC[9] * tz) * w2 + (mD[1] * tx + mD[5] * ty + mD[9] * tz) * w3
        bz += (mA[2] * tx + mA[6] * ty + mA[10] * tz) * w0 + (mB[2] * tx + mB[6] * ty + mB[10] * tz) * w1 + (mC[2] * tx + mC[6] * ty + mC[10] * tz) * w2 + (mD[2] * tx + mD[6] * ty + mD[10] * tz) * w3
        const bl = Math.hypot(bx, by, bz) || 1
        outTangents[v * 4] = bx / bl; outTangents[v * 4 + 1] = by / bl; outTangents[v * 4 + 2] = bz / bl
        outTangents[v * 4 + 3] = restTangents[v * 4 + 3]
      }
    }
  }
}

// ═════════════════════════ ragdoll (verlet) ═════════════════════════
export class StalkerRagdoll {
  constructor(skel, kbX, kbZ, strength = 4.2) {
    this.skel = skel
    const n = skel.n
    this.pos = new Array(n)
    this.prev = new Array(n)
    for (let i = 0; i < n; i++) {
      this.pos[i] = [...skel.worldP[i]]
      this.prev[i] = [...skel.worldP[i]]
    }
    // impulso inicial: cotovelada da lâmina + queda
    const kb = Math.hypot(kbX, kbZ) || 1
    for (let i = 0; i < n; i++) {
      const mass = i === IX.pelvis ? 1.6 : (i === IX.head ? 1.25 : 1)
      const vH = (strength / mass) * 0.0085   // passo de verlet ≈ m/s·(1/60)
      const vUp = (i === IX.pelvis ? 0.017 : 0.008) + Math.random() * 0.005
      this.prev[i][0] = this.pos[i][0] - (kbX / kb) * vH
      this.prev[i][2] = this.pos[i][2] - (kbZ / kb) * vH
      this.prev[i][1] = this.pos[i][1] - vUp
    }
    // comprimentos dos ossos AGORA (congelados)
    this.boneRest = []
    for (let i = 0; i < n; i++) {
      const p = skel.parent[i]
      if (p < 0) continue
      this.boneRest.push([p, i, len3(this.pos[p], this.pos[i])])
    }
    // frames para reconstrução de orientação (parallel transport)
    this.prevFwd = new Array(n).fill(null)
    for (let i = 0; i < n; i++) {
      const ch = skel.children[i]
      if (ch.length) {
        let mx = 0, my = 0, mz = 0
        for (const c of ch) { mx += this.pos[c][0] - this.pos[i][0]; my += this.pos[c][1] - this.pos[i][1]; mz += this.pos[c][2] - this.pos[i][2] }
        const l = Math.hypot(mx, my, mz) || 1
        this.prevFwd[i] = [mx / l, my / l, mz / l]
      }
    }
    // folhas herdam a rotação do pai — guardar a última Q para compor
    this.jointQ = skel.worldQ.map((q) => [...q])
    this.settled = false
    this._still = 0
  }
  update(dt) {
    const p = this.pos, pv = this.prev
    const n = p.length
    const dampC = 0.90
    const g = -9.81 * dt * dt
    for (let i = 0; i < n; i++) {
      const vx = (p[i][0] - pv[i][0]) * dampC
      const vy = (p[i][1] - pv[i][1]) * dampC
      const vz = (p[i][2] - pv[i][2]) * dampC
      pv[i] = [p[i][0], p[i][1], p[i][2]]
      p[i] = [p[i][0] + vx, p[i][1] + vy + g, p[i][2] + vz]
    }
    const FLOOR = -0.955   // chão no espaço do modelo (solas a −1.0; entidade repousa y=1.0)
    for (let iter = 0; iter < 3; iter++) {
      for (const [a, b, rest] of this.boneRest) {
        const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], dz = p[b][2] - p[a][2]
        const d = Math.hypot(dx, dy, dz) || 1e-9
        const diff = (d - rest) / d
        const sa = a === IX.pelvis ? 0.42 : 0.5, sb = b === IX.pelvis ? 0.42 : 0.5
        p[a][0] += dx * diff * sa; p[a][1] += dy * diff * sa; p[a][2] += dz * diff * sa
        p[b][0] -= dx * diff * sb; p[b][1] -= dy * diff * sb; p[b][2] -= dz * diff * sb
      }
      for (let i = 0; i < n; i++) {
        if (p[i][1] < FLOOR) {
          p[i][1] = FLOOR
          // atrito do chão: corta velocidade tangencial
          pv[i][0] = p[i][0] + (p[i][0] - pv[i][0]) * -0.28
          pv[i][2] = p[i][2] + (p[i][2] - pv[i][2]) * -0.28
          pv[i][1] = p[i][1]
        }
      }
    }
    // assentamento — limiar de movimento por junta e relógio de idade (um dos dois assenta)
    this.age = (this.age ?? 0) + dt
    let mv = 0
    for (let i = 0; i < n; i++) mv += Math.abs(p[i][0] - pv[i][0]) + Math.abs(p[i][1] - pv[i][1]) + Math.abs(p[i][2] - pv[i][2])
    if (mv / n < 0.02) this._still += dt; else this._still = 0
    if (this._still > 0.5 || this.age > 4) this.settled = true
    // reconstrui orientações: nós com filhos rodam por qFromTo(fwd_antiga, fwd_nova)
    const skel = this.skel
    for (let i = 0; i < n; i++) {
      const ch = skel.children[i]
      if (ch.length && this.prevFwd[i]) {
        let mx = 0, my = 0, mz = 0
        for (const c of ch) { mx += p[c][0] - p[i][0]; my += p[c][1] - p[i][1]; mz += p[c][2] - p[i][2] }
        const l = Math.hypot(mx, my, mz) || 1
        const fwd = [mx / l, my / l, mz / l]
        const dq = qFromTo(this.prevFwd[i], fwd)
        this.jointQ[i] = qNormalize(qMul(dq, this.jointQ[i]))
        // filhos folha (e cadeias) herdam o delta — propaga para todo o sub-árvore
        this._propagateDelta(i, dq)
        this.prevFwd[i] = fwd
      }
    }
    // matrizes de skinning
    const invBind = skel.invBind
    for (let i = 0; i < n; i++) {
      const wp = skel.worldP[i] = [p[i][0], p[i][1], p[i][2]]
      skel.worldQ[i] = this.jointQ[i]
      skel.worldM[i] = mat4FromTQ(wp, this.jointQ[i])
      skel.skinM[i] = mat4Mul(new Float32Array(16), skel.worldM[i], invBind[i])
    }
  }
  _propagateDelta(i, dq) {
    const skel = this.skel
    for (const c of skel.children[i]) this.jointQ[c] = qNormalize(qMul(dq, this.jointQ[c]))
  }
  writeSkin(restPos, restNormals, restTangents, outPos, outNormals, outTangents, vcount, wIdx, wVal) {
    // mesma matemática do skin normal, com as skinMats do ragdoll
    const skinM = this.skel.skinM
    for (let v = 0; v < vcount; v++) {
      const b0 = wIdx[v * 4], b1 = wIdx[v * 4 + 1], b2 = wIdx[v * 4 + 2], b3 = wIdx[v * 4 + 3]
      const w0 = wVal[v * 4] / 255, w1 = wVal[v * 4 + 1] / 255, w2 = wVal[v * 4 + 2] / 255, w3 = wVal[v * 4 + 3] / 255
      const x = restPos[v * 3], y = restPos[v * 3 + 1], z = restPos[v * 3 + 2]
      const mA = skinM[b0], mB = skinM[b1], mC = skinM[b2], mD = skinM[b3]
      let px = 0, py = 0, pz = 0
      const t = (m, w) => {
        px += (m[0] * x + m[4] * y + m[8] * z + m[12]) * w
        py += (m[1] * x + m[5] * y + m[9] * z + m[13]) * w
        pz += (m[2] * x + m[6] * y + m[10] * z + m[14]) * w
      }
      t(mA, w0); t(mB, w1); t(mC, w2); t(mD, w3)
      outPos[v * 3] = px; outPos[v * 3 + 1] = py; outPos[v * 3 + 2] = pz
      const nx = restNormals[v * 3], ny = restNormals[v * 3 + 1], nz = restNormals[v * 3 + 2]
      let ax = 0, ay = 0, az = 0
      ax += (mA[0] * nx + mA[4] * ny + mA[8] * nz) * w0 + (mB[0] * nx + mB[4] * ny + mB[8] * nz) * w1 + (mC[0] * nx + mC[4] * ny + mC[8] * nz) * w2 + (mD[0] * nx + mD[4] * ny + mD[8] * nz) * w3
      ay += (mA[1] * nx + mA[5] * ny + mA[9] * nz) * w0 + (mB[1] * nx + mB[5] * ny + mB[9] * nz) * w1 + (mC[1] * nx + mC[5] * ny + mC[9] * nz) * w2 + (mD[1] * nx + mD[5] * ny + mD[9] * nz) * w3
      az += (mA[2] * nx + mA[6] * ny + mA[10] * nz) * w0 + (mB[2] * nx + mB[6] * ny + mB[10] * nz) * w1 + (mC[2] * nx + mC[6] * ny + mC[10] * nz) * w2 + (mD[2] * nx + mD[6] * ny + mD[10] * nz) * w3
      const nl = Math.hypot(ax, ay, az) || 1
      outNormals[v * 3] = ax / nl; outNormals[v * 3 + 1] = ay / nl; outNormals[v * 3 + 2] = az / nl
      if (restTangents && outTangents) {
        const tx = restTangents[v * 4], ty = restTangents[v * 4 + 1], tz = restTangents[v * 4 + 2]
        let bx = 0, by = 0, bz = 0
        bx += (mA[0] * tx + mA[4] * ty + mA[8] * tz) * w0 + (mB[0] * tx + mB[4] * ty + mB[8] * tz) * w1 + (mC[0] * tx + mC[4] * ty + mC[8] * tz) * w2 + (mD[0] * tx + mD[4] * ty + mD[8] * tz) * w3
        by += (mA[1] * tx + mA[5] * ty + mA[9] * tz) * w0 + (mB[1] * tx + mB[5] * ty + mB[9] * tz) * w1 + (mC[1] * tx + mC[5] * ty + mC[9] * tz) * w2 + (mD[1] * tx + mD[5] * ty + mD[9] * tz) * w3
        bz += (mA[2] * tx + mA[6] * ty + mA[10] * tz) * w0 + (mB[2] * tx + mB[6] * ty + mB[10] * tz) * w1 + (mC[2] * tx + mC[6] * ty + mC[10] * tz) * w2 + (mD[2] * tx + mD[6] * ty + mD[10] * tz) * w3
        const bl = Math.hypot(bx, by, bz) || 1
        outTangents[v * 4] = bx / bl; outTangents[v * 4 + 1] = by / bl; outTangents[v * 4 + 2] = bz / bl
        outTangents[v * 4 + 3] = restTangents[v * 4 + 3]
      }
    }
  }
}
