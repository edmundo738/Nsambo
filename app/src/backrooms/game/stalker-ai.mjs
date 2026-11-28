// NSAMBO ENGINE — stalker-ai.mjs — cérebro do STALKER (lógica pura, sem DOM/GL)
// FSM: DORMANT → ROAM → INVESTIGATE → STALK → HUNT → LOST → GONE (cooldown)
// Regras de design (diretiva 2026-11-25):
//  · determinístico com seed (mulberry32) — a mesma seed produz o mesmo comportamento
//  · o jogador nunca é "sentido" sem estímulo: audição e visão com memória que decai
//  · cooldowns entre aparições; nada de reaparecer instantâneo após o pounce
//  · sem conhecimento perfeito: a memória (lastKnown) envelhece e erra
//  · throttling por distância (LOD de IA): longe = pensar menos
import { mulberry32 } from '../engine/wfc.js'
import { losClearXZ, resolveCircleBoxes } from './occlusion.mjs'
import { CELL } from '../engine/scene.js'

export const STALKER_STATES = ['dormant', 'roam', 'investigate', 'stalk', 'hunt', 'lost', 'gone', 'apparition']

const EDGE_KEY = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a)
export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]   // cima direita baixo esquerda (linha, col)
// ↑ índice do vizinho: d=0 → (-1,0), d=1 → (0,+1), d=2 → (+1,0), d=3 → (0,-1)

export function makeSealedSet(sealedEdges) {
  return new Set((sealedEdges ?? []).map(([a, b]) => EDGE_KEY(a, b)))
}

// BFS simples — devolve o índice da próxima célula no caminho from→to (ou -1).
// pillarSet (opcional): células com coluna fina — o caminho contorna-as (a célula-alvo é exceção).
export function bfsNextStep(cells, size, fromIdx, toIdx, sealedSet, pillarSet) {
  if (fromIdx === toIdx) return toIdx
  const parent = new Int32Array(size * size).fill(-1)
  const q = [fromIdx]
  parent[fromIdx] = fromIdx
  let found = false
  for (let head = 0; head < q.length && !found; head++) {
    const i = q[head]
    const r = Math.floor(i / size), c = i % size
    for (let d = 0; d < 4; d++) {
      const nr = r + DIRS[d][0], nc = c + DIRS[d][1]
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue
      const n = nr * size + nc
      if (cells[n] !== 1) continue
      if (parent[n] !== -1) continue
      if (sealedSet && sealedSet.has(EDGE_KEY(i, n))) continue
      if (pillarSet && pillarSet.has(n) && n !== toIdx) continue
      parent[n] = i
      if (n === toIdx) { found = true; break }
      q.push(n)
    }
  }
  if (!found) return -1
  let cur = toIdx
  while (parent[cur] !== fromIdx && parent[cur] !== cur) cur = parent[cur]
  return cur
}

// alcance auditivo base (m) para um ruído 0..1 — sprint ≈ 18 m, passo ≈ 7 m, silêncio = 0
export function hearRange(noise) {
  if (noise <= 0.02) return 0
  return Math.min(22, 2.5 + noise * 15.5)
}

const BODY_RADIUS = 0.34   // mesmo raio de colisão do jogador — círculo × pilar
const LIGHT_REPEL = 0.55        // pressão luminosa que QUEBRA a aproximação (design: 50–100% a força total)
const LIGHT_HESITATE = 0.30     // hesitação — avança em rajadas curtas entre exposições
const LIGHT_POUNCE_MAX = 0.60   // acima disto o bote não acontece (o feixe forte protege ESTE momento)
const LIGHT_DECAY_TAU = 0.75    // s — persistência da reacção (histerese: não pisca de fugir/atacar)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const angDiff = (a, b) => {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

export class StalkerBrain {
  constructor({ cells, size, sealedEdges = [], seed = 1, startIdx, spawnDist = [10, 18], pillarCells = [] }) {
    this.cells = cells
    this.size = size
    this.sealed = makeSealedSet(sealedEdges)
    // pilares finos em células abertas: BFS contorna; o corpo desliza contra a caixa 0.35 m
    this.pillarSet = new Set(pillarCells)
    this.pillarBoxes = pillarCells.map((i) => {
      const cx = (i % size) * CELL + CELL / 2, cz = Math.floor(i / size) * CELL + CELL / 2
      return [cx - 0.175, cz - 0.175, cx + 0.175, cz + 0.175]
    })
    this.rand = mulberry32((seed ^ 0x9E3779B9) >>> 0)
    this.state = 'dormant'
    this.r = Math.floor(startIdx / size)
    this.c = startIdx % size
    this.cellIdx = startIdx
    this.x = (this.c + 0.5) * 3.0
    this.z = (this.r + 0.5) * 3.0
    this.yaw = this.rand() * Math.PI * 2
    this.speed = 0                    // velocidade atual (m/s) — para animação/blend
    this.targetIdx = -1
    this.pathTimer = 0                // throttle de repathing
    this.waypointPause = 0            // pausa de «espreita» entre pontos
    this.memPos = null                // [x, z] da última posição conhecida do jogador
    this.memAge = Infinity            // idade da memória (s)
    this.scanTimer = 0                // varrimento no INVESTIGATE
    this.stateTimer = 0               // temporizador genérico do estado
    this.cooldown = 0                 // pounce/vanish → tempo até voltar
    this.dormantTimer = 5 + this.rand() * 9
    this.spawnDist = spawnDist
    this.events = []                  // p.ex. ['spawn', 'sight', ...] — main.js drena
    this.huntFocus = 0                // quanto tempo a olhar para o jogador em STALK
    this.lastSight = Infinity
    this.lastHeard = Infinity
    this.confidence = 0               // 0..1 — quão «certo» está da posição
    this.distance = 999               // cache da distância ao jogador
    this.inSight = false
    // ── lanterna (L = B×C×D×O, calculado FORA pelo main.js e passado em env.light) ──
    this.lightPressure = 0            // 0..1 suavizada (histerese)
    this.retreatTarget = -1           // célula-alvo de retirada sob luz forte
    this._retreatT = 0                // tempo contínuo sob repulsão
    this._wasRepelled = false         // para emitir evento numa só descida/subida de banda
    // ── combate com a faca do jogador ──
    this.hp = 100                     // três facadas derrubam-no
    this.alive = true
    this.stunT = 0                    // atordoado (parado, sem caçar)
    this.knX = 0                      // empurrão residual da facada
    this.knZ = 0
  }

  // facada — damage em pontos; kdir = direção do empurrão (unitária no XZ)
  damage(amount, kdirX = 0, kdirZ = 0) {
    if (!this.alive || this.state === 'gone') return 'immune'
    this.hp = Math.max(0, this.hp - amount)
    const KB = 2.7
    this.knX += kdirX * KB
    this.knZ += kdirZ * KB
    this.speed = 0   // a facada para-o a meio do bote
    this.stunT = Math.max(this.stunT, 0.95)
    this.confidence = clamp(this.confidence + 0.30, 0, 1)   // a dor devolve-lhe a certeza — ele procura a fonte
    if (this.hp <= 0) {
      this.alive = false
      this.state = 'gone'             // derrubado — não volta ao quarto
      this.cooldown = 9999
      this.speed = 0
      return 'dead'
    }
    return 'stagger'
  }

  _idx(r, c) { return r * this.size + c }
  _cellOf(x, z) { return clamp(Math.floor(z / 3.0), 0, this.size - 1) * this.size + clamp(Math.floor(x / 3.0), 0, this.size - 1) }
  _posOf(i) { return [(i % this.size + 0.5) * 3.0, (Math.floor(i / this.size) + 0.5) * 3.0] }
  _distToPlayer(px, pz) { return Math.hypot(this.x - px, this.z - pz) }
  _farCellFromPlayer(px, pz, minD, maxD) {
    // escolhe célula aberta dentro da banda [minD, maxD] do jogador (determinística pela seed)
    const cand = []
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== 1) continue
      if (this.pillarSet.has(i)) continue
      const [x, z] = this._posOf(i)
      const d = Math.hypot(x - px, z - pz)
      if (d >= minD && d <= maxD) cand.push(i)
    }
    if (!cand.length) {
      // fallback: célula aberta mais distante que minD
      let best = -1, bd = -1
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i] !== 1) continue
        const [x, z] = this._posOf(i)
        const d = Math.hypot(x - px, z - pz)
        if (d > bd) { bd = d; best = i }
      }
      return best
    }
    return cand[Math.floor(this.rand() * cand.length)]
  }
  _randomOpenNear(centerIdx, radiusCells) {
    const r0 = Math.floor(centerIdx / this.size), c0 = centerIdx % this.size
    const cand = []
    for (let dr = -radiusCells; dr <= radiusCells; dr++) for (let dc = -radiusCells; dc <= radiusCells; dc++) {
      const r = r0 + dr, c = c0 + dc
      if (r < 0 || c < 0 || r >= this.size || c >= this.size) continue
      if (this.cells[this._idx(r, c)] !== 1) continue
      if (this.pillarSet.has(this._idx(r, c))) continue
      if (Math.abs(dr) + Math.abs(dc) === 0) continue
      cand.push(this._idx(r, c))
    }
    if (!cand.length) return -1
    return cand[Math.floor(this.rand() * cand.length)]
  }
  _losClear(x0, z0, x1, z1) {
    // verdade unificada: células sólidas + divisórias seladas + cantos (igual ao jogador)
    return losClearXZ({ cells: this.cells, size: this.size, sealed: this.sealed }, x0, z0, x1, z1)
  }
  _fovVisible(px, pz, dist) {
    if (dist < 2.3) return true                                   // quase encosta — sente-te
    const ang = Math.atan2(px - this.x, pz - this.z)               // atan2(x, z): 0 = +z
    // yaw do stalker: 0 = −z (convenção do jogador); frente = (sin yaw, -cos yaw)
    const fwd = Math.atan2(Math.sin(this.yaw), -Math.cos(this.yaw))
    return Math.abs(angDiff(ang, fwd)) < 0.62                      // ~71° FOV total
  }

  // env: { px, pz, noise (0..1, 0 = silêncio), time, dt }
  update(env) {
    const ev = []
    this.events = ev
    const dt = clamp(env.dt, 0.001, 0.25)   // LOD: update pode ser chamado com passo maior quando longe
    const px = env.px, pz = env.pz
    const dist = this._distToPlayer(px, pz)
    this.distance = dist
    // ── aparição na névoa: estátua imóvel à distância, encara o jogador — não reage, não age, não fere.
    //    Só o scheduler em main.js a liga e desliga (ver _apparition). ──
    if (this.state === 'apparition') {
      this.speed = 0
      const fwd = Math.atan2(px - this.x, -(pz - this.z))
      this.yaw = this._turnToward(this.yaw, fwd, 1.5 * dt)
      this.inSight = false
      return this._out()
    }
    // ── atordoado pela lâmina: imóvel, empurrão a deslizar, memória corre à mesma ──
    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt)
      this.memAge += dt
      this.lastSight += dt
      this.lastHeard += dt
      const stepX = this.knX * dt, stepZ = this.knZ * dt
      if (Math.abs(stepX) > 1e-4 || Math.abs(stepZ) > 1e-4) {
        const ni = this._cellOf(this.x + stepX, this.z + stepZ)
        if (this.cells[ni] === 1) {
          const [rx, rz] = resolveCircleBoxes(this.x + stepX, this.z + stepZ, BODY_RADIUS, this.pillarBoxes)
          this.x = rx; this.z = rz
        } else { this.knX = 0; this.knZ = 0 }
      }
      this.knX *= Math.exp(-4.2 * dt); this.knZ *= Math.exp(-4.2 * dt)
      this.speed = Math.max(0, this.speed - dt * 6)
      this.cellIdx = this._cellOf(this.x, this.z)
      this.r = Math.floor(this.cellIdx / this.size); this.c = this.cellIdx % this.size
      return this._out()
    }
    this.memAge += dt
    this.lastSight += dt
    this.lastHeard += dt

    // ── luz (lanterna) — pressão suavizada com persistência ─────────────
    const rawLight = clamp(env.light ?? 0, 0, 1)
    this.lightPressure = Math.max(rawLight, this.lightPressure * Math.exp(-dt / LIGHT_DECAY_TAU))
    if (this.lightPressure >= LIGHT_REPEL) {
      this._retreatT += dt
      if (!this._wasRepelled) { this._wasRepelled = true; this.events.push('repelled') }
    } else {
      this._retreatT = Math.max(0, this._retreatT - dt * 2)
      if (this._wasRepelled && this.lightPressure < LIGHT_HESITATE) this._wasRepelled = false
    }

    // ── cooldown pós-pounce/vanish ──────────────────────────────
    if (this.state === 'gone') {
      this.speed = 0
      this.cooldown -= dt
      if (this.cooldown <= 0) {
        // reaparece longe do jogador, determinístico
        const i = this._farCellFromPlayer(px, pz, this.spawnDist[0], this.spawnDist[1])
        if (i >= 0) {
          const [x, z] = this._posOf(i)
          this.r = Math.floor(i / this.size); this.c = i % this.size; this.cellIdx = i
          this.x = x; this.z = z
          this.memPos = null; this.memAge = Infinity; this.confidence = 0
          this.state = 'roam'
          this.stateTimer = 0
          this.targetIdx = -1
          ev.push('respawn')
        }
      }
      return this._out()
    }
    // ── dormant: ainda não despertou ─────────────────────────────
    if (this.state === 'dormant') {
      this.speed = 0
      this.dormantTimer -= dt
      if (this.dormantTimer <= 0) {
        // acorda numa célula longe do jogador
        const i = this._farCellFromPlayer(px, pz, 14, 22)
        const [x, z] = this._posOf(i)
        this.r = Math.floor(i / this.size); this.c = i % this.size; this.cellIdx = i
        this.x = x; this.z = z
        this.state = 'roam'
        ev.push('spawn')
      }
      return this._out()
    }

    // ── sentidos (visão + audição) ───────────────────────────────
    // agachado: assinatura muito menor — visão encurtada (26→15 m) e audição já multiplicada fora
    const sightRange = env.crouch ? 15 : 26
    const canSee = dist < sightRange && this._fovVisible(px, pz, dist) && this._losClear(this.x, this.z, px, pz)
    if (canSee) {
      this.memPos = [px, pz]
      this.memAge = 0
      this.lastSight = 0
      this.confidence = clamp(this.confidence + dt * 1.4, 0, 1)
    } else {
      this.confidence = clamp(this.confidence - dt * 0.25, 0, 1)
    }
    this.inSight = canSee
    // audição — ruído através de paredes é abafado
    let heardRange = hearRange(env.noise)
    if (heardRange > 0 && !this._losClear(this.x, this.z, px, pz)) heardRange *= 0.55
    const heard = heardRange > 0 && dist < heardRange
    if (heard) {
      const w = clamp(1 - dist / Math.max(1, heardRange), 0, 1) * clamp(env.noise, 0.15, 1)
      if (w > this.confidence || this.memAge > 1.2) {
        this.memPos = [px, pz]      // o ruído é uma leitura mais fresca que a memória velha
        this.memAge = 0
      }
      this.lastHeard = 0
      this.confidence = clamp(this.confidence + dt * 2.0, 0, 1)
    }

    // ── transições de topo ───────────────────────────────────────
    // visão privilegia o estado de caça quando perto
    if (canSee && dist < 17 && this.state !== 'hunt') {
      if (this.state === 'investigate') {
        this.state = 'hunt'; this.stateTimer = 0; ev.push('sight-hunt')
      } else if (this.state === 'roam' || this.state === 'lost') {
        this.state = 'stalk'; this.stateTimer = 0; this.huntFocus = 0; ev.push('sight-stalk')
      }
    } else if (heard && this.state !== 'hunt' && this.state !== 'stalk') {
      if (this.state === 'roam' || this.state === 'lost') { this.state = 'investigate'; this.stateTimer = 0; ev.push('heard') }
    }

    // ── máquina de estados ───────────────────────────────────────
    switch (this.state) {
      case 'roam': this._roam(dt, ev); break
      case 'investigate': this._investigate(dt, ev, px, pz); break
      case 'stalk': this._stalk(dt, ev, canSee, px, pz, dist); break
      case 'hunt': this._hunt(dt, ev, canSee, px, pz, dist); break
      case 'lost': this._lost(dt, ev, px, pz); break
      default: this.state = 'roam'
    }

    // pounce — contacto físico durante caça/espreita/investigação (nunca sob feixe forte)
    if (dist < 1.05 && this.lightPressure < LIGHT_POUNCE_MAX && (this.state === 'hunt' || this.state === 'stalk' || this.state === 'investigate')) {
      ev.push('pounce')
      this.state = 'gone'
      this.cooldown = 55 + this.rand() * 30
      this.speed = 0
    }
    this.cellIdx = this._cellOf(this.x, this.z)
    this.r = Math.floor(this.cellIdx / this.size); this.c = this.cellIdx % this.size
    return this._out()
  }

  _out() {
    return {
      state: this.state, x: this.x, z: this.z, yaw: this.yaw,
      speed: this.speed, distance: this.distance, inSight: this.inSight,
      confidence: this.confidence, memoryAge: this.memAge, hp: this.hp, alive: this.alive,
      events: this.events,
    }
  }

  _moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z
    const len = Math.hypot(dx, dz)
    if (len < 0.12) { this.speed = 0; return true }
    const step = Math.min(len, speed * dt)
    const [rx, rz] = resolveCircleBoxes(this.x + (dx / len) * step, this.z + (dz / len) * step, BODY_RADIUS, this.pillarBoxes)
    this.x = rx; this.z = rz
    this.speed = speed
    // face movement direction com amortecimento
    const want = Math.atan2(dx, -dz)
    this.yaw = this._turnToward(this.yaw, want, 3.2 * dt)
    return false
  }
  _turnToward(cur, want, maxStep) {
    const d = angDiff(want, cur)
    if (Math.abs(d) <= maxStep) return want
    return cur + Math.sign(d) * maxStep
  }
  // sob luz forte o predador CEDE TERRENO — retira para a célula escura mais longe do jogador
  // na banda [minD, maxD]; caminho BFS real respeitando paredes e pilares (nunca teleporta).
  _repelledMove(dt, px, pz) {
    const reachedOrMissing = this.retreatTarget < 0
    if (reachedOrMissing) {
      const d0 = this._distToPlayer(px, pz)
      // alvo ESTRITAMENTE mais longe que a posição actual (senão a fuga contorna o jogador)
      this.retreatTarget = this._farCellFromPlayer(px, pz, d0 + 1.5, d0 + 7)
      if (this.retreatTarget < 0) this.retreatTarget = this._farCellFromPlayer(px, pz, 5, 10)   // encurralado — melhor esforço
      this._retreatPickT = 0
    }
    this._retreatPickT = (this._retreatPickT ?? 0) + dt
    const [tx, tz] = this._posOf(this.retreatTarget >= 0 ? this.retreatTarget : this.cellIdx)
    const arrived = this._pathTo(tx, tz, dt, 2.15)
    const dToPlayer = this._distToPlayer(px, pz)
    if (arrived || dToPlayer > 17 || this._retreatPickT > 6.5) {
      this.retreatTarget = -1   // chegou (ou não havia rota) — novo plano quando a pressão mudar
    }
    return true
  }
  _hesitateSpeed(speed) { return this.lightPressure >= LIGHT_HESITATE ? speed * 0.55 : speed }
  _pathTo(tx, tz, dt, speed) {
    this.pathTimer -= dt
    const targetCell = this._cellOf(tx, tz)
    if (this.pathTimer <= 0 || this.targetIdx < 0) {
      this.targetIdx = targetCell
      const from = this._cellOf(this.x, this.z)
      this._next = bfsNextStep(this.cells, this.size, from, targetCell, this.sealed, this.pillarSet)
      this.pathTimer = 0.8 + this.rand() * 0.4
    }
    const next = this._next
    if (next == null || next < 0) { this.speed = 0; return true }
    const [wx, wz] = this._posOf(next)
    return this._moveToward(wx, wz, speed, dt)
  }

  _roam(dt, ev) {
    if (this.waypointPause > 0) {
      this.waypointPause -= dt
      this.speed = 0
      // parado: olhar devagar em redor
      this.yaw += Math.sin((this.stateTimer += dt) * 0.7) * 0.9 * dt
      return
    }
    if (this.targetIdx < 0) this.targetIdx = this._randomOpenNear(this._cellOf(this.x, this.z), 4)
    if (this.targetIdx < 0) { this.state = 'lost'; this.stateTimer = 0; return }
    const [tx, tz] = this._posOf(this.targetIdx)
    const arrived = this._pathTo(tx, tz, dt, 1.55)
    if (arrived) {
      this.targetIdx = -1
      this.waypointPause = 1.2 + this.rand() * 2.6
      this.stateTimer = 0
    }
  }
  _investigate(dt, ev, px = 0, pz = 0) {
    if (this.lightPressure >= LIGHT_REPEL) { this._repelledMove(dt, px, pz); return }
    if (!this.memPos) { this.state = 'roam'; return }
    const [tx, tz] = this.memPos
    const arrived = this._pathTo(tx, tz, dt, this._hesitateSpeed(2.3))
    if (arrived) {
      this.scanTimer += dt
      this.speed = 0
      this.yaw += 1.35 * dt * (Math.sin(this.scanTimer * 1.7) >= 0 ? 1 : -1)
      if (this.memAge > 6.5 || this.scanTimer > 5.0) { this.state = 'roam'; this.scanTimer = 0; this.targetIdx = -1; this.memPos = null }
    } else if (this.memAge > 9) {
      this.state = 'lost'; this.stateTimer = 0
    }
  }
  _stalk(dt, ev, canSee, px, pz, dist) {
    this.stateTimer += dt
    if (this.lightPressure >= LIGHT_REPEL) { this._repelledMove(dt, px, pz); return }
    if (canSee) {
      const dx = this.x - px, dz = this.z - pz
      const len = Math.hypot(dx, dz) || 1
      if (dist > 12) {
        this._moveToward(px, pz, this._hesitateSpeed(2.35), dt)   // aproxima até à banda (hesita sob luz)
      } else if (dist < 4.6) {
        this._moveToward(this.x + (dx / len) * 2.0, this.z + (dz / len) * 2.0, 1.7, dt)  // recua mantendo a presença
        this.yaw = this._turnToward(this.yaw, Math.atan2(px - this.x, -(pz - this.z)), 2.6 * dt)  // costas a recuar, olhar fixo na presa
      } else {
        this.speed = 0
        this.yaw = this._turnToward(this.yaw, Math.atan2(px - this.x, -(pz - this.z)), 2.2 * dt)  // encara parado
      }
      this.huntFocus += dt
      if (this.huntFocus > 3.0 && dist < 10.5) { this.state = 'hunt'; ev.push('stalk-hunt') }
    } else {
      // sem contacto visual: avança até à última posição conhecida, devagar e letal
      const target = this.memPos ?? [px, pz]
      const arrived = this._pathTo(target[0], target[1], dt, 2.6)
      if (this.memAge > 8) { this.state = 'lost'; this.stateTimer = 0 }
      else if (arrived && this.memAge > 3) { this.state = 'investigate'; this.scanTimer = 0 }
    }
  }
  _hunt(dt, ev, canSee, px, pz, dist) {
    this.stateTimer += dt
    if (this.lightPressure >= LIGHT_REPEL) { this._repelledMove(dt, px, pz); return }
    const target = canSee ? [px, pz] : (this.memPos ?? [px, pz])
    this._pathTo(target[0], target[1], dt, this._hesitateSpeed(3.55))
    if (!canSee && this.memAge > 8.5) { this.state = 'lost'; this.stateTimer = 0; ev.push('lost-trail') }
    if (this.stateTimer > 26 && !canSee) { this.state = 'lost'; this.stateTimer = 0; ev.push('lost-trail') }
  }
  _lost(dt, ev, px, pz) {
    this.stateTimer += dt
    this.speed = 0
    // vasculha a área da última posição conhecida, às cegas
    this.yaw += Math.sin(this.stateTimer * 0.9) * 1.1 * dt
    if (this.stateTimer > 9) {
      ev.push('vanish')
      this.state = 'gone'
      this.cooldown = 40 + this.rand() * 30
    }
  }
}

export function createBrain(opts) { return new StalkerBrain(opts) }
