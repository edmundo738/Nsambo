// NSAMBO ENGINE — stalker-entity.js — o stalker definitivo (white_mesh, 12 mil tris)
// Deformação 100% procedural e suave (sem poses congeladas — adeus «Minecraft»):
//   respiração do tórax · varredura lenta da cabeça · glide com bob/roll
//   passo real das pernas (faixas rígidas, ≤4°) · queda de mandíbula no hunt
//   inclinação para a presa · dissipar/afundar no sumiço
import { loadGLB } from '../engine/gltf.js'
import { StalkerBrain } from './stalker-ai.mjs'
import { recomputeNormals, recomputeTangents } from '../engine/meshmix.mjs'

const MODEL_YAW = Math.PI   // a face do white_mesh aponta +Z; o jogo encara -Z → vira 180°
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))

// faixas corporais (coordenadas locais do modelo, y em [-1, 0.956])
const BAND = {
  headTop: 0.44,     // cabeça/pescoço — varredura e inclinação
  chestLo: -0.05,    // tórax — respiração
  chestHi: 0.44,
  hipY: -0.28,       // linha da anca — passo das pernas
  neckPivot: 0.30,
}

export class StalkerEntity {
  constructor(assets, brain) {
    this.assets = assets        // { glb, rest }
    this.brain = brain
    this.rest = assets.rest     // Float32Array xyz
    this.positions = new Float32Array(this.rest)
    this.normals = new Float32Array(this.rest.length)
    this.tangents = new Float32Array((this.rest.length / 3) * 4)
    const g = assets.glb
    this.hasUV = !!(g && g.indices && g.uvs)
    this.walkDist = 0
    this.lean = 0               // inclinação hunt (rad), suavizada
    this.jawW = 0               // mandíbula aberta (0..1)
    this.sinkT = -1
    this.sinkY = 0
    this._breath = Math.random() * Math.PI * 2
    if (this.hasUV) {
      recomputeNormals(this.positions, g.indices, this.normals)
      recomputeTangents(this.positions, this.normals, g.uvs, g.indices, this.tangents)
    }
    this.present = brain.state !== 'dormant'
  }

  static async loadAssets(base) {
    const url = base + 'models/stalker.glb'
    const glb = await loadGLB(url)
    return { glb, rest: new Float32Array(glb.positions) }
  }

  spawn(brain) {
    this.brain = brain
    this.positions.set(this.rest)
    this.sinkT = -1
    this.sinkY = 0
    this.jawW = 0
    this.walkDist = 0
    this.present = brain.state !== 'dormant'
  }

  // aplica uma rotação rígida de um conjunto de vértices em torno de um eixo/pivô
  _rotBand(pos, pred, pivot, axis, ang) {
    if (Math.abs(ang) < 1e-4) return
    const c = Math.cos(ang), s = Math.sin(ang)
    const [ax, ay, az] = axis
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2]
      if (!pred(x, y, z)) continue
      let vx = x - pivot[0], vy = y - pivot[1], vz = z - pivot[2]
      // Rodrigues
      const cx = ay * vz - az * vy, cy = az * vx - ax * vz, cz = ax * vy - ay * vx
      const dot = ax * vx + ay * vy + az * vz
      const nx = vx * c + cx * s + ax * dot * (1 - c)
      const ny = vy * c + cy * s + ay * dot * (1 - c)
      const nz = vz * c + cz * s + az * dot * (1 - c)
      pos[i] = pivot[0] + nx; pos[i + 1] = pivot[1] + ny; pos[i + 2] = pivot[2] + nz
    }
  }

  update(dt, env) {
    // LOD de IA: longe (>22 m) pensa a ~7 Hz acumulando o dt
    this._aiAcc = (this._aiAcc ?? 0) + dt
    const far = this.brain.distance > 22
    if (far && this._aiAcc < 0.15) {
      const last = this._outLast ?? this._outFarLast()
      this._deform(dt, env, last, true)
      return { ...last, events: [] }
    }
    const step = this._aiAcc
    this._aiAcc = 0
    const brain = this.brain
    const out = brain.update({ ...env, dt: step })
    this._outLast = out
    const ev = out.events
    this.events = ev
    if (ev.includes('pounce') || ev.includes('vanish')) this.sinkT = 0
    if (this.sinkT >= 0) {
      this.sinkT += dt
      const k = clamp01(this.sinkT / 1.35)
      this.sinkY = -1.9 * (k * k)
      if (k >= 1) this.sinkT = -2
    } else {
      this.sinkY = 0
    }
    this.present = this.sinkT >= 0 || (out.state !== 'dormant' && out.state !== 'gone')
    this._deform(dt, env, out, false)
    return out
  }

  _deform(dt, env, out, far) {
    const time = env?.time ?? 0
    const brain = this.brain
    const speed = brain.speed
    this.walkDist += speed * dt
    const phase = (this.walkDist / 1.45) * Math.PI * 2
    const gait = smooth(clamp01(speed / 3.1))     // 0 = imóvel, 1 = a correr
    const hunting = out.state === 'hunt'
    const prowling = out.state === 'stalk'
    // inclinação: stalk espia inclinado, hunt atira-se à frente
    this.lean = damp(this.lean, hunting ? 0.24 : prowling ? 0.115 : 0.03, 2.2, dt)
    // mandíbula: abre no hunt (0.8) e espreita no stalk (0.3)
    const jawTarget = hunting ? 0.85 : prowling ? 0.30 : 0.0
    this.jawW = damp(this.jawW, jawTarget, jawTarget > this.jawW ? 0.9 : 0.4, dt)

    const rest = this.rest
    const pos = this.positions
    pos.set(rest)

    // 1) respiração torácica (lenta, ~0.28 Hz)
    this._breath += dt * 1.75
    const br = Math.sin(this._breath) * 0.028 * (1 - gait * 0.55) + Math.sin(this._breath * 0.37) * 0.008
    if (Math.abs(br) > 1e-4) {
      for (let i = 0; i < pos.length; i += 3) {
        const y = rest[i + 1]
        if (y < BAND.chestLo || y > BAND.chestHi) continue
        const w = Math.sin(((y - BAND.chestLo) / (BAND.chestHi - BAND.chestLo)) * Math.PI)
        const s = 1 + br * w
        pos[i] = rest[i] * s
        pos[i + 2] = rest[i + 2] * s
      }
    }

    // 2) passo das pernas — duas faixas rígidas, contrafase, pivot na anca
    const legAmp = 0.075 * gait
    this._rotBand(pos, (x, y) => y < BAND.hipY && x >= 0, [0.135, BAND.hipY, 0], [1, 0, 0], Math.sin(phase) * legAmp)
    this._rotBand(pos, (x, y) => y < BAND.hipY && x < 0, [-0.135, BAND.hipY, 0], [1, 0, 0], Math.sin(phase + Math.PI) * legAmp)

    // 3) inclinação do corpo inteiro para a presa (pivô na anca)
    if (this.lean > 0.001) this._rotBand(pos, () => true, [0, BAND.hipY, 0], [1, 0, 0], this.lean)

    // 4) varredura lenta da cabeça (±9° em 17 s + nod ±5° em 12 s) — nunca sincronizada
    const sway = Math.sin(time * 0.37 + 1.3) * 0.16 + Math.sin(time * 0.11) * 0.06
    const nod = Math.sin(time * 0.53 + 0.4) * 0.085
    this._rotBand(pos, (x, y) => y > BAND.headTop, [0, BAND.neckPivot, 0.04], [0, 1, 0], sway)
    this._rotBand(pos, (x, y) => y > BAND.headTop, [0, BAND.neckPivot, 0.04], [1, 0, 0], nod + this.lean * 0.55)

    // 5) mandíbula — a cunha inferior do rosto cai sobre a garganta
    if (this.jawW > 0.02) {
      const open = this.jawW * (0.16 + 0.05 * Math.sin(time * 1.1))
      this._rotBand(pos, (x, y, z) => y > 0.30 && y < 0.47 && z > 0.10 && Math.abs(x) < 0.24, [0, 0.47, 0.06], [1, 0, 0], open)
    }

    // normais/tangentes acompanham a deformação (VM-006)
    const g = this.assets.glb
    if (this.hasUV && !far) {
      recomputeNormals(this.positions, g.indices, this.normals)
      recomputeTangents(this.positions, this.normals, g.uvs, g.indices, this.tangents)
    }
  }

  _outFarLast() {
    const b = this.brain
    return {
      state: b.state, x: b.x, z: b.z, yaw: b.yaw,
      speed: b.speed, distance: b.distance, inSight: false,
      confidence: b.confidence, memoryAge: b.memAge, events: [],
    }
  }

  matrix(time) {
    const b = this.brain
    // glide orgânico: bob a cada passada + rolo subtil contra a anca
    const gait = smooth(clamp01(b.speed / 3.1))
    const phase = (this.walkDist / 1.45) * Math.PI * 2
    const bob = Math.abs(Math.sin(phase)) * 0.055 * gait
    const roll = Math.sin(phase) * 0.032 * gait
    return { x: b.x, y: 1.0 + (this.sinkY ?? 0) + bob, z: b.z, yaw: b.yaw + MODEL_YAW, roll }
  }
}
