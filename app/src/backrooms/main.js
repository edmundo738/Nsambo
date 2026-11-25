// NSAMBO ENGINE — THE BACKROOMS — Lobby 0 · ponto de entrada
import { generateLevel, validateLevel } from './engine/wfc.js'
import { buildLevelMeshes, CELL } from './engine/scene.js'
import { Renderer } from './engine/renderer.js'
import { Input } from './engine/input.js'
import { GameAudio } from './engine/audio.js'
import { Player } from './game/player.js'
import { Hud } from './game/hud.js'
import { createPuzzleState, pickKey, tryExitDoor } from './game/puzzle.js'
import { VM, armsLocal, FLASH_TIP, viewmodelProj } from './game/viewmodel.js'
import { toggleFlashlight, lightIsOn } from './game/flashlight.js'
import { pickVioletPos } from './game/violet.js'
import { poseWeights, blendPoses, pulse, rightHandIndices, rightHandCentroid, leftHandIndices, leftHandCentroid, leftArmIndices, applyHold, clamp01 } from './game/arms-poses.mjs'
import { createLocoState, locoUpdate, computeSwingWeights, applyLocoSwing, forearmIndices, centroidOf, STRIDE, SWING } from './game/arms-anim.mjs'
import { recomputeNormals, recomputeTangents } from './engine/meshmix.mjs'
import { mat4 } from './engine/math.js'
import { LEVEL1 } from './levels/level1.js'
import { loadGLB } from './engine/gltf.js'

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
const QA_VMARMS = params.get('vma')          // QA: força braços em idle|walk|run
const QA_VMPHASE = (() => { const v = parseFloat(params.get('vmphase') ?? ''); return Number.isFinite(v) ? v : null })()
const QA_TOPDOWN = params.has('topdown')
const QA_NOFLASH = params.has('noflash')
const QA_ARMSONLY = params.has('armsonly')
const QA_ARMTIME = params.has('armtime') ? Number(params.get('armtime')) : null
const QA_ARMANIM = params.has('armanim') ? params.get('armanim') : null
const QA_ARMYAW = params.has('armyaw') ? Number(params.get('armyaw')) : null
const QA_ARMY = params.has('army') ? Number(params.get('army')) : null
const QA_ARMZ = params.has('armz') ? Number(params.get('armz')) : null
const QA_ARMS = params.has('arms') ? Number(params.get('arms')) : null
const QA_ARMX = params.has('armx') ? Number(params.get('armx')) : null
const QA_HASKEY = params.has('haskey')
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
      const [arms, relaxA, relaxB, guard, grab, push, grabL, key, flash] = await Promise.all([
        loadGLB(base + 'arms_rig.glb', { anim: 'relax', animTime: 0 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'relax', animTime: 0 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'relax', animTime: 2.0 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'knife_idle', animTime: 1.0 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'grab.R', animTime: 0.36 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'push.R', animTime: 0.32 }),
        loadGLB(base + 'arms_rig.glb', { anim: 'grab.L', animTime: 0.36 }),
        loadGLB(base + 'psx_house_key.glb'),
        loadGLB(base + 'psx_flashlight.glb'),
      ])
      this.armPoses = {
        relaxA: relaxA.positions, relaxB: relaxB.positions, guard: guard.positions,
        grab: grab.positions, push: push.positions, grabL: grabL.positions,
      }
      this._rHandIdx = rightHandIndices(relaxA.positions)
      this._lHandIdx = leftHandIndices(relaxA.positions)
      this._lArmIdx = leftArmIndices(relaxA.positions)
      this._foreR = forearmIndices(relaxA.positions, 1)
      this._foreL = forearmIndices(relaxA.positions, -1)
      this._armIndices = arms.indices
      this._armUvs = arms.uvs
      this._armNormals = new Float32Array(relaxA.positions.length)
      this._armTangents = new Float32Array((relaxA.positions.length / 3) * 4)
      this._swingW = { w: new Float32Array(relaxA.positions.length / 3), side: new Float32Array(relaxA.positions.length / 3) }   // reutilizado por frame
      this._loco = createLocoState()
      this._lastRenderT = null
      this._armBlend = new Float32Array(arms.positions.length)
      this._armBlend.set(relaxA.positions)
      recomputeNormals(this._armBlend, this._armIndices, this._armNormals)
      recomputeTangents(this._armBlend, this._armNormals, this._armUvs, this._armIndices, this._armTangents)
      await this.renderer.setDynamicModel('arms', arms)
      await this.renderer.setModel('key', key)
      await this.renderer.setModel('flash', flash)
      this.modelsReady = true
      console.log('modelos carregados — armas:', arms.verts, 'verts /', arms.tris, 'tris · chave:', key.verts, 'verts /', key.tris, 'tris')
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
    this._keyAnimT = null; this._locoDist = 0; this._lastRenderT = null
    if (this._loco) { this._loco.state = 'idle'; this._loco.phase = 0; this._loco.amp = 0; this._loco.ampTarget = 0 }
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
    if (this.stalkerAssets) this._spawnStalker()   // seed nova → cérebro novo (determinístico)
    this.hud.setObjective('APRENDA O QUARTO. ENCONTRE A CHAVE.')
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
    this._fpsFrames = (this._fpsFrames ?? 0) + 1
    this._fpsTime = (this._fpsTime ?? 0) + dt
    if (this._fpsTime >= 0.5) {
      this.renderer.fps = this._fpsFrames / this._fpsTime
      this._fpsFrames = 0; this._fpsTime = 0
      const dbg = $('debug')
      if (DEBUG && dbg) dbg.textContent = `${this.renderer.fps.toFixed(0)} FPS · SEED ${this.lvl?.seed} · ABC ${this.lvl?.openCount} · MDF ${this.lvl?.maxDist} · ST ${this.stalker?.brain.state ?? '—'} ${this.stalker ? this.stalker.brain.distance.toFixed(1) + 'm' : ''}`
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
    const noiseNow = Math.max(cam.moving ? (cam.sprinting ? 1.0 : 0.42) : 0, this._noisePulse)
    if (this.stalker) {
      const s = this.stalker.update(dt, { px: cam.eyeX, pz: cam.eyeZ, noise: noiseNow, time })
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
      if (raySphere(built.keyPos.x, built.keyPos.y + 0.52, built.keyPos.z, 0.46, 2.5) &&
          player.hasLineOfSight(px, pz, built.keyPos.x, built.keyPos.z)) {
        prompt = '[E] APANHAR A CHAVE'; target = 'key'
      }
    }
    const ddx = built.door.x - px, ddz = built.door.z - pz
    const doorDist = Math.hypot(ddx, ddz)
    const lookH = Math.hypot(look[0], look[2]) || 1   // look vem escalado por cos(pitch) — normalizar no plano
    const doorCos = doorDist > 0.9 ? (ddx * look[0] + ddz * look[2]) / (doorDist * lookH) : 1
    if (doorDist < 3.6 && doorCos > 0.35 && player.hasLineOfSight(px, pz, built.door.x, built.door.z, player.exitIdx)) {
      prompt = this.puzzle.hasKey ? '[E] ABRIR A SAÍDA' : 'PORTA TRANCADA'
      target = 'door'
    }
    this._keyTargeted = target === 'key'
    const chEl = $('crosshair'); if (chEl) chEl.classList.toggle('active', !!target)
    this.hud.prompt(prompt)
    if (pressed('KeyE')) {
      if (target === 'key') {
        // o GESTO começa já; a posse só é confirmada no contacto (ver bloco abaixo)
        if (this._keyAnimT == null) { this._reachT = time; this._keyAnimT = time }
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
    if (this.puzzle.doorOpen) {
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
      case 'sight-hunt': case 'stalk-hunt': this.audio.stalkerSting(1.0); break
      case 'pounce':
        this.audio.stalkerPounce()
        this.battery = Math.max(0, this.battery - 0.25)
        this.player.stamina = Math.max(0, this.player.stamina - 0.45)
        this._shake = 1.0
        this.hud.toast('ELE TE TOCOU', 2.2)
        break
      case 'vanish': this.audio.stalkerVanish(); break
      case 'lost-trail': break   // silêncio — ele perdeu-te, não tens de saber já
      default: break
    }
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
    }
    // modelo da porta (desliza) e da chave (roda + flutua)
    const built = this.built
    const doorModel = (() => {
      if (!built) return IDENTITY
      const s = -2.4 * easeInOut(this.doorProgress)   // a porta cede e engole-se pelo chão
      return translation(0, s, 0)
    })()
    const keyModel = (() => {
      if (!built || !built.keyPos || this.puzzle?.keyTaken) return IDENTITY
      const bob = Math.sin(time * 1.7) * 0.05
      // GLB: deitado em XZ, pivot no fundo do aro → levanta-o e põe-no de pé
      // chave na vertical (face virada ao jogador) a rodar devagar em redor de Y
      return compose(
        translateM(built.keyPos.x, built.keyPos.y + bob + 0.52, built.keyPos.z),
        rotYTranslate(0, 0, 0, Math.sin(time * 0.7) * 0.6), // face permanente para o jogador
        rotX(Math.PI / 2),
        scaleM(10.0),
      )
    })()
    // braços do jogador (viewmodel): presos à câmara, fora do mundo
    // — blend de poses por estado (respiração → alerta → apanhar/empurrar)
    const reach = this._reachT != null ? Math.sin(Math.PI * Math.min(1, (time - this._reachT) / 0.42)) : 0
    const dtR = this._lastRenderT == null ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - this._lastRenderT))
    this._lastRenderT = time
    if (this.armPoses && this.state === 'playing') {
      const grabPulse = this._reachT != null ? pulse(time - this._reachT, 0.6, 0.18) : 0
      const pushPulse = this._pushT != null ? pulse(time - this._pushT, 0.8, 0.28) : 0
      const breath = 0.5 + 0.5 * Math.sin(time * 1.35)
      // FSM idle|walk|run com histerese — a fase avança por DISTÂNCIA real (cam.stepped), não pelo relógio
      if (QA_VMARMS) {
        this._loco.state = QA_VMARMS === 'run' ? 'run' : QA_VMARMS === 'walk' ? 'walk' : 'idle'
        this._loco.amp = QA_VMARMS === 'idle' ? 0 : SWING[this._loco.state]
        if (QA_VMPHASE != null) this._loco.phase = QA_VMPHASE
      }
      const loco = locoUpdate(this._loco, this._locoDist ?? 0, QA_VMARMS ? (this._loco.state === 'run' ? 3.0 : this._loco.state === 'walk' ? 1.5 : 0) : this._armSpeed, dtR)
      const w = poseWeights({ speed: this._armSpeed, breath, grab: grabPulse, push: pushPulse })
      blendPoses(this._armBlend, this.armPoses, w)
      const hold = this.puzzle?.hasKey ? clamp01((time - (this._keyT ?? time)) / 0.4) : 0
      if (hold > 0) applyHold(this._armBlend, this._lArmIdx, this.armPoses.grabL, hold * 0.9)
      // ciclo de locomoção: péndulo frente/trás + balanço lateral + bob — L/R em contrafase
      applyLocoSwing(this._armBlend, computeSwingWeights(this._armBlend, this._swingW.w, this._swingW.side), loco.phase, loco.amp)
      // VM-006: posições mudaram → normais/tangentes recomputadas no CPU e subidas juntas
      recomputeNormals(this._armBlend, this._armIndices, this._armNormals)
      recomputeTangents(this._armBlend, this._armNormals, this._armUvs, this._armIndices, this._armTangents)
      this.renderer.updateDynamic('arms', this._armBlend, this._armNormals, this._armTangents)
      const viewMat = compose(translateM(this._swayX, this._swayY, 0), armsLocal(reach))
      const handRig = rightHandCentroid(this._armBlend, this._rHandIdx)
      const foreRigR = centroidOf(this._armBlend, this._foreR, [handRig[0], handRig[1] + 0.19, handRig[2] + 0.04])
      this._handView = transformVec(viewMat, handRig)
      this._foreViewR = transformVec(viewMat, foreRigR)
      if (this._lHandIdx.length) {
        const handRigL = leftHandCentroid(this._armBlend, this._lHandIdx)
        const foreRigL = centroidOf(this._armBlend, this._foreL, [handRigL[0], handRigL[1] + 0.19, handRigL[2] + 0.04])
        this._handViewL = transformVec(viewMat, handRigL)
        this._foreViewL = transformVec(viewMat, foreRigL)
      }
    }
    const stalkerMatrix = (() => {
      const st = this.stalker
      if (!st || !st.present) return null
      const m = st.matrix()
      return compose(translateM(m.x, m.y, m.z), rotYTranslate(0, 0, 0, m.yaw), scaleM(1))
    })()
    if (this.stalker && this.stalker.present) this.renderer.updateDynamic('stalker', this.stalker.positions, this.stalker.normals, this.stalker.tangents)
    const armModel = (() => {
      if (!this.modelsReady) return null
      if (QA_ARMSONLY) {
        // QA: câmara no spawn a olhar para os braços expostos num corredor aberto
        const sc = this.lvl ? { x: this.lvl.spawn.x * CELL + CELL / 2, z: this.lvl.spawn.z * CELL + CELL / 2 } : { x: 40, z: 40 }
        camPos = [sc.x, 1.5, sc.z + 2.6]
        view = mat4.lookAt(camPos, [sc.x, 1.0, sc.z], [0, 1, 0])
        return compose(
          translateM(sc.x, QA_ARMY ?? 1.15, sc.z),
          rotYTranslate(0, 0, 0, QA_ARMYAW ?? Math.PI),
          scaleM(QA_ARMS ?? 0.62),
          translateM(0, -1.38, 0),
        )
      }
      if (this.state !== 'playing') return null
      const invView = mat4.invert(view)
      if (!invView) return null
      return compose(invView, translateM(this._swayX, this._swayY, 0), armsLocal(reach))
    })()
    // lanterna presa às mãos — eixo do modelo (X, lente para +X) apontado a -Z
    const flashModel = (() => {
      if (this.state !== 'playing' || !this.modelsReady) return null
      const invView = mat4.invert(view)
      if (!invView) return null
      const hv = this._handView ?? [0.273, -0.166, -0.361]
      const fa = this._foreViewR ? [hv[0] - this._foreViewR[0], hv[1] - this._foreViewR[1], hv[2] - this._foreViewR[2]] : null
      const gripYaw = fa ? clamp(Math.atan2(fa[0], -fa[2]), -0.4, 0.4) : 0
      return compose(invView, translateM(hv[0] - 0.008, hv[1] - 0.005, hv[2] - 0.03), rotYTranslate(0, 0, 0, -Math.PI / 2 - 0.06 + gripYaw * 0.55), rotX(-0.14), scaleM(0.72))
    })()
    const heldKeyModel = (() => {
      if (this.state !== 'playing' || !this.modelsReady || !this.puzzle?.hasKey) return null
      const invView = mat4.invert(view)
      if (!invView) return null
      const hv = this._handViewL ?? [-0.273, -0.166, -0.361]
      const fa = this._foreViewL ? [hv[0] - this._foreViewL[0], hv[1] - this._foreViewL[1], hv[2] - this._foreViewL[2]] : null
      const gripYaw = fa ? clamp(Math.atan2(fa[0], -fa[2]), -0.45, 0.45) : 0
      // chave deitada na palma, dentes para a frente, anel para o punho
      return compose(invView, translateM(hv[0] + 0.005, hv[1] + 0.03, hv[2] + 0.012), rotYTranslate(0, 0, 0, 0.5 + gripYaw * 0.5), rotZ(Math.PI / 2 - 0.35), scaleM(1.5))
    })()
    const viewProjFinal = mat4.multiply(mat4.create(), persp, view)
    // projeção da sombra da lanterna — nasce na PONTA da lanterna em punho
    const spotPos = flashModel ? transformVec(flashModel, FLASH_TIP) : [camPos[0], camPos[1] - 0.14, camPos[2]]
    const lookDir = this.state === 'title' ? [Math.sin(0.7), -0.06, -Math.cos(0.7)] : this.player.lookDir()
    const spotView = mat4.lookAt(spotPos, [spotPos[0] + lookDir[0], spotPos[1] + lookDir[1], spotPos[2] + lookDir[2]], [0, 1, 0])
    const spotProj = mat4.perspective((95 * Math.PI) / 180, 1.0, 0.25, 34)
    const lightViewProj = mat4.multiply(mat4.create(), spotProj, spotView)
    // luzes pontuais
    const lvl = LEVEL1
    const points = []
    if (built) {
      points.push({ pos: [built.exit.x + CELL / 2, 2.1, built.exit.z + CELL / 2], color: lvl.exitLight.color, radius: lvl.exitLight.radius })
      if (built.keyPos && !this.puzzle?.keyTaken) points.push({ pos: [built.keyPos.x, built.keyPos.y - 0.05, built.keyPos.z], color: lvl.keyLight.color, radius: lvl.keyLight.radius })
      points.push({ pos: this.violetPos, color: lvl.violetLight.color, radius: lvl.violetLight.radius })
    }
    // dying flicker
    const dying = this.battery < 0.18 && this.flashlightOn
    const flicker = dying ? (Math.sin(time * 31) * Math.sin(time * 17.3 + 1.7) > -0.55 ? 1 : 0.22) : 1
    this.renderer.render({
      viewProj: viewProjFinal,
      viewmodelViewProj: this.state === 'playing' ? mat4.multiply(mat4.create(), viewmodelProj(aspect), view) : null,
      lightViewProj,
      cameraPos: camPos,
      time,
      fog: QA_ARMSONLY ? [0.02, 0.02, 0.03] : lvl.fog.color,
      fogDensity: QA_ARMSONLY ? 0.015 : (this._qaFog ?? lvl.fog.density),
      hemiSky: QA_ARMSONLY ? [1.15, 1.12, 1.1] : lvl.hemi.sky,
      hemiGround: QA_ARMSONLY ? [0.5, 0.48, 0.45] : lvl.hemi.ground,
      hemiIntensity: QA_ARMSONLY ? 1.5 : lvl.hemi.intensity,
      points: QA_ARMSONLY ? [] : points,
      spot: {
        on: QA_ARMSONLY ? false : lightIsOn(this.flashlightOn, this.battery),
        pos: spotPos,
        dir: lookDir,
        color: lvl.spot.color,
        intensity: lvl.spot.intensity * flicker,
        inner: lvl.spot.inner,
        outer: lvl.spot.outer,
      },
      lightMatrix: lightViewProj,
      doorMatrix: doorModel,
      keyMatrix: keyModel,
      keyVisible: !!built && !!built.keyPos && !this.puzzle?.keyTaken,
      heldKeyMatrix: heldKeyModel,
      keyHot: this._keyTargeted ? 1.0 + 0.35 * Math.sin(time * 7) : 0.6,
      armMatrix: armModel,
      flashMatrix: flashModel,
      stalkerMatrix,
      grain: lvl.grain,
      vignette: lvl.vignette,
      levels: lvl.levels,
    })
  }
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

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
    $('loading').classList.add('done')
    if (AUTOSTART) {
      try { window.__game._start() } catch (e) { console.error('autostart:', e) }
    }
  } catch (err) {
    console.error(err)
    const el = $('loading-tip')
    if (el) el.textContent = 'FALHA AO ABRIR A PORTA: ' + (err?.message ?? err)
  }
}
boot()
