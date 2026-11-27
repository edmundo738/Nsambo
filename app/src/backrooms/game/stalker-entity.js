// NSAMBO ENGINE — stalker-entity.js — o stalker definitivo (white_mesh, 12 mil tris, 8731 verts)
// STALKER WORK (2026-11-27): rig esquelético real + IK por passo + ragdoll — adeus faixas rígidas.
//   skinning Linear-Blend na CPU · normais/tangentes rotacionadas analiticamente (sem recompute por frame)
//   IK de dois ossos (pernas/braços) · pelve dinâmica · cabeça pot-latch no jogador · pounce/strike
//   morte = ragdoll verlet (corpo cai, nada de pose congelada) · LOD: longe desliga a pele
import { loadGLB } from '../engine/gltf.js'
import { StalkerRig } from './stalker-rig.mjs'

const MODEL_YAW = Math.PI   // a face do white_mesh aponta +Z; o jogo encara −Z → vira 180°
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smooth = (t) => t * t * (3 - 2 * t)
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

const STRIDE = 1.52          // m por passada completa (conta no walkDist)
const ENTITY_Y = 1.0         // o modelo tem a sola em y = −1.0 → sobe 1.0 para pousar no chão
const STRIKE_SECONDS = 0.9   // duração do salto de pounce para a câmara

export class StalkerEntity {
  constructor(assets, brain) {
    this.assets = assets        // { glb, rest, rig }
    this.brain = brain
    this.rest = assets.rest     // Float32Array xyz (ordem do GLB xatlas)
    this.positions = new Float32Array(this.rest)
    this.normals = new Float32Array(assets.glb.normals)
    const tv = assets.glb.tangents
    const want = (this.rest.length / 3) * 4
    this.tangents = tv && tv.length === want ? new Float32Array(tv) : (() => { const t = new Float32Array(want); for (let i = 0; i < want; i += 4) { t[i] = 1; t[i + 3] = 1 } return t })()
    this.rigData = assets.rigData
    this._buildRig()
    this.walkDist = 0
    this.lean = 0               // reservado p/ debug (lean vive no rig)
    this.jawW = 0               // espelho do jaw do rig (para debug/HUD)
    this.sinkT = -1
    this.sinkY = 0
    this.strikeT = -1           // >0 durante o strike de pounce
    this._strikeFrom = null     // { x, z }
    this._hunt01 = 0
    this._stagger = 0
    this.present = brain.state !== 'dormant'
  }

  _buildRig() {
    this.rig = new StalkerRig(this.rigData)
  }

  static async loadAssets(base) {
    const [glb, rigRes] = await Promise.all([
      loadGLB(base + 'models/stalker.glb'),
      fetch(base + 'models/stalker.rig.json'),
    ])
    if (!rigRes.ok) throw new Error('stalker.rig.json HTTP ' + rigRes.status)
    const rigData = await rigRes.json()
    return { glb, rest: new Float32Array(glb.positions), rigData }
  }

  spawn(brain) {
    this.brain = brain
    this.positions.set(this.rest)
    this.normals.set(this.assets.glb.normals)
    this._buildRig()
    this.sinkT = -1
    this.sinkY = 0
    this.strikeT = -1
    this._strikeFrom = null
    this._hunt01 = 0
    this._stagger = 0
    this.walkDist = 0
    this.jawW = 0
    this.present = brain.state !== 'dormant'
  }

  // ── combate: a lâmina ─────────────────────────────────────────
  // res 'stagger' → recúo de tronco/cabeça + braços ao ar (decai)
  stagger() { this._stagger = 1 }
  // res 'dead' → ragdoll com impulso na direção do golpe
  die(dirX = 0, dirZ = -1, strength = 4.6) {
    if (this.rig.ragdoll) return
    this.rig.die(dirX, dirZ, strength)
    this.strikeT = -1
    this.sinkT = -1
  }
  // pounce/strike: ensaio para dentro da câmara do jogador
  strike(px, pz) {
    if (this.strikeT >= 0 || !this.present) return
    this.strikeT = 0
    this._strikeFrom = { x: this.brain.x, z: this.brain.z }
    this._strikeTarget = { x: px, z: pz }
  }

  update(dt, env) {
    // LOD de IA: longe (>22 m) pensa a ~7 Hz acumulando o dt
    this._aiAcc = (this._aiAcc ?? 0) + dt
    const far = this.brain.distance > 22
    let out
    if (far && this._aiAcc < 0.15 && !this.rig.ragdoll) {
      // longe: IA acumulada — o snapshot é sintetizado do cérebro (events só no tick rico)
      const b = this.brain
      out = {
        state: b.state, x: b.x, z: b.z, yaw: b.yaw,
        speed: b.speed, distance: b.distance, inSight: false,
        confidence: b.confidence, memoryAge: b.memAge, events: [],
      }
      this.present = this.sinkT >= 0 || this.strikeT >= 0 || (out.state !== 'dormant' && out.state !== 'gone')
        || (!!this.rig.ragdoll && this.sinkT !== -2)
      this._deform(dt, env, out, true)
      return out
    }
    const step = this._aiAcc
    this._aiAcc = 0
    const brain = this.brain
    out = brain.update({ ...env, dt: step })
    const ev = out.events
    this.events = ev
    if (ev.includes('pounce')) { /* main.js chama strike() */ }
    // ── strike de pounce: o modelo lança-se para a presa ──
    if (this.strikeT >= 0) {
      this.strikeT += dt
      if (this.strikeT >= STRIKE_SECONDS) { this.strikeT = -1; if (this.sinkT < 0) this.sinkT = 0 }
    }
    this.present = this.sinkT >= 0 || this.strikeT >= 0 || (out.state !== 'dormant' && out.state !== 'gone')
      || (!!this.rig.ragdoll && this.sinkT !== -2)
    this._deform(dt, env, out, far)
    return out
  }

  _deform(dt, env, out, far) {
    const time = env?.time ?? 0
    const brain = this.brain
    const speed = brain.speed
    this.walkDist += speed * dt
    // hunt 0..1 suavizado — stalk prostrado, hunt atirado à frente
    const huntTarget = out.state === 'hunt' ? 1 : out.state === 'stalk' ? 0.35 : out.state === 'investigate' ? 0.12 : 0.06
    this._hunt01 = damp(this._hunt01, huntTarget, 2.6, dt)
    // envelope do strike (pounce): arco sin(π·u)
    let pounce01 = 0
    if (this.strikeT >= 0) pounce01 = Math.sin(clamp01(this.strikeT / STRIKE_SECONDS) * Math.PI)
    // recúo de lâmina decai sozinho no rig
    const stagger01 = this._stagger
    this._stagger = Math.max(0, this._stagger - dt * 1.35)

    // direção para a presa (ângulo de mundo do cérebro → relativo ao corpo)
    const px = env?.px ?? (brain.x + Math.sin(brain.yaw) * -1)
    const pz = env?.pz ?? (brain.z - Math.cos(brain.yaw))
    const angTo = Math.atan2(px - brain.x, -(pz - brain.z))
    const lookYaw = wrapPi(angTo - brain.yaw)
    const dx = px - brain.x, dz = pz - brain.z
    const dist = Math.hypot(dx, dz) || 1
    const headWorldY = ENTITY_Y + 0.585
    const dy = (env?.py ?? 1.62) - headWorldY
    const lookPitch = clamp01((Math.atan2(dy, dist) + 1) / 2) * 0.8 - 0.4   // −0.4..+0.4

    if (!far) {
      this.rig.update(dt, {
        dt, time,
        state: out.state,
        speed,
        walkDist: this.walkDist,
        hunt01: this._hunt01,
        pounce01,
        stagger01,
        lookYaw,
        lookPitch,
      })
      this.jawW = this.rig._jaw
      // peleja: vértices → posições/normais/tangentes
      this.rig.skin(this.rest, this.assets.glb.normals, this.tangents, this.positions, this.normals, this.tangents)
    }

    // ── afundar e sair (pounce-vanish ou ragdoll assentado) ──
    if (this.rig.ragdoll && this.rig.ragdoll.settled && this.sinkT < 0) this.sinkT = 0
    if (this.sinkT >= 0) {
      this.sinkT += dt
      const fade = this.rig.ragdoll ? 1.6 : 1.35
      const depth = this.rig.ragdoll ? 1.35 : 1.9
      const k = clamp01(this.sinkT / fade)
      this.sinkY = -depth * (k * k)
      if (k >= 1) this.sinkT = -2
    } else if (!this.rig.ragdoll) {
      this.sinkY = 0
    }
  }

  // posição/orientação da matriz-mundo do stalker
  matrix() {
    const b = this.brain
    const speed = b.speed
    const gait = smooth(clamp01(speed / 3.4))
    const phase = (this.walkDist / STRIDE) * Math.PI * 2
    const roll = Math.sin(phase) * 0.030 * gait
    // strike: interpola visualmente da origem até à presa
    let x = b.x, z = b.z, strikeLift = 0
    if (this.strikeT >= 0 && this._strikeFrom && this._strikeTarget) {
      const u = clamp01(this.strikeT / STRIKE_SECONDS)
      const e = smooth(clamp01(u * 1.35))            // arranque brusco
      const tx = this._strikeTarget.x, tz = this._strikeTarget.z
      const dx = tx - this._strikeFrom.x, dz = tz - this._strikeFrom.z
      const d = Math.hypot(dx, dz) || 1
      const stop = Math.max(0, d - 0.62)             // para a 0.62 m da presa
      x = this._strikeFrom.x + (dx / d) * stop * e
      z = this._strikeFrom.z + (dz / d) * stop * e
      strikeLift = Math.sin(u * Math.PI) * 0.16
    }
    return { x, y: ENTITY_Y + (this.sinkY ?? 0) + strikeLift, z, yaw: b.yaw + MODEL_YAW, roll: this.rig.ragdoll ? 0 : roll }
  }
}
