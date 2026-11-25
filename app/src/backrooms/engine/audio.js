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
  update(dt) { this._buzzTimer += dt; if (this._buzzTimer > 34 + Math.sin(this._buzzTimer * 0.13) * 12) { this._buzzTimer = 0; this.ballastBuzz() } }
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
