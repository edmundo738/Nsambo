// ACADEMIA — painel de diagnóstico estilo "DEBUG MODE" (F3 liga/desliga)
// Observar o funcionamento INTERNO, não só o resultado visual:
// FPS · posição · célula · yaw · bateria · lanterna · fôlego · porta · chave · stalker
export class DebugPanel {
  constructor() {
    this.enabled = false
    this.el = null
    this._fps = 60
    this._last = 0
    this._acc = 0
  }
  mount() {
    if (this.el) return
    const el = document.createElement('div')
    el.id = 'debug-panel'
    el.style.cssText = [
      'position:fixed', 'right:10px', 'top:64px', 'z-index:9999', 'pointer-events:none',
      'font:11px/1.55 "Courier New", monospace', 'color:#a7f3a0',
      'background:rgba(5,10,5,0.78)', 'border:1px solid rgba(140,255,150,0.35)',
      'padding:6px 9px', 'border-radius:3px', 'white-space:pre', 'width:max-content', 'max-width:calc(100vw - 20px)',
      'text-shadow:0 0 4px rgba(120,255,120,0.4)', 'display:none',
    ].join(';')
    document.body.appendChild(el)
    this.el = el
  }
  toggle() { this.setEnabled(!this.enabled) }
  setEnabled(on) {
    this.enabled = !!on
    this.mount()
    this.el.style.display = this.enabled ? 'block' : 'none'
  }
  // chamado a cada frame; DOM só é tocada 4×/s
  update(dt, info) {
    if (!this.enabled) return
    this._acc += dt
    if (this._last) this._fps += (1 / Math.max(dt, 1e-4) - this._fps) * 0.06
    this._last = performance.now()
    if (this._acc < 0.25) return
    this._acc = 0
    const lines = [
      `${info.map ?? 'MAPA'} · semente ${info.seed}`,
      `FPS ${this._fps.toFixed(0)} · frame ${(1000 / Math.max(this._fps, 1)).toFixed(1)} ms`,
      `POS ${info.x.toFixed(1)}, ${info.z.toFixed(1)} · célula ${info.cellX},${info.cellZ}`,
      `YAW ${info.yawDeg.toFixed(0)}° · ${info.sprinting ? 'A CORRER' : 'A ANDAR'}`,
      `BATERIA ${(info.battery * 100).toFixed(0)}% · LANTERNA ${info.flashlightOn ? 'LIGADA' : 'APAGADA'}`,
      `FÔLEGO ${(info.stamina * 100).toFixed(0)}%${info.exhausted ? ' · EXAUSTO' : ''}`,
      `VIDA ${info.vida}%${info.vida < 35 ? ' · CRÍTICO' : ''}`,
      `PORTA ${(info.doorProgress * 100).toFixed(0)}% · CHAVE ${info.hasKey ? 'NO BOLSO' : 'NÃO APANHADA'}`,
      `QUADRO ${info.powerOn ? 'RESTAURADO' : 'POR RESTAURAR'} · STALKER ${info.stalker}`,
    ]
    this.el.textContent = lines.join('\n')
  }
}
