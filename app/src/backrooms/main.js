// NSAMBO ENGINE — THE BACKROOMS — Lobby 0 · ponto de entrada
import { generateLevel, validateLevel, findPath, OPEN } from './engine/wfc.js'
import { buildLevelMeshes, CELL } from './engine/scene.js'
import { Renderer } from './engine/renderer.js'
import { Input } from './engine/input.js'
import { GameAudio } from './engine/audio.js'
import { Player } from './game/player.js'
import { Hud } from './game/hud.js'
import { createPuzzleState, pickKey, tryExitDoor } from './game/puzzle.js'
import { toggleFlashlight, lightIsOn } from './game/flashlight.js'
import { pickVioletPos } from './game/violet.js'
import { mat4 } from './engine/math.js'
import { LEVEL1 } from './levels/level1.js'
import { loadGLB } from './engine/gltf.js'
import { flashLocal, viewmodelProj, FLASH_TIP } from './game/viewmodel.js'

const $ = (id) => document.getElementById(id)
const params = new URLSearchParams(window.location.search)
const DEBUG = params.has('debug')
const PSX_SNAP = params.has('psx')
const NO_POM = params.has('nopom')
const FIXED_SEED = params.has('seed') ? Number(params.get('seed')) : null
const OST_ON = params.has('ost')   // OST fora do gameplay por defeito (14 s em loop, briga com o áudio sintético)
const QA_YAW = params.has('yaw') ? Number(params.get('yaw')) : null
const QA_PITCH = params.has('pitch') ? Number(params.get('pitch')) : null
const QA_AT = params.has('at') ? params.get('at').split(',').map(Number) : null
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const QA_TOPDOWN = params.has('topdown')
const QA_NOFLASH = params.has('noflash')
const QA_HASKEY = params.has('haskey')
const QA_DOOROPEN = params.has('dooropen')   // QA: porta já destravada e aberta (validação visual do vão)
const QA_PICKUP_MARKERS = params.has('pickupmarkers')   // QA: anéis debug sob os pickups — NUNCA no jogo
const QA_POWER = params.has('power')   // QA: pré-visualizar o corredor da saída com o quadro restaurado
const QA_NOWIN = params.has('nowin')   // QA: não disparar a vitória ao pisar a sala de saída (inspeção visual)
const QA_QADEATH = params.has('qadeath')     // QA: ecrã de morte após 1.5 s (validação visual)
const QA_STALKERDEMO = params.has('stalkerdemo')   // validação: stalker à frente do jogador, em espreita
const QA_STALKER_DIST = (() => { const v = parseFloat(params.get('stalkerdist') ?? ''); return Number.isFinite(v) ? v : null })()   // QA: distância-alvo do spawn do stalker
const AUTOSTART = params.has('autostart') || QA_STALKERDEMO

const EYE_FALLBACK = 1.62
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
const rotYTranslate = (x, y, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot)
  return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1])
}
const rotX = (r) => {
  const c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}
const rotZ = (r) => {
  const c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}
const scaleM = (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1])
const translateM = (x, y, z) => translation(x, y, z)
const compose = (...ms) => ms.reduce((a, b) => mat4.multiply(mat4.create(), a, b))
const transformVec = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

class Game {
  constructor(renderer) {
    this.canvas = $('gl')
    this.renderer = renderer
    this.input = new Input(this.canvas)
    this.audio = new GameAudio()
    this.hud = new Hud(LEVEL1.size)
    this.state = 'title'
    this.seed = FIXED_SEED ?? LEVEL1.seedDefault
    this.doorProgress = 0
    this.battery = 1
    this.flashlightOn = !QA_NOFLASH
    this.lowBatteryWarned = false
    this.deadToastShown = false
    this.startTime = 0
    this.playTime = 0   // só tempo a jogar (a pausa não conta)
    this.steps = 0
    this.ost = null   // trilha do título/ambiente — <audio> (m4a)
    this._stepAcc = 0
    this._armSpeed = 0
    this.stalker = null
    this.stalkerAssets = null
    this._noisePulse = 0
    this._shake = 0
    this._heartAcc = 0
    this._pushT = null
    this._prevYaw = null
    this._prevPitch = null
    this._swayX = 0
    this._swayY = 0
    this._revealAcc = 0
    this._mapAcc = 0
    this._prevKeys = new Set()
    this._loop = this._loop.bind(this)
    // mostrar semente no título
    const seedEl = $('seed-label'); if (seedEl) seedEl.textContent = `SEMENTE ${this.seed}`
    // botões
    $('btn-start')?.addEventListener('click', () => this._start())
    $('btn-resume')?.addEventListener('click', () => this._resume())
    $('btn-restart')?.addEventListener('click', () => this._restart(false))
    $('btn-newseed')?.addEventListener('click', () => this._restart(true))
    $('btn-again')?.addEventListener('click', () => this._restart(true))
    $('btn-retry')?.addEventListener('click', () => this._restart(false))
    $('btn-death-newseed')?.addEventListener('click', () => this._restart(true))
    $('btn-mute')?.addEventListener('click', () => { this.audio.setMuted(!this.audio.muted); if (this.ost) this.ost.muted = this.audio.muted; $('btn-mute').textContent = this.audio.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO' })
    const vol = $('volume'); if (vol) vol.addEventListener('input', () => { const v = Number(vol.value); this.audio.setVolume(v); if (this.ost) this.ost.volume = v * 0.35 })
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas
      if (!locked && this.state === 'playing') {
        this.state = 'paused'
        this.hud.showScreen('screen-pause')
        this.audio.suspend(); this.ost?.pause()
      } else if (locked && this.state === 'paused') {
        this.state = 'playing'
        this.hud.hideScreens()
        this.audio.resume(); if (!this.audio.muted) this.ost?.play().catch(() => {})
      }
    })
    $('btn-quit-to-title')?.addEventListener('click', () => { this.audio.setMuted(false); this.ost?.pause(); location.reload() })
    // construir o nível já — o título mostra o vazio como fundo vivo
    this.reset(this.seed)
    requestAnimationFrame(this._loop)
  }

  async _loadModels() {
    const base = import.meta.env.BASE_URL + 'models/'
    try {
      const [key, note, flash] = await Promise.all([
        loadGLB(base + 'psx_house_key.glb'),
        loadGLB(base + 'psx_torn_note_page.glb'),
        loadGLB(base + 'psx_flashlight.glb'),
      ])
      await this.renderer.setModel('flash', flash)
      await this.renderer.setModel('key', key)
      try { await this.renderer.setModel('note', note) } catch (e) { console.warn('nota rasgada não carregou — omitida:', e) }
      // adereços novos — cada um falha sozinho sem derrubar os obrigatórios
      const extras = [
        ['fuse', 'psx_fuse.glb'], ['cassette', 'psx_cassette_tape.glb'], ['crowbar', 'psx_crowbar.glb'],
        ['medkit', 'psx_medkit.glb'], ['marker', 'psx_pickup_marker.glb'], ['flashdead', 'psx_flashlight_dead.glb'],
      ]
      for (const [name, file] of extras) {
        try { await this.renderer.setModel(name, await loadGLB(base + file)) }
        catch (e) { console.warn('adereço em falta:', file, e) }
      }
      this.modelsReady = true
      console.log('modelos carregados — chave:', key.verts, 'verts /', key.tris, 'tris')
    } catch (e) {
      console.error('falha ao carregar modelos:', e)
    }
    // o stalker é opcional — o jogo corre na mesma sem ele
    try {
      this.stalkerAssets = await StalkerEntity.loadAssets(import.meta.env.BASE_URL)
      await this.renderer.setDynamicModel('stalker', this.stalkerAssets.glb)
      console.log('stalker: poses bakeadas (rest/idle×3/walk×8/jaw)')
      if (this.lvl) this._spawnStalker()
      if (QA_STALKERDEMO) this._setupStalkerDemo()
    } catch (e) {
      console.error('stalker não carregou — o jogo continua sem ele:', e)
    }
  }

  // célula aberta mais distante do spawn (determinística) — ponto de despertar
  _farthestOpenCell() {
    const lvl = this.lvl
    let best = -1, bd = -1
    for (let i = 0; i < lvl.cells.length; i++) {
      if (lvl.cells[i] !== 1) continue
      const dx = (i % lvl.size) - lvl.spawn.x, dz = Math.floor(i / lvl.size) - lvl.spawn.z
      const d = dx * dx + dz * dz
      if (d > bd) { bd = d; best = i }
    }
    return best
  }

  _spawnStalker() {
    const lvl = this.lvl
    if (!lvl || !this.stalkerAssets) return
    const brain = new StalkerBrain({
      cells: lvl.cells, size: lvl.size,
      sealedEdges: lvl.sealedEdges, seed: this.seed,
      startIdx: this._farthestOpenCell(),
    })
    this.stalker = new StalkerEntity(this.stalkerAssets, brain)
  }

  reset(seed) {
    // gerar nível (nunca falha — 300/300 sementes válidas em teste)
    let lvl = generateLevel({ seed, size: LEVEL1.size })
    if (!lvl) { seed = LEVEL1.seedDefault; this.seed = seed; lvl = generateLevel({ seed, size: LEVEL1.size }) }
    const v = validateLevel(lvl)
    if (!v.ok) console.error('nível inválido (não deveria acontecer):', v.errors)
    // ── sala de saída: a célula de saída só é acessível pela porta ──
    // sela todas as arestas da célula de saída com células abertas, menos o vão da porta
    {
      const size = lvl.size
      const exitIdx = lvl.exit.z * size + lvl.exit.x
      const path = findPath(lvl)
      const prev = path && path.length >= 2 ? path[path.length - 2] : -1
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      const extra = []
      for (const [dx, dz] of dirs) {
        const nx = lvl.exit.x + dx, nz = lvl.exit.z + dz
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue   // fora do mapa — colisão por defeito
        const ni = nz * size + nx
        if (ni === prev) continue                                    // o vão da porta fica livre
        if (lvl.cells[ni] !== OPEN) continue                         // parede já sela
        extra.push([Math.min(exitIdx, ni), Math.max(exitIdx, ni)])
      }
      if (extra.length) {
        lvl.sealedEdges = [...(lvl.sealedEdges ?? []), ...extra]
        console.log('sala de saída: arestas seladas —', extra.length)
      }
    }
    this.lvl = lvl
    this.built = buildLevelMeshes(lvl)
    this.renderer.setScene(this.built)
    if (!this._modelsStarted) { this._modelsStarted = true; this._loadModels() }
    this.player = new Player(lvl)
    // luz violeta distante — ponto médio do percurso spawn→saída
    const ex = this.built.exit, sp = lvl.spawn
    this.violetPos = pickVioletPos(lvl, CELL)   // sempre numa célula aberta
    this.puzzle = createPuzzleState()
    if (QA_HASKEY) { this.puzzle = { ...this.puzzle, hasKey: true, keyTaken: true } }
    if (QA_DOOROPEN) { this.puzzle = { ...this.puzzle, hasKey: true, keyTaken: true, doorOpen: true }; this.doorProgress = 1; if (this.player) this.player.exitBlocked = false }
    this.doorProgress = 0
    this.battery = 1
    this.flashlightOn = !QA_NOFLASH
    this.lowBatteryWarned = false
    this.deadToastShown = false
    this.steps = 0
    this._stepAcc = 0
    this.startTime = performance.now()
    this.playTime = 0
    this._keyDiscovered = false; this._reachT = null; this._keyTargeted = false; this._keyT = QA_HASKEY ? -10 : null
    // ── pickups semeáveis: escolhe células abertas por distância ao spawn ──
    this._pickupPos = (() => {
      if (!lvl || !lvl.cells) return null
      const size = lvl.size
      const sx = lvl.spawn.x, sz = lvl.spawn.z
      const reserved = new Set()
      const res = (x, z) => reserved.add(x + ',' + z)
      res(sx, sz); res(lvl.exit.x, lvl.exit.z)
      if (lvl.key) res(lvl.key.x, lvl.key.z)
      if (this.violetPos) res(Math.floor(this.violetPos[0] / CELL), Math.floor(this.violetPos[2] / CELL))
      const open = []
      for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        if (lvl.cells[z * size + x] !== 1) continue
        if (reserved.has(x + ',' + z)) continue
        const d = Math.hypot(x - sx, z - sz)
        open.push({ x, z, d })
      }
      open.sort((a, b) => a.d - b.d)
      const maxD = open.reduce((m, c) => Math.max(m, c.d), 1)
      const picked = []
      const claim = (frac) => {
        const target = maxD * frac
        let best = null, bestScore = Infinity
        for (const c of open) {
          if (picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 3.2)) continue
          const score = Math.abs(c.d - target)
          if (score < bestScore) { bestScore = score; best = c }
        }
        if (best) picked.push(best)
        return best ? { x: best.x * CELL + CELL / 2, z: best.z * CELL + CELL / 2 } : null
      }
      return {
        medkit: claim(0.22),
        cassette: claim(0.38),
        fuse: claim(0.55),
        crowbar: claim(0.68),
        flashdead: claim(0.80),
      }
    })()
    this._fuseTaken = false; this._cassetteTaken = false; this._medkitTaken = false
    this._fuseInstalled = false; this._powerOn = false; this._jumpscared = false
    if (QA_POWER) { this._fuseInstalled = true; this._powerOn = true }
    // página rasgada de lore junto ao pedestal — prop estático, sem interação
    this._noteMatrix = (() => {
      const kp = this.built?.keyPos
      if (!kp) return null
      return compose(
        translateM(kp.x + 0.46, 0.015, kp.z + 0.34),
        rotYTranslate(0, 0, 0, 0.62),
        rotX(-Math.PI / 2),
        scaleM(1.15),
      )
    })()
    this._keyAnimT = null; this._locoDist = 0; this._lastRenderT = null
    if (this._loco) { this._loco.state = 'idle'; this._loco.phase = 0; this._loco.amp = 0; this._loco.ampTarget = 0 }
    this.player?.setCrouch?.(false)
    const ci = $('crouch-ind'); if (ci) ci.classList.remove('on')
    this._dreadT = undefined
    this._prevKeys = new Set()
    this.hud.explored.clear()
    if (QA_YAW !== null) this.player.yaw = QA_YAW
    if (QA_PITCH !== null) this.player.pitch = QA_PITCH
    if (QA_AT) {
      this.player.x = QA_AT[0]; this.player.z = QA_AT[1]
      // QA-only: se teleportou para DENTRO de uma parede, volta ao spawn (o resolvedor
      // empurra para a face mais próxima, o que pode deixar o jogador preso em paredes duplas)
      const tcx = Math.floor(this.player.x / CELL), tcz = Math.floor(this.player.z / CELL)
      if (this.player.isSolid(tcx, tcz)) {
        console.warn('QA_AT dentro de célula sólida — a reverter para o spawn')
        this.player.x = lvl.spawn.x * CELL + CELL / 2; this.player.z = lvl.spawn.z * CELL + CELL / 2
      }
    }
    // câmara inicial virada para DENTRO do nível — nunca de cara para uma parede
    if (QA_YAW === null) {
      const path = findPath(lvl)
      if (path && path.length >= 2) {
        const s0 = path[0], s1 = path[1]
        const d = [(s1 % lvl.size) - (s0 % lvl.size), Math.floor(s1 / lvl.size) - Math.floor(s0 / lvl.size)]
        this.player.yaw = Math.atan2(d[0], -d[1])
      }
    }
    if (this.stalkerAssets) this._spawnStalker()   // seed nova → cérebro novo (determinístico)
    this.hud.setObjective('EXPLORE A SALA. ENCONTRE A CHAVE.')
    this.hud.setKey(false)
    this.hud.setBattery(1)
    this.hud.setStamina(1, false)
    this.hud.toast('NÃO HÁ JANELAS. NÃO HÁ PORTAS. HÁ APENAS ISTO.', 4.5)
    if (DEBUG) {
      console.log('nível válido:', v.ok, '· seed:', seed, '· abertas:', lvl.openCount, '· maxDist:', lvl.maxDist, '· selos:', lvl.sealedEdges.length, '· pilares:', lvl.pillars)
    }
  }

  _setupStalkerDemo() {
    if (!this.stalker) return
    // projeta à frente do jogador (yaw inicial 0.75π) e cria espreita garantida
    const p = this.player
    const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw)
    const CELL_ = 3.0
    let best = null, bestScore = Infinity
    for (let cz = 0; cz < this.lvl.size; cz++) for (let cx = 0; cx < this.lvl.size; cx++) {
      if (this.lvl.cells[cz * this.lvl.size + cx] !== 1) continue
      const wx = cx * CELL_ + CELL_ / 2, wz = cz * CELL_ + CELL_ / 2
      const dx = wx - p.x, dz = wz - p.z
      const dist = Math.hypot(dx, dz)
      const target = QA_STALKER_DIST ?? 6.0
      const band = QA_STALKER_DIST ? 1.6 : 3.5
      if (dist < target - band || dist > target + band) continue
      if (!this.player.hasLineOfSight(p.x, p.z, wx, wz)) continue   // à vista — validação justa
      const ang = Math.abs(Math.atan2(dx, -dz) - p.yaw)   // angular diff (wrap feito no cérebro)
      const score = Math.abs(dist - target) * 0.25 + Math.abs(ang)
      if (score < bestScore) { bestScore = score; best = { cx, cz, wx, wz } }
    }
    if (!best) return
    const b = this.stalker.brain
    b.x = best.wx; b.z = best.wz
    b.r = best.cz; b.c = best.cx; b.cellIdx = best.cz * this.lvl.size + best.cx
    b.state = 'stalk'
    b.dormantTimer = 0
    b.memPos = [p.x, p.z]
    b.memAge = 0
    b.yaw = Math.atan2(p.x - b.x, -(p.z - b.z))
    console.log('[stalkerdemo] stalker em espreita a', Math.hypot(best.wx - p.x, best.wz - p.z).toFixed(1), 'm')
  }

  _start() {
    this.audio.ensure()
    this.audio.startAmbience()
    if (OST_ON && !this.ost) {
      this.ost = new Audio(import.meta.env.BASE_URL + 'ost/over-the-radio.m4a')
      this.ost.loop = true
      this.ost.preload = 'auto'
      this.ost.volume = 0.28
    }
    this.ost?.play().catch(() => { /* sem gesto ainda — fica em silêncio */ })
    this.reset(this.seed)
    this.state = 'playing'
    this.hud.hideScreens()
    if (QA_STALKERDEMO) this._setupStalkerDemo()
    try { this.input.requestLock() } catch { /* headless sem lock */ }
  }

  _resume() {
    this.audio.uiTick()
    this.input.requestLock()
    // o handler de pointerlockchange muda o estado para 'playing'
  }

  _restart(newSeed) {
    this.audio.uiTick()
    if (this.ost && this.ost.paused) this.ost.play().catch(() => {})
    this.seed = newSeed ? ((Math.random() * 1e9) | 0) : this.seed
    this.reset(this.seed)
    this.state = 'playing'
    this.hud.hideScreens()
    try { this.input.requestLock() } catch { /* headless sem lock */ }
  }

  _loop(t) {
    requestAnimationFrame(this._loop)
    const dt = Math.min(0.05, this._last ? (t - this._last) / 1000 : 0.016)
    this._last = t
    this.frameCount = (this.frameCount ?? 0) + 1
    // métricas completas (só lidas com ?debug): buffer de tempos de quadro em ms
    const FRN = 2048
    if (!this._ftRing) { this._ftRing = new Float32Array(FRN); this._ftLen = 0; this._ftIdx = 0; this._ftMax = 0 }
    this._ftRing[this._ftIdx] = dt * 1000
    this._ftMax = Math.max(this._ftMax, dt * 1000)
    this._ftIdx = (this._ftIdx + 1) % FRN
    this._ftLen = Math.min(this._ftLen + 1, FRN)
    this._fpsFrames = (this._fpsFrames ?? 0) + 1
    this._fpsTime = (this._fpsTime ?? 0) + dt
    if (this._fpsTime >= 0.5) {
      this.renderer.fps = this._fpsFrames / this._fpsTime
      this._fpsFrames = 0; this._fpsTime = 0
      const dbg = $('debug')
      if (DEBUG && dbg) {
        const a = [...this._ftRing.subarray(0, this._ftLen)].sort((x, y) => x - y)
        const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
        let over16 = 0, over33 = 0
        for (const v of a) { if (v > 33.33) over33++; else if (v > 16.67) over16++ }
        dbg.textContent = `${this.renderer.fps.toFixed(0)} FPS · p95 ${q(0.95).toFixed(1)}ms · p99 ${q(0.99).toFixed(1)}ms · máx ${this._ftMax.toFixed(1)}ms · >16.7:${over16} >33.3:${over33} · SEED ${this.lvl?.seed} · ABC ${this.lvl?.openCount} · MDF ${this.lvl?.maxDist} · ST ${this.stalker?.brain.state ?? '—'} ${this.stalker ? this.stalker.brain.distance.toFixed(1) + 'm' : ''}`
        this._ftMax = 0
      }
    }
    if (this.state === 'playing') this._update(dt, t / 1000)
    this._render(t / 1000)
  }

  _update(dt, time) {
    const player = this.player, lvl = this.lvl, built = this.built
    this.playTime += dt
    const cam = player.update(dt, this.input)
    // passos
    this._stepAcc += cam.stepped
    this._locoDist = cam.stepped ?? 0
    const speedTarget = cam.sprinting ? 3.0 : cam.moving ? 1.5 : 0
    this._armSpeed += (speedTarget - this._armSpeed) * (1 - Math.exp(-6 * dt))
    if (this._prevYaw !== null) {
      const dy = this.player.yaw - this._prevYaw, dp = this.player.pitch - this._prevPitch
      this._swayX += ((-dy * 1.35) - this._swayX) * (1 - Math.exp(-8 * dt))
      this._swayY += ((dp * 1.1) - this._swayY) * (1 - Math.exp(-8 * dt))
      this._swayX = Math.max(-0.06, Math.min(0.06, this._swayX))
      this._swayY = Math.max(-0.05, Math.min(0.05, this._swayY))
    }
    this._prevYaw = this.player.yaw; this._prevPitch = this.player.pitch
    if (this._stepAcc > (cam.sprinting ? 1.7 : 2.3)) {
      this._stepAcc = 0
      this.steps++
      this.audio.footstep(cam.sprinting)
    }
    // ── o stalker — ouve, vê, lembra, decai ───────────────────────
    if (this._noisePulse > 0) this._noisePulse = Math.max(0, this._noisePulse - dt / 2.4)
    const crouchNoise = this.player.crouch ? 0.38 : 1
    const noiseNow = Math.max(cam.moving ? (cam.sprinting ? 1.0 : 0.42) * crouchNoise : 0, this._noisePulse)
    if (this.stalker) {
      const s = this.stalker.update(dt, { dt, px: cam.eyeX, pz: cam.eyeZ, noise: noiseNow, time, crouch: this.player.crouch })
      const creepable = s.state !== 'dormant' && s.state !== 'gone'
      this.audio.setStalkerBreath(creepable ? Math.max(0, Math.min(1, 1.35 - s.distance / 9.5)) : 0)
      for (const ev of s.events) this._onStalkerEvent(ev)
      if (s.state === 'hunt') {
        this._heartAcc += dt
        if (this._heartAcc > 0.66) { this._heartAcc = 0; this.audio.heartThump() }
      } else this._heartAcc = 0.34
    }
    // tremor da câmara (pounce)
    if (this._shake > 0) this._shake = Math.max(0, this._shake - dt * 1.4)
    // dirigismo sonoro: a cada ~45–80 s um acorde distante de desassossego — nunca durante a caça
    this._dreadT = (this._dreadT ?? (24 + Math.random() * 20)) - dt
    if (this._dreadT <= 0) {
      this._dreadT = 42 + Math.random() * 38
      if (!this.stalker || this.stalker.brain?.state !== 'hunt') this.audio.dreadSting(0.5 + Math.random() * 0.4)
    }
    // bateria da lanterna
    if (this.flashlightOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt / LEVEL1.batterySeconds)
      if (this.battery < 0.2 && !this.lowBatteryWarned) {
        this.lowBatteryWarned = true
        this.hud.toast('A LANTERNA ESTÁ A MORRER')
      }
      if (this.battery === 0) {
        this.flashlightOn = false
        this.hud.toast('A LANTERNA MORREU')
      }
    }
    // interações — arestas de tecla
    const pressed = (code) => this.input.isDown(code) && !this._prevKeys.has(code)
    if (pressed('KeyF')) {
      const r = toggleFlashlight(this.flashlightOn, this.battery)
      this.flashlightOn = r.on
      if (r.denied) this.hud.toast('SEM BATERIA')
      this.audio.click(this.flashlightOn)
      this.hud.setBattery(this.battery)
    }
    if (pressed('KeyM')) { this.hud.toggleMinimap(); this.audio.uiTick() }
    if (pressed('KeyC') && this.state === 'playing') {
      this.player.setCrouch(!this.player.crouch)
      const el = $('crouch-ind'); if (el) el.classList.toggle('on', this.player.crouch)
      this.audio.uiTick()
    }
    // alvo de interação — raycast do centro da câmara (alcance curto, esfera r=0.42)
    const px = cam.eyeX, pz = cam.eyeZ
    const eyeY = cam.eyeY ?? EYE_FALLBACK
    const look = player.lookDir()
    const raySphere = (cx, cy, cz, radius, range) => {
      const dx = cx - px, dy = cy - eyeY, dz = cz - pz
      const t = dx * look[0] + dy * look[1] + dz * look[2]
      if (t < 0 || t > range) return false
      const qx = px + look[0] * t - cx, qy = eyeY + look[1] * t - cy, qz = pz + look[2] * t - cz
      return (qx * qx + qy * qy + qz * qz) < radius * radius
    }
    let prompt = null, target = null
    if (!this.puzzle.keyTaken && built.keyPos) {
      if (raySphere(built.keyPos.x, built.keyPos.y + 0.07, built.keyPos.z, 0.46, 2.5) &&
          player.hasLineOfSight(px, pz, built.keyPos.x, built.keyPos.z)) {
        prompt = '[E] APANHAR A CHAVE'; target = 'key'
      }
    }
    const ddx = built.door.x - px, ddz = built.door.z - pz
    const doorDist = Math.hypot(ddx, ddz)
    const lookH = Math.hypot(look[0], look[2]) || 1   // look vem escalado por cos(pitch) — normalizar no plano
    const doorCos = doorDist > 0.9 ? (ddx * look[0] + ddz * look[2]) / (doorDist * lookH) : 1
    if (!this.puzzle.doorOpen && doorDist < 3.6 && doorCos > 0.35 && player.hasLineOfSight(px, pz, built.door.x, built.door.z, player.exitIdx)) {
      prompt = this.puzzle.hasKey ? '[E] ABRIR A SAÍDA' : 'PORTA TRANCADA'
      target = 'door'
    }
    // ── pickups e quadro elétrico ──
    const pickups = this._pickupPos
    const notePos = built?.keyPos ? { x: built.keyPos.x + 0.46, z: built.keyPos.z + 0.34 } : null
    if (!target && pickups) {
      const candidates = [
        { id: 'medkit', pos: pickups.medkit, r: 0.62, ok: !this._medkitTaken, prompt: '[E] USAR O KIT DE PRIMEIROS SOCORROS' },
        { id: 'fuse', pos: pickups.fuse, r: 0.56, ok: !this._fuseTaken, prompt: '[E] APANHAR O FUSÍVEL' },
        { id: 'cassette', pos: pickups.cassette, r: 0.56, ok: !this._cassetteTaken, prompt: '[E] EXAMINAR A CASSETE' },
        { id: 'crowbar', pos: pickups.crowbar, r: 0.62, ok: true, prompt: '[E] EXAMINAR O PÉ-DE-CABRA' },
        { id: 'flashdead', pos: pickups.flashdead, r: 0.62, ok: true, prompt: '[E] EXAMINAR A LANTERNA VELHA' },
        { id: 'note', pos: notePos, r: 0.62, ok: true, prompt: '[E] LER A NOTA' },
        { id: 'fusebox', pos: built.fusebox ? { x: built.fusebox.x, z: built.fusebox.z } : null, r: 0.85, ok: !this._fuseInstalled,
          prompt: this._fuseTaken ? '[E] INSTALAR O FUSÍVEL' : '[E] EXAMINAR O QUADRO ELÉTRICO' },
      ]
      for (const c of candidates) {
        if (!c.ok || !c.pos) continue
        if (raySphere(c.pos.x, c.pos.y ?? 0.35, c.pos.z, c.r, 2.4)) {
          prompt = c.prompt; target = c.id; break
        }
      }
    }
    this._keyTargeted = target === 'key'
    const chEl = $('crosshair'); if (chEl) chEl.classList.toggle('active', !!target)
    this.hud.prompt(prompt)
    if (pressed('KeyE')) {
      if (target === 'key') {
        // o GESTO começa já; a posse só é confirmada no contacto (ver bloco abaixo)
        if (this._keyAnimT == null) { this._reachT = time; this._keyAnimT = time }
      } else if (target === 'medkit') {
        this._medkitTaken = true
        this.player.stamina = 1; this.player.exhausted = false
        this.hud.toast('PRIMEIROS SOCORROS — O FÔLEGO VOLTOU', 2.6)
        this.audio.uiTick()
      } else if (target === 'fuse') {
        this._fuseTaken = true
        this.hud.toast('FUSÍVEL ADQUIRIDO — 30A / 250V', 2.6)
        this.audio.keyPickup()
      } else if (target === 'cassette') {
        this._cassetteTaken = true
        this.hud.toast('CASSETE — «EU ACENDI O QUADRO DO FUNDO. A LUZ PERTO DA SAÍDA SEMPRE VOLTA. NÃO DEIXES O ESCURO TE ENGOLIR.»', 5.2)
        this.audio.uiTick()
      } else if (target === 'flashdead') {
        this.hud.toast('LANTERNA VELHA — PILHAS GASTAS. O ANTERIOR A TI TAMBÉM TINHA MEDO DO ESCURO.', 4.2)
        this.audio.uiTick()
      } else if (target === 'crowbar') {
        this.hud.toast('PÉ-DE-CABRA — RISCOS IDÊNTICOS NO CHÃO POR TODO O MAZE. MUITO ANTIGOS.', 4.0)
        this.audio.uiTick()
      } else if (target === 'note') {
        this.hud.toast('NOTA — «NÃO CONFIES NA ESCURIDÃO. O DOURADO CHAMA.»', 4.0)
        this.audio.uiTick()
      } else if (target === 'fusebox') {
        if (this._fuseTaken) {
          this._fuseInstalled = true; this._powerOn = true
          this.hud.toast('O QUADRO ZUNE — ALGO ACENDEU NO FUNDO DO MAZE', 3.6)
          this.audio.ballastBuzz()
          this.audio.doorUnlock()
        } else {
          this.hud.toast('QUADRO ELÉTRICO — VAZIO. FALTA UM FUSÍVEL 30A.', 3.2)
          this.audio.uiTick()
        }
      } else if (target === 'door') {
        const { state, result } = tryExitDoor(this.puzzle)
        this._noisePulse = Math.max(this._noisePulse, 0.85)
        this.puzzle = state
        this._noisePulse = 1.0
        if (result === 'unlocked') {
          this.audio.doorUnlock()
          this.hud.toast('A PORTA CEDE', 2.6)
          this.hud.setObjective('SAIA.')
          this.player.exitBlocked = false
        } else if (result === 'locked') {
          this.audio.doorLocked()
          this.hud.toast('TRANCADA — FALTA ALGO', 2.4)
        }
      }
    }
    // sequência da chave: aproximação → contacto (≈0.18 s) → pega → posse.
    // A chave só passa para a palma quando os dedos fecham — não no momento do press.
    if (this._keyAnimT != null && !this.puzzle.keyTaken && time - this._keyAnimT >= 0.18) {
      this.puzzle = pickKey(this.puzzle)
      this._keyT = time
      this.audio.keyPickup()
      this.hud.toast('CHAVE ADQUIRIDA — ELA PESA DEMAIS', 3.2)
      this.hud.setKey(true)
      this.hud.setObjective('A CHAVE CANTA. ENCONTRE A SAÍDA.')
      this._keyAnimT = null
    }
    this._prevKeys.clear(); for (const k of this.input.keys) this._prevKeys.add(k)   // sem alocar por frame
    // animação da porta (desliza para dentro da parede)
    if (this.puzzle.doorOpen && this._pushT === null) this._pushT = time
    if (this.puzzle.doorOpen && this.doorProgress < 1) {
      this.doorProgress = Math.min(1, this.doorProgress + dt / 1.6)
    }
    // vitória — pisar a célula de saída
    if (this.puzzle.doorOpen && !QA_NOWIN) {
      const c = player.currentCell()
      if (c.x === lvl.exit.x && c.z === lvl.exit.z) this._win()
    }
    // minimapa reveal
    this._revealAcc += dt
    if (this._revealAcc > 0.4) {
      this._revealAcc = 0
      const c = player.currentCell()
      this.hud.revealAround(lvl.size, c.x, c.z, 3.6)
    }
    this._mapAcc += dt
    if (this._mapAcc > 0.25 && this.hud.minimapOn) {
      this._mapAcc = 0
      this.hud.drawMinimap(lvl, player, {
        showKey: this.puzzle.hasKey || this._keyDiscovered,
        showExit: this.puzzle.hasKey,
      })
    }
    // chave descoberta quando perto
    if (!this._keyDiscovered && built.keyPos) {
      if (Math.hypot(built.keyPos.x - px, built.keyPos.z - pz) < 6) this._keyDiscovered = true
    }
    // HUD
    this.hud.setStamina(player.stamina, player.exhausted)
    this.hud.setBattery(this.battery)
    this.audio.update(dt)
  }

  _onStalkerEvent(ev) {
    switch (ev) {
      case 'spawn': case 'respawn': this.audio.stalkerMurmur(0.5); break
      case 'heard': this.audio.stalkerMurmur(0.34); break
      case 'sight-stalk': this.audio.stalkerSting(0.5); break
      case 'sight-hunt': case 'stalk-hunt':
        this.audio.stalkerSting(1.0)
        this._jumpscared = true
        break
      case 'pounce':
        this._die('ELE VIU VOCÊ.')
        break
      case 'vanish': this.audio.stalkerVanish(); break
      case 'lost-trail': break   // silêncio — ele perdeu-te, não tens de saber já
      default: break
    }
  }

  _die(cause) {
    if (this.state !== 'playing') return
    this.state = 'dead'
    this.audio.stalkerPounce()
    this._shake = 1.0
    const ds = $('death-stats'); if (ds) ds.textContent = `TEMPO ${fmtTime(this.playTime)} · PASSADAS ${this.steps}`
    const dc = $('death-cause'); if (dc) dc.textContent = cause ?? 'ELE ENCONTROU VOCÊ.'
    this.hud.showScreen('screen-death')
    this.input.exitLock()
  }

  _win() {
    if (this.state !== 'playing') return
    this.state = 'finished'
    this.audio.doorUnlock()  // eco final
    this.hud.setEndStats({ time: this.playTime, steps: this.steps })
    this.hud.showScreen('screen-end')
    this.input.exitLock()
  }

  _render(time) {
    const gl = this.canvas
    this.renderer.resize()
    const aspect = gl.width / gl.height
    const persp = mat4.perspective((58 * Math.PI) / 180, aspect, 0.08, 60)
    let camPos = [0, 1.62, 0]
    let view = IDENTITY
    if (QA_TOPDOWN && this.lvl) {
      const c = { x: this.lvl.size * CELL / 2, z: this.lvl.size * CELL / 2 }
      camPos = [c.x, 46, c.z + 0.01]
      view = mat4.lookAt(camPos, [c.x, 0, c.z], [0, 0, -1])
      this._qaFog = 0.0001
    } else if (this.state === 'title') {
      // câmara lenta à deriva sobre o spawn (fundo do título)
      const t = time * 0.12
      const c = this.lvl ? this.lvl.spawn : { x: 13, z: 13 }
      camPos = [c.x * CELL + CELL / 2 + Math.sin(t) * 2.2, 2.1, c.z * CELL + CELL / 2 + Math.cos(t * 0.8) * 2.2]
      view = mat4.lookAt(camPos, [camPos[0] + Math.sin(t * 0.7) * 3, 1.35, camPos[2] - Math.cos(t * 0.7) * 3], [0, 1, 0])
    } else {
      const p = this.player
      camPos = p.camEye ? [...p.camEye] : [p.x, EYE_FALLBACK, p.z]
      if (this._shake > 0) {
        const t = this._shake
        camPos[0] += Math.sin(time * 47.3) * 0.22 * t
        camPos[1] += Math.cos(time * 39.7) * 0.16 * t
        camPos[2] += Math.sin(time * 43.1 + 1.3) * 0.22 * t
      }
      const look = p.lookDir()
      view = mat4.lookAt(camPos, [camPos[0] + look[0], camPos[1] + look[1], camPos[2] + look[2]], [0, 1, 0])
      if (this.state === 'playing' && p.roll) view = mat4.multiply(mat4.create(), rotZ(p.roll), view)
    }
    // modelo da porta — folhas rodam para DENTRO (dobradiças na ombreira, ~109°)
    const built = this.built
    const doorAngle = 1.9 * easeInOut(this.doorProgress)
    const hingeDoor = (hinge, theta) =>
      compose(translateM(hinge[0], hinge[1], hinge[2]), rotYTranslate(0, 0, 0, theta), translateM(-hinge[0], -hinge[1], -hinge[2]))
    const doorModelL = (() => {
      if (!built) return IDENTITY
      const d = built.door, n = d.normal
      if (d.axisX) return hingeDoor([d.dat - 0.97, 0, d.plane], -doorAngle * n[2])
      return hingeDoor([d.plane, 0, d.dat - 0.97], doorAngle * n[0])
    })()
    const doorModelR = (() => {
      if (!built) return IDENTITY
      const d = built.door, n = d.normal
      if (d.axisX) return hingeDoor([d.dat + 0.97, 0, d.plane], doorAngle * n[2])
      return hingeDoor([d.plane, 0, d.dat + 0.97], -doorAngle * n[0])
    })()
    const keyModel = (() => {
      if (!built || !built.keyPos || this.puzzle?.keyTaken) return IDENTITY
      // GLB deitado em XZ, pivot na base do aro — pousada no tampo da mesa, sem deriva nem flutuação
      return compose(
        translateM(built.keyPos.x, built.keyPos.y + 0.012, built.keyPos.z),
        rotYTranslate(0, 0, 0, 0.8),
        scaleM(10.0),
      )
    })()
    // lanterna em 1ª pessoa no canto inferior direito — SEM mãos/braços (pedido explícito).
    // Vista própria de viewmodel (FOV largo) composta sobre a vista da câmara.
    const flashMatrix = (() => {
      if (this.state !== 'playing' || !this.modelsReady) return null
      const invView = mat4.invert(view)
      if (!invView) return null
      return compose(invView, flashLocal())
    })()
    const vmView = (this.state === 'playing' && flashMatrix) ? mat4.multiply(mat4.create(), viewmodelProj(aspect), view) : null
    const heldKeyMatrix = (() => {
      if (this.state !== 'playing' || !this.modelsReady || !this.puzzle?.hasKey) return null
      const invView = mat4.invert(view)
      if (!invView) return null
      // chave virada para a câmara (face do aro visível), ligeiramente inclinada — "na mão" sem mão
      return compose(invView, translateM(-0.24, -0.142, -0.345), rotYTranslate(0, 0, 0, 0.22), rotX(Math.PI / 2 - 0.38), scaleM(3.1))
    })()
    const stalkerMatrix = (() => {
      const st = this.stalker
      if (!st || !st.present) return null
      const m = st.matrix()
      return compose(translateM(m.x, m.y, m.z), rotYTranslate(0, 0, 0, m.yaw), scaleM(1))
    })()
    if (this.stalker && this.stalker.present) this.renderer.updateDynamic('stalker', this.stalker.positions, this.stalker.normals, this.stalker.tangents)
    // ── adereços novos (fusível, cassetes, kits, decor) — pivôs no chão ──
    // cada GLB tem dimensões próprias em metros reais; scale/lift/rot são por adereço
    const pickups = this._pickupPos
    const yawHash = (p) => (((p.x * 73856093) ^ (p.z * 19349663)) >>> 0) / 4294967296 * Math.PI * 2
    const flatProp = (p, s, lift, extraYaw = 0) => p ? compose(translateM(p.x, lift, p.z), rotYTranslate(0, 0, 0, yawHash(p) + extraYaw), scaleM(s)) : null
    const fuseMatrix = (!this._fuseTaken && pickups?.fuse) ? flatProp(pickups.fuse, 3.4, 0.035) : null
    const cassetteMatrix = (!this._cassetteTaken && pickups?.cassette) ? flatProp(pickups.cassette, 2.4, 0.014, 0.4) : null
    const crowbarMatrix = pickups?.crowbar ? flatProp(pickups.crowbar, 1.3, 0.016, 0.9) : null
    const medkitMatrix = (!this._medkitTaken && pickups?.medkit) ? flatProp(pickups.medkit, 0.030, 0.080, 0.2) : null
    const flashDeadMatrix = pickups?.flashdead ? (pickups.flashdead ? compose(translateM(pickups.flashdead.x, 0.038, pickups.flashdead.z), rotYTranslate(0, 0, 0, yawHash(pickups.flashdead) + 1.1), rotX(Math.PI / 2), scaleM(1.9)) : null) : null
    const _marker = (p) => p ? compose(translateM(p.x, 0.006, p.z), scaleM(1.25)) : null
    const markers = QA_PICKUP_MARKERS ? [
      ...((!this._fuseTaken && pickups?.fuse) ? [_marker(pickups.fuse)] : []),
      ...((!this._cassetteTaken && pickups?.cassette) ? [_marker(pickups.cassette)] : []),
      ...((!this._medkitTaken && pickups?.medkit) ? [_marker(pickups.medkit)] : []),
    ] : []
    const notePos = (() => {
      const kp = built?.keyPos
      return kp ? { x: kp.x + 0.46, z: kp.z + 0.34 } : null
    })()
    const viewProjFinal = mat4.multiply(mat4.create(), persp, view)
    // projeção da sombra da lanterna — nasce na PONTA da lanterna empunhada
    const spotPos = flashMatrix ? transformVec(flashMatrix, FLASH_TIP) : [camPos[0], camPos[1] - 0.14, camPos[2]]
    const lookDir = this.state === 'title' ? [Math.sin(0.7), -0.06, -Math.cos(0.7)] : this.player.lookDir()
    const spotView = mat4.lookAt(spotPos, [spotPos[0] + lookDir[0], spotPos[1] + lookDir[1], spotPos[2] + lookDir[2]], [0, 1, 0])
    const spotProj = mat4.perspective((95 * Math.PI) / 180, 1.0, 0.25, 34)
    const lightViewProj = mat4.multiply(mat4.create(), spotProj, spotView)
    // luzes pontuais — as lâmpadas vivas mais próximas emitem de verdade (mortas, nada)
    const lvl = LEVEL1
    const points = []
    if (built) {
      points.push({ pos: [built.exit.x, 2.1, built.exit.z], color: lvl.exitLight.color, radius: lvl.exitLight.radius })
      if (built.keyPos && !this.puzzle?.keyTaken) points.push({ pos: [built.keyPos.x, built.keyPos.y + 0.42, built.keyPos.z], color: lvl.keyLight.color, radius: lvl.keyLight.radius })
      points.push({ pos: this.violetPos, color: lvl.violetLight.color, radius: lvl.violetLight.radius })
      const lamps = built.lamps ?? []
      const alive = lamps.filter(l => !l.bad)
        .map(l => ({ l, d: (l.x - camPos[0]) ** 2 + (l.z - camPos[2]) ** 2 }))
        .sort((a, b) => a.d - b.d).slice(0, 2)
      for (const { l } of alive) {
        if (l.d > 90) continue
        points.push({ pos: [l.x, l.y, l.z], color: [0.92, 0.78, 0.52], radius: 4.8 })
      }
      // lâmpada nua da sala de saída — só quando a porta abre (luz por baixo da porta)
      if (this.doorProgress > 0.15) {
        const flick = 0.80 + 0.20 * Math.sin(time * 13.7) * Math.sin(time * 7.1 + 2)
        points.push({ pos: [built.exit.x, 2.36, built.exit.z], color: [2.1, 1.5 * flick, 0.78], radius: 5.5 })
      }
      if (this._powerOn) {
        if (built.fusebox) points.push({ pos: [built.fusebox.x, 1.35, built.fusebox.z], color: [1.0, 0.70, 0.34], radius: 3.6 })
        points.push({ pos: [built.exit.x, 2.2, built.exit.z], color: [1.0, 0.84, 0.48], radius: 8.0 })
      }
    }
    // dying flicker
    const dying = this.battery < 0.18 && this.flashlightOn
    const flicker = dying ? (Math.sin(time * 31) * Math.sin(time * 17.3 + 1.7) > -0.55 ? 1 : 0.22) : 1
    // ── volumétricos: funis de poeira das lâmpadas vivas + feixe da lanterna ──
    const cones = []
    const wantVol = this.state === 'playing'
    if (wantVol) {
      if (lightIsOn(this.flashlightOn, this.battery)) {
        cones.push({ apex: spotPos, dir: lookDir, length: 7.4, radius: 2.5, color: lvl.spot.color, intensity: 0.50 * flicker })
      }
      const aliveCones = (built?.lamps ?? []).filter(l => !l.bad)
        .map(l => ({ l, d: (l.x - camPos[0]) ** 2 + (l.z - camPos[2]) ** 2 }))
        .filter(({ d }) => d < 15 * 15)
        .sort((a, b) => a.d - b.d)
        .slice(0, 6)
      for (const { l } of aliveCones) {
        cones.push({ apex: [l.x, l.y + 0.005, l.z], dir: [0, -1, 0], length: 2.72, radius: 1.45, color: [0.93, 0.80, 0.55], intensity: 0.30 })
      }
    }
    const pulse = this.player?.exhausted ? 1 : clamp((1 - (this.player?.stamina ?? 1)) * 0.6, 0, 1)
    // projeção do alvo da lanterna (6 m à frente) para o halo de poeira iluminada no passe de pós
    const torchUV = (() => {
      if (this.state !== 'playing') return null
      const t = [spotPos[0] + lookDir[0] * 6, spotPos[1] + lookDir[1] * 6, spotPos[2] + lookDir[2] * 6]
      const m = viewProjFinal
      const cw = m[3] * t[0] + m[7] * t[1] + m[11] * t[2] + m[15]
      if (cw <= 0.05) return null
      const cx = m[0] * t[0] + m[4] * t[1] + m[8] * t[2] + m[12]
      const cy = m[1] * t[0] + m[5] * t[1] + m[9] * t[2] + m[13]
      return [cx / cw * 0.5 + 0.5, cy / cw * 0.5 + 0.5]
    })()
    const torchI = lightIsOn(this.flashlightOn, this.battery) ? 0.30 * flicker : 0
    this.renderer.render({
      viewProj: viewProjFinal,
      lightViewProj,
      cameraPos: camPos,
      time,
      fog: lvl.fog.color,
      fogDensity: this._qaFog ?? lvl.fog.density,
      hemiSky: lvl.hemi.sky,
      hemiGround: lvl.hemi.ground,
      hemiIntensity: lvl.hemi.intensity + (this._powerOn ? 0.12 : 0),
      points,
      spot: {
        on: lightIsOn(this.flashlightOn, this.battery),
        pos: spotPos,
        dir: lookDir,
        color: lvl.spot.color,
        intensity: lvl.spot.intensity * flicker,
        inner: lvl.spot.inner,
        outer: lvl.spot.outer,
      },
      lightMatrix: lightViewProj,
      doorMatrixL: doorModelL,
      doorMatrixR: doorModelR,
      keyMatrix: keyModel,
      keyVisible: !!built && !!built.keyPos && !this.puzzle?.keyTaken,
      keyHot: this._keyTargeted ? 1.0 + 0.35 * Math.sin(time * 7) : 0.6,
      stalkerMatrix,
      grain: lvl.grain,
      vignette: lvl.vignette,
      levels: lvl.levels,
      cones,
      pulse,
      noteMatrix: this._noteMatrix,
      flashMatrix,
      heldKeyMatrix,
      viewmodelViewProj: vmView,
      dust: wantVol,
      torchUV,
      torchI,
      fuseMatrix,
      cassetteMatrix,
      crowbarMatrix,
      medkitMatrix,
      flashDeadMatrix,
      markers,
    })
  }
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// arranque: carregar texturas e só depois criar o jogo
import { loadAllTextures, loadPBRSet, loadOne } from './engine/textures.js'
import { StalkerEntity } from './game/stalker-entity.js'
import { StalkerBrain } from './game/stalker-ai.mjs'
const boot = async () => {
  const canvas = document.getElementById('gl')
  const gl = canvas.getContext('webgl2')
  // pré-carregar para medir progresso mínimo
  $('loading-tip').textContent = 'A ESTICAR O PAPEL DE PAREDE…'
  try {
    const renderer = new Renderer(canvas, { psxSnap: PSX_SNAP, pom: !NO_POM })
    renderer.init()
    const textures = await loadAllTextures(renderer.gl, import.meta.env.BASE_URL + 'textures/backrooms')
    // o stalker tem PBR próprio (assets/textures/stalker/skin.*)
    try {
      textures.stalker = await loadPBRSet(renderer.gl, import.meta.env.BASE_URL + 'textures/stalker/skin')
      textures.stalkerEmissive = await loadOne(renderer.gl, import.meta.env.BASE_URL + 'textures/stalker/stalker.emissive.jpg', { srgb: true })
    } catch (e) {
      console.error('texturas do stalker não carregaram — o jogo continua sem ele:', e)
    }
    renderer.setTextures(textures)
    window.__game = new Game(renderer)
    window.__READY = true   // gancho para ferramentas headless (QA/captura) — sem efeito no jogo
    $('loading').classList.add('done')
    if (AUTOSTART) {
      try { window.__game._start() } catch (e) { console.error('autostart:', e) }
    }
    if (QA_QADEATH) setTimeout(() => { try { window.__game?._die('O QUARTO TE EXPULOU.') } catch (e) { console.error(e) } }, 1800)
  } catch (err) {
    console.error(err)
    const el = $('loading-tip')
    if (el) el.textContent = 'FALHA AO ABRIR A PORTA: ' + (err?.message ?? err)
  }
}
boot()
