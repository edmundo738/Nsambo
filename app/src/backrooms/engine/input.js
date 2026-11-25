// NSAMBO ENGINE — input.js — teclado + rato com pointer lock
// Mapa de controlos (configurável): WASD mover · SHIFT correr · SPACE saltar
//   E interagir · Q alternar ferramenta · LMB usar ferramenta · F lanterna · M minimap
export class Input {
  constructor(target) {
    this.target = target
    this.keys = new Set()
    this.mouseDX = 0
    this.mouseDY = 0
    this.locked = false
    this.lmb = false
    this._listeners = []
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this._listeners.push([el, ev, fn, opt]) }
    on(window, 'keydown', (e) => {
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyF', 'KeyM', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault()
      this.keys.add(e.code)
    })
    on(window, 'keyup', (e) => this.keys.delete(e.code))
    on(window, 'blur', () => this.keys.clear())
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target
      // a transição de lock pode entregar deltas residuais ("estalo") — zera tudo
      this.mouseDX = 0; this.mouseDY = 0
    })
    on(document, 'mousemove', (e) => {
      if (!this.locked) return
      const dx = e.movementX || 0, dy = e.movementY || 0
      // um humano não desloca 200px num único evento; valores absurdos são artefactos do browser/lock
      if (Math.abs(dx) > 200 || Math.abs(dy) > 200) return
      this.mouseDX += dx
      this.mouseDY += dy
    })
    on(this.target, 'mousedown', (e) => { if (e.button === 0) this.lmb = true })
    on(window, 'mouseup', (e) => { if (e.button === 0) this.lmb = false })
    on(window, 'contextmenu', (e) => e.preventDefault())
  }
  isDown(code) { return this.keys.has(code) }
  isSprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') }
  consumeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY }
    this.mouseDX = 0; this.mouseDY = 0
    return d
  }
  consumeLmb() { const v = this.lmb; this.lmb = false; return v }
  requestLock() { try { const p = this.target.requestPointerLock(); if (p && p.catch) p.catch(() => {}) } catch { /* sem lock (headless/iframe) */ } }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock() }
  dispose() { for (const [el, ev, fn, opt] of this._listeners) el.removeEventListener(ev, fn, opt) }
}
