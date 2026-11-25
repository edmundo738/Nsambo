// NSAMBO ENGINE — audio.js — paisagem sonora sintética (Web Audio API, zero assets)
// Drone 55 Hz + zumbido de rede 50 Hz (Angola) + ruído castanho filtrado + fluorescente intermitente
export class GameAudio {
  constructor() {
    this.ctx = null
    this.master = null
    this.started = false
    this.muted = false
    this.volume = 0.8
    this._noiseBuffer = null
    this._buzzTimer = 0
    this._stepPan = 1
  }
  ensure() {
    if (this.ctx) return true
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 8
    this.master.connect(comp)
    comp.connect(this.ctx.destination)
    return true
  }
  suspend() { try { this.ctx?.suspend?.() } catch { /* sem ctx */ } }
  resume() { try { this.ctx?.resume?.() } catch { /* sem ctx */ } }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05) }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.03) }
  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer
    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { const white = Math.random() * 2 - 1; last = (last + 0.02 * white) / 1.02; data[i] = last * 3.2 }
    this._noiseBuffer = buf
    return buf
  }
  _white() {
    if (this._whiteBuffer) return this._whiteBuffer
    const len = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this._whiteBuffer = buf
    return buf
  }
  startAmbience() {
    if (!this.ensure() || this.started) return
    this.started = true
    const ctx = this.ctx
    // ── drone grave (duas senoides destunadas — "o edifício respira") ──
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.055
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7
    for (const freq of [55, 55.6, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq
      const g = ctx.createGain(); g.gain.value = freq > 100 ? 0.18 : 0.5
      o.connect(g); g.connect(lp); o.start()
    }
    lp.connect(droneGain); droneGain.connect(this.master)
    // LFO lento na amplitude do drone
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.055
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02
    lfo.connect(lfoGain); lfoGain.connect(droneGain.gain); lfo.start()
    // ── ruído castanho filtrado (ar condicionado distante / vento interior) ──
    const noise = ctx.createBufferSource(); noise.buffer = this._noise(); noise.loop = true
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.45
    const nGain = ctx.createGain(); nGain.gain.value = 0.05
    noise.connect(bp); bp.connect(nGain); nGain.connect(this.master); noise.start()
    // ── zumbido da rede 50 Hz (muito baixo) ──
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50
    const humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 120
    const humGain = ctx.createGain(); humGain.gain.value = 0.011
    hum.connect(humLp); humLp.connect(humGain); humGain.connect(this.master); hum.start()
  }
  // zumbido de balastro fluorescente — chamado pelo loop (a cada 22–47 s)
  ballastBuzz() {
    if (!this.ctx) return
    const ctx = this.ctx, t0 = ctx.currentTime
    const src = ctx.createBufferSource(); src.buffer = this._white(); src.loop = true
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6100; bp.Q.value = 9
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.12)
    g.gain.setValueAtTime(0.05, t0 + 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    src.connect(bp)
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; bp.connect(g); g.connect(pan); pan.connect(this.master) }
    else { bp.connect(g); g.connect(this.master) }
    src.start(t0); src.stop(t0 + 1.7)
  }
  footstep(run = false) {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    const src = ctx.createBufferSource(); src.buffer = this._white(); src.playbackRate.value = 0.7 + Math.random() * 0.35
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = run ? 420 : 300; lp.Q.value = 1.2
    const g = ctx.createGain()
    const vol = run ? 0.5 : 0.3
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (run ? 0.16 : 0.21))
    // alternar ligeiramente o pan — passada esquerda/direita
    this._stepPan *= -1
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    src.connect(lp); lp.connect(g)
    if (pan) { pan.pan.value = 0.18 * this._stepPan; g.connect(pan); pan.connect(this.master) }
    else g.connect(this.master)
    src.start(t0); src.stop(t0 + 0.25)
  }
  click(on) {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = on ? 1500 : 1150
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.06)
  }
  keyPickup() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // segunda menor dissonante com cauda longa — não é um "ding" feliz
    for (const [freq, delay, vol] of [[523.25, 0, 0.32], [554.37, 0.02, 0.30], [1046.5, 0.05, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0 + delay)
      g.gain.exponentialRampToValueAtTime(vol, t0 + delay + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 2.6)
      o.connect(g); g.connect(this.master); o.start(t0 + delay); o.stop(t0 + delay + 2.7)
    }
  }
  doorLocked() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 82
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.32)
    const src = ctx.createBufferSource(); src.buffer = this._white(); src.playbackRate.value = 0.5
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500
    const g2 = ctx.createGain()
    g2.gain.setValueAtTime(0.3, t0)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12)
    src.connect(lp); lp.connect(g2); g2.connect(this.master); src.start(t0); src.stop(t0 + 0.15)
  }
  doorUnlock() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // clunk metálico + arrasto de abertura
    for (const [freq, type, vol, dur] of [[220, 'square', 0.25, 0.09], [659, 'square', 0.12, 0.06], [440, 'triangle', 0.2, 0.22]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02)
    }
    const src = ctx.createBufferSource(); src.buffer = this._noise(); src.loop = true
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0 + 0.25)
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9)
    src.connect(lp); lp.connect(g); g.connect(this.master)
    src.start(t0 + 0.25); src.stop(t0 + 2.0)
  }
  // ── o stalker — tudo sintetizado, sem assets, tensão por previsão ──
  stalkerMurmur(strength = 0.5) {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // gemido grave sem palavras — dois formantes que escorrem para baixo
    for (const [f0, f1, vol] of [[88, 64, 0.34], [132, 96, 0.18], [55, 41, 0.4]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0)
      o.frequency.exponentialRampToValueAtTime(f1, t0 + 1.7)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.4
      bp.frequency.setValueAtTime(420, t0)
      bp.frequency.exponentialRampToValueAtTime(260, t0 + 1.7)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(vol * strength, t0 + 0.22)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9)
      o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 2.0)
    }
  }
  stalkerSting(level = 1) {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // descoberta — batida surda + agudo que se desfia (não é um grito de filme)
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(196, t0)
    o.frequency.exponentialRampToValueAtTime(73, t0 + 0.55)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.5 * level, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.8)
    const src = ctx.createBufferSource(); src.buffer = this._white(); src.playbackRate.value = 1.6
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2800, t0)
    bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.9); bp.Q.value = 7
    const g2 = ctx.createGain()
    g2.gain.setValueAtTime(0.0001, t0 + 0.05)
    g2.gain.exponentialRampToValueAtTime(0.14 * level, t0 + 0.09)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1)
    src.connect(bp); bp.connect(g2); g2.connect(this.master); src.start(t0 + 0.05); src.stop(t0 + 1.2)
  }
  stalkerPounce() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // impacto + guincho invertido (a mandíbula não respeita a anatomia)
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(60, t0)
    o.frequency.exponentialRampToValueAtTime(34, t0 + 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.65)
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(1400, t0 + 0.06)
    o2.frequency.exponentialRampToValueAtTime(380, t0 + 0.85)
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.value = 900
    const g2 = ctx.createGain()
    g2.gain.setValueAtTime(0.0001, t0 + 0.06)
    g2.gain.exponentialRampToValueAtTime(0.3, t0 + 0.1)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95)
    o2.connect(bp); bp.connect(g2); g2.connect(this.master); o2.start(t0 + 0.06); o2.stop(t0 + 1.0)
  }
  dreadSting(strength = 0.6) {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02
    // cluster distante em RE b menor — chegado devagar, chega tarde demais
    const freqs = [73.42, 92.5, 116.54, 146.83]   // D2 · F#2 · A#2 · D3
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5.5
    lp.frequency.setValueAtTime(320, t0)
    lp.frequency.exponentialRampToValueAtTime(1150, t0 + 2.6)
    lp.frequency.exponentialRampToValueAtTime(240, t0 + 7.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.16 * strength, t0 + 2.3)
    g.gain.setValueAtTime(0.16 * strength, t0 + 3.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.6)
    lp.connect(g); g.connect(this.master)
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = 'triangle'
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.006)
      const og = ctx.createGain(); og.gain.value = f === 146.83 ? 0.32 : 1.0
      o.connect(og); og.connect(lp)
      o.start(t0); o.stop(t0 + 7.8)
    }
    // batida cardíaca subjacente (dois golpes e o silêncio)
    for (const dt of [0.0, 0.62]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(52, t0 + dt)
      o.frequency.exponentialRampToValueAtTime(38, t0 + dt + 0.32)
      const hg = ctx.createGain()
      hg.gain.setValueAtTime(0.0001, t0 + dt)
      hg.gain.exponentialRampToValueAtTime(0.34 * strength, t0 + dt + 0.02)
      hg.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.42)
      o.connect(hg); hg.connect(this.master); o.start(t0 + dt); o.stop(t0 + dt + 0.5)
    }
  }
  stalkerVanish() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    // raspado que sobe e se desfaz — o silêncio volta errado
    const src = ctx.createBufferSource(); src.buffer = this._noise(); src.playbackRate.setValueAtTime(0.45, t0)
    src.playbackRate.exponentialRampToValueAtTime(1.4, t0 + 1.15)
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5.5
    bp.frequency.setValueAtTime(140, t0)
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + 1.1)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35)
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t0); src.stop(t0 + 1.4)
  }
  heartThump() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    for (const [delay, vol] of [[0, 0.34], [0.16, 0.2]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 52
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0 + delay)
      g.gain.exponentialRampToValueAtTime(vol, t0 + delay + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.12)
      o.connect(g); g.connect(this.master); o.start(t0 + delay); o.stop(t0 + delay + 0.15)
    }
  }
  // respiração próxima — chamada no update com nível 0..1; rajadas irregulares + apneias
  setStalkerBreath(level) { this._breathLevel = Math.max(0, Math.min(1, level)) }
  _breathBurst(exhale) {
    const ctx = this.ctx, t0 = ctx.currentTime, lvl = this._breathLevel ?? 0
    const src = ctx.createBufferSource(); src.buffer = this._white()
    src.playbackRate.value = exhale ? 0.55 : 0.8
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1
    bp.frequency.value = exhale ? 320 : 480
    const g = ctx.createGain()
    const dur = exhale ? 0.62 : 0.4
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.028 + lvl * 0.11, t0 + (exhale ? 0.22 : 0.09))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t0); src.stop(t0 + dur + 0.02)
  }
  update(dt) { this._buzzTimer += dt; if (this._buzzTimer > 34 + Math.sin(this._buzzTimer * 0.13) * 12) { this._buzzTimer = 0; this.ballastBuzz() }
    // respiração irregular: inspira → expira → pausa aleatória; por vezes apneia longa
    const lvl = this._breathLevel ?? 0
    if (this.ctx && lvl > 0.02) {
      this._breathT = (this._breathT ?? 0) - dt
      if (this._breathT <= 0) {
        const r = Math.random()
        if (this._breathPhase === 'in') { this._breathBurst(true); this._breathPhase = 'out'; this._breathT = 0.62 }
        else if (r < 0.18) { this._breathPhase = 'in'; this._breathT = 1.6 + Math.random() * 1.3 }   // apneia
        else { this._breathBurst(false); this._breathPhase = 'in'; this._breathT = 0.4 + Math.random() * 0.5 }
      }
    } else { this._breathPhase = 'out'; this._breathT = 0 }
  }
  uiTick() {
    if (!this.ensure()) return
    const ctx = this.ctx, t0 = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.06)
  }
}
