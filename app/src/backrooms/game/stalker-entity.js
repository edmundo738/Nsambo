// NSAMBO ENGINE — stalker-entity.js — ponte GLB↔motor: amostra poses do GLB (13 bakes),
// mistura-as no CPU por frame (idle respirar / walk cíclico / jaw aditivo) e desenha
// via renderer.updateDynamic('stalker', …). O cérebro é stalker-ai.mjs (puro).
import { loadGLB } from '../engine/gltf.js'
import { StalkerBrain } from './stalker-ai.mjs'
import { CELL } from '../engine/scene.js'
import { recomputeNormals, recomputeTangents } from '../engine/meshmix.mjs'

// o GLB (export_yup) fica virado a −Z — a convenção do jogo (yaw=0 → −Z) não precisa de rotação extra
const MODEL_YAW = 0

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smooth = (t) => t * t * (3 - 2 * t)

function mixInto(out, a, b, t) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}
function cycleSample(samples, phase) {
  const n = samples.length
  const p = ((phase % 1) + 1) % 1 * n
  const i0 = Math.floor(p) % n, i1 = (i0 + 1) % n
  return [samples[i0], samples[i1], smooth(p - Math.floor(p))]
}

export class StalkerEntity {
  constructor(assets, brain) {
    this.assets = assets        // { rest, idle[], walk[], jaw }
    this.brain = brain
    this.positions = new Float32Array(assets.rest.length)
    this.positions.set(assets.rest)
    this.normals = new Float32Array(assets.rest.length)
    this.tangents = new Float32Array((assets.rest.length / 3) * 4)
    const g = assets.glb
    if (g && g.indices && g.uvs) {
      recomputeNormals(this.positions, g.indices, this.normals)
      recomputeTangents(this.positions, this.normals, g.uvs, g.indices, this.tangents)
    }
    this.walkDist = 0
    this.jawW = 0
    this.sinkT = -1             // ≥0 durante o «desaparecimento»
    this.events = []
    this.present = brain.state !== 'dormant'
  }

  static async loadAssets(base) {
    const url = base + 'models/stalker.glb'
    const t = { rest: -1, idle: [0.0, 1.34, 2.67], walk: [], jaw: 1.55 }
    for (let i = 0; i < 8; i++) t.walk.push((i * 2.0417) / 8)
    const [rest, jaw, ...idleAndWalk] = await Promise.all([
      loadGLB(url),
      loadGLB(url, { anim: 'jaw', animTime: t.jaw }),
      ...t.idle.map((animTime) => loadGLB(url, { anim: 'idle', animTime })),
      ...t.walk.map((animTime) => loadGLB(url, { anim: 'walk', animTime })),
    ])
    return {
      glb: rest,                       // objeto GLB completo (posições/índices/uvs/normais)
      rest: rest.positions,
      idle: idleAndWalk.slice(0, 3).map((p) => p.positions),
      walk: idleAndWalk.slice(3).map((p) => p.positions),
      jaw: jaw.positions,
    }
  }

  // reposiciona o cérebro (reset de nível) mas reutiliza os bakes de pose
  spawn(brain) { this.brain = brain; this.positions.set(this.assets.rest); this.sinkT = -1; this.jawW = 0; this.walkDist = 0 }

  update(dt, env) {
    // LOD de IA: longe (>22 m) pensa a ~7 Hz acumulando o dt; perto pensa a cada frame
    this._aiAcc = (this._aiAcc ?? 0) + dt
    const far = this.brain.distance > 22
    if (far && this._aiAcc < 0.15) {
      const last = this._outLast ?? this._outFarLast()
      return { ...last, events: [] }   // sem re-disparar eventos já processados
    }
    const step = this._aiAcc
    this._aiAcc = 0
    const brain = this.brain
    const out = brain.update({ ...env, dt: step })
    this._outLast = out
    const ev = out.events
    this.events = ev
    // sumiço: entra em 'gone' por pounce ou por vanish — afundar 1.9 m em 1.35 s
    if (ev.includes('pounce') || ev.includes('vanish')) this.sinkT = 0
    if (this.sinkT >= 0) {
      this.sinkT += dt
      const k = clamp01(this.sinkT / 1.35)
      this.sinkY = -1.9 * (k * k)
      if (k >= 1) this.sinkT = -2     // terminado — não desenhar
    } else {
      this.sinkY = 0
    }
    this.present = this.sinkT >= 0 || (out.state !== 'dormant' && out.state !== 'gone')
    // ── mistura de poses ─────────────────────────────────────────
    const speed = brain.speed
    this.walkDist += speed * dt
    const walkW = smooth(clamp01(speed / 3.1))
    const tmpA = this._tmpA ?? (this._tmpA = new Float32Array(this.assets.rest.length))
    const tmpB = this._tmpB ?? (this._tmpB = new Float32Array(this.assets.rest.length))
    // idle contínuo (4 s por ciclo)
    const [i0, i1, it] = cycleSample(this.assets.idle, (env.time ?? 0) / 4.0)
    mixInto(tmpA, i0, i1, it)
    // andar cíclico (8 amostras por passada ≈ 1.45 m)
    const [w0, w1, wt] = cycleSample(this.assets.walk, this.walkDist / 1.45)
    mixInto(tmpB, w0, w1, wt)
    const pos = this.positions
    for (let i = 0; i < pos.length; i++) pos[i] = tmpA[i] * (1 - walkW) + tmpB[i] * walkW
    // mandíbula aditiva (ameaça lenta) — hunt abre fundo, stalk espreita
    const jawTarget = out.state === 'hunt' ? 0.8 : out.state === 'stalk' ? 0.3 : 0.0
    this.jawW += (jawTarget - this.jawW) * (1 - Math.exp(-(jawTarget > this.jawW ? 0.8 : 0.35) * dt))
    if (this.jawW > 0.02) {
      const breathe = 0.6 + 0.4 * Math.sin((env.time ?? 0) * 0.85)
      const a = (this.jawW * breathe)
      const rest = this.assets.rest, jaw = this.assets.jaw
      for (let i = 0; i < pos.length; i++) pos[i] += (jaw[i] - rest[i]) * a
    }
    const g = this.assets.glb
    if (g && g.indices && g.uvs) {
      // VM-006: mesma patologia dos braços — normais/tangentes acompanham a deformação
      recomputeNormals(this.positions, g.indices, this.normals)
      recomputeTangents(this.positions, this.normals, g.uvs, g.indices, this.tangents)
    }
    return out
  }

  _outFarLast() {
    // último output conhecido (ou snapshot neutro) sem correr o cérebro — o stalker corre ao longo do caminho entre pensares
    const b = this.brain
    return {
      state: b.state, x: b.x, z: b.z, yaw: b.yaw,
      speed: b.speed, distance: b.distance, inSight: false,
      confidence: b.confidence, memoryAge: b.memAge, events: [],
    }
  }

  matrix(time) {
    // pequeno balanço de cabeça/corpo já vem das poses; posição pura aqui
    const b = this.brain
    return { x: b.x, y: this.sinkY ?? 0, z: b.z, yaw: b.yaw + MODEL_YAW }
  }
}
