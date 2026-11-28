// NSAMBO ENGINE — hud.js — HUD retrô discreta (DOM) + minimapa fog-of-war + ecrãs
import { CELL } from '../engine/scene.js'
const $ = (id) => document.getElementById(id)

export class Hud {
  constructor(size) {
    this.size = size
    this.explored = new Set()
    this.minimapOn = false
    this.canvas = $('minimap')
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null
    this._toastTimer = 0
    this._objective = ''
  }
  setObjective(text) {
    if (this._objective === text) return
    this._objective = text
    const el = $('objective'); if (el) el.textContent = text
  }
  setStamina(frac, exhausted) {
    const bar = $('stamina-fill')
    if (bar) {
      bar.style.width = `${Math.round(frac * 100)}%`
      bar.classList.toggle('exhausted', !!exhausted)
    }
  }
  setHealth(frac, low, lowPulse = 0) {
    const bar = $('health-fill')
    if (bar) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`
      bar.classList.toggle('low', !!low)
    }
    const lv = $('lowhp-vignette')
    if (lv) {
      lv.style.opacity = String(Math.max(0, Math.min(1, lowPulse)) * 0.9)
      lv.classList.toggle('on', lowPulse > 0.02)
    }
  }
  // clarão vermelho radial no ecrã quando o stalker atinge (pulso CoD)
  damageFlash() {
    const el = $('dmg-flash')
    if (!el) return
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
  }
  // hitmarker — o X branco/vermelho do tipo CoD no centro do ecrã
  hitmarker() {
    const el = $('hitmarker')
    if (!el) return
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    clearTimeout(this._hitTO)
    this._hitTO = setTimeout(() => el.classList.remove('show'), 260)
  }
  setCells(n) {
    const el = $('cells-ind')
    if (!el) return
    el.textContent = `PILHAS ×${n}`
    el.classList.toggle('on', n > 0)
  }
  setBattery(frac) {
    const bar = $('battery-fill')
    if (bar) {
      bar.style.width = `${Math.round(frac * 100)}%`
      bar.classList.toggle('low', frac < 0.2)
    }
  }
  setKey(has) {
    const el = $('key-ind')
    if (el) el.classList.toggle('on', !!has)
  }
  prompt(text) {
    const el = $('prompt')
    if (!el) return
    if (text) { el.textContent = text; el.classList.add('show') } else el.classList.remove('show')
  }
  toast(text, seconds = 2.6) {
    const el = $('toast')
    if (!el) return
    el.textContent = text
    el.classList.add('show')
    this._toastTimer = seconds
    clearTimeout(this._toastTO)
    this._toastTO = setTimeout(() => el.classList.remove('show'), seconds * 1000)
  }
  toggleMinimap(force) {
    this.minimapOn = force !== undefined ? force : !this.minimapOn
    $('minimap-wrap')?.classList.toggle('show', this.minimapOn)
  }
  revealAround(size, cx, cz, radius = 3.4) {
    const r = Math.ceil(radius)
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > radius * radius) continue
      const x = cx + dx, z = cz + dz
      if (x >= 0 && z >= 0 && x < size && z < size) this.explored.add(z * size + x)
    }
  }
  drawMinimap(lvl, player, opts = {}) {
    if (!this.ctx || !this.minimapOn) return
    const { cells, size } = lvl
    const c = this.canvas, ctx = this.ctx
    const s = c.width / size
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = 'rgba(10, 8, 4, 0.78)'
    ctx.fillRect(0, 0, c.width, c.height)
    for (const i of this.explored) {
      const x = i % size, z = Math.floor(i / size)
      if (cells[i] === 1) {
        ctx.fillStyle = 'rgba(255, 209, 130, 0.30)'
        ctx.fillRect(x * s, z * s, s, s)
      }
    }
    // divisórias exploradas
    ctx.strokeStyle = 'rgba(255, 226, 160, 0.55)'
    ctx.lineWidth = 1.4
    for (const [a, b] of lvl.sealedEdges ?? []) {
      if (!this.explored.has(a) || !this.explored.has(b)) continue
      const az = Math.floor(a / size), ax = a % size
      ctx.beginPath()
      if (Math.floor(b / size) === az) { ctx.moveTo((ax + 1) * s, az * s); ctx.lineTo((ax + 1) * s, (az + 1) * s) }
      else { ctx.moveTo(ax * s, (az + 1) * s); ctx.lineTo((ax + 1) * s, (az + 1) * s) }
      ctx.stroke()
    }
    // marcadores
    const px = (player.x / (size * CELL)) * c.width
    const pz = (player.z / (size * CELL)) * c.height
    // chave (só se perto / descoberta)
    if (opts.showKey && lvl.key) {
      ctx.fillStyle = '#ffd76a'
      ctx.beginPath(); ctx.arc(((lvl.key.x + 0.5) / size) * c.width, ((lvl.key.z + 0.5) / size) * c.height, 4, 0, 7); ctx.fill()
    }
    if (opts.showExit && lvl.exit) {
      ctx.fillStyle = '#7bffa9'
      const ex = ((lvl.exit.x + 0.5) / size) * c.width, ez = ((lvl.exit.z + 0.5) / size) * c.height
      ctx.fillRect(ex - 4, ez - 4, 8, 8)
    }
    // jogador
    ctx.fillStyle = '#fff7e0'
    ctx.beginPath(); ctx.arc(px, pz, 3.6, 0, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(px, pz)
    ctx.lineTo(px + Math.sin(player.yaw) * 9, pz - Math.cos(player.yaw) * 9)
    ctx.stroke()
    // moldura
    ctx.strokeStyle = 'rgba(255, 214, 140, 0.35)'
    ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1)
  }
  // ecrãs
  showScreen(name) {
    for (const s of ['screen-title', 'screen-pause', 'screen-end', 'screen-death']) $(s)?.classList.toggle('show', s === name)
    $('hud')?.classList.toggle('hidden', name === 'screen-title' || name === 'screen-end' || name === 'screen-death')
  }
  hideScreens() {
    for (const s of ['screen-title', 'screen-pause', 'screen-end', 'screen-death']) $(s)?.classList.remove('show')
    $('hud')?.classList.remove('hidden')
  }
  setEndStats({ time, steps }) {
    const el = $('end-stats')
    if (el) el.textContent = `TEMPO ${fmtTime(time)}  ·  PASSADAS ${steps}`
  }
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
