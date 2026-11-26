// MENU DE DESENVOLVEDOR «BUILD» — overlay disponível em qualquer mapa (escreve «build»)
// Serve para teleportar entre arenas/mapas e disparar qualquer mecânica do jogo sem a caçar.
const DEVMAP_LABEL = 'GALERIA DEV — MAPA DE ATIVOS'

const mkBtnStyleApply = (b) => {
  b.style.cssText = [
    'cursor:pointer;text-align:left;background:#171a10;color:#e6dfc8;border:1px solid #33372a;',
    'padding:8px 10px;font:11px/1.5 "Courier New",monospace;letter-spacing:.06em;',
  ].join(';')
}

export class DevMenu {
  constructor(actions) {
    this.actions = actions
    this.open = false
    this.el = null
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.open) this.close() })
  }

  toggle() { this.open ? this.close() : this.show() }
  show() {
    this.open = true
    this.ensure()
    try { document.exitPointerLock() } catch { /* headless */ }
    this.el.style.display = 'flex'
    this.refresh()
  }
  close() {
    this.open = false
    if (this.el) this.el.style.display = 'none'
  }
  hideAndLock() {
    this.close()
    this.actions.relock?.()
  }

  refresh() {
    if (!this.el) return
    const mapEl = this.el.querySelector('[data-role="current-map"]')
    if (mapEl) mapEl.textContent = this.actions.getMapLabel?.() ?? '—'
    const godEl = this.el.querySelector('[data-role="godbattery"]')
    if (godEl) godEl.textContent = this.actions.isGodBattery?.() ? 'BATERIA INFINITA: LIGADA' : 'BATERIA INFINITA: DESLIGADA'
  }

  ensure() {
    if (this.el) return
    const el = document.createElement('div')
    el.id = 'dev-menu'
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:10000', 'display:none', 'align-items:center', 'justify-content:center',
      'background:rgba(4,6,4,0.72)', 'backdrop-filter:blur(2px)', 'font-family:"Courier New",monospace',
    ].join(';')

    el.innerHTML = `
      <div style="width:620px;max-width:94vw;max-height:88vh;overflow:auto;background:#0d0f0a;border:1px solid #3a3f2a;box-shadow:0 0 0 4px rgba(0,0,0,.35),0 30px 80px rgba(0,0,0,.6);padding:18px 20px 14px;color:#e6dfc8;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid #2c2f22;padding-bottom:10px;margin-bottom:12px;">
          <div>
            <div style="font-size:11px;letter-spacing:.35em;color:#8a8f6d;">MENU DE DESENVOLVEDOR</div>
            <div style="font-size:26px;letter-spacing:.5em;color:#e8c96a;text-shadow:0 0 12px rgba(232,201,106,.35);margin-top:2px;">B U I L D</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#8a8f6d;letter-spacing:.2em;">MAPA ATUAL</div>
            <div data-role="current-map" style="font-size:11px;color:#a7f3a0;margin-top:2px;">—</div>
          </div>
        </div>

        <div style="font-size:10px;letter-spacing:.3em;color:#8a8f6d;margin:0 0 6px;">TELEPORTAR PARA</div>
        <div data-role="teleports" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;"></div>

        <div style="font-size:10px;letter-spacing:.3em;color:#8a8f6d;margin:0 0 6px;">DISPARAR MECÂNICA</div>
        <div data-role="mechanics" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;"></div>

        <div style="font-size:10px;letter-spacing:.3em;color:#8a8f6d;margin:0 0 6px;">PAINÉIS / DEPURAÇÃO</div>
        <div data-role="panels" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;"></div>

        <div style="border-top:1px solid #2c2f22;padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div style="font-size:9px;color:#6f7457;line-height:1.6;">Esc ou «build» fecha · clicar fora dos botões não fecha<br/>?gym · ?devmap · ?debug · ?nowin · F3 = painel</div>
          <button data-role="close" style="cursor:pointer;background:#e8c96a;color:#14140a;border:0;padding:9px 18px;font:bold 12px 'Courier New',monospace;letter-spacing:.25em;">VOLTAR AO JOGO</button>
        </div>
      </div>`

    const mkBtn = (label, accent, fn) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = [
        'cursor:pointer;text-align:left;background:#171a10;color:#e6dfc8;border:1px solid #33372a;',
        'padding:8px 10px;font:11px/1.5 "Courier New",monospace;letter-spacing:.06em;',
        'transition:border-color .12s, box-shadow .12s;',
      ].join(';')
      if (accent) { b.style.borderColor = '#4a4020'; b.style.color = '#e8c96a' }
      b.onmouseenter = () => { b.style.borderColor = '#e8c96a'; b.style.boxShadow = '0 0 10px rgba(232,201,106,.25)' }
      b.onmouseleave = () => { b.style.borderColor = accent ? '#4a4020' : '#33372a'; b.style.boxShadow = 'none' }
      b.onclick = () => { fn(); this.refresh() }
      return b
    }

    const teleports = el.querySelector('[data-role="teleports"]')
    const acts = this.actions
    const tp = [
      ['ACADEMIA\nsala de testes', () => acts.teleport('gym')],
      [DEVMAP_LABEL.split(' — ')[0] + '\ntodos os ativos', () => acts.teleport('devmap')],
      ['LOBBY 0\njogo completo', () => acts.teleport('lobby')],
    ]
    for (const [label, fn] of tp) {
      const b = mkBtn(label, true, fn)
      b.style.whiteSpace = 'pre-line'
      b.style.textAlign = 'center'
      b.style.padding = '12px 8px'
      teleports.appendChild(b)
    }

    const mechanics = el.querySelector('[data-role="mechanics"]')
    const mech = [
      ['Stalker a 6 m à vista', acts.stalker],
      ['DAR A CHAVE', acts.giveKey],
      ['Remover a chave', acts.removeKey],
      ['Restaurar quadro eléctrico', acts.restorePower],
      ['ABRIR A PORTA', acts.openDoor],
    ]
    for (const [label, fn] of mech) mechanics.appendChild(mkBtn(label, false, fn ?? (() => {})))

    const panels = el.querySelector('[data-role="panels"]')
    const god = document.createElement('button')
    god.dataset.role = 'godbattery'
    god.textContent = 'BATERIA INFINITA'
    god.onclick = () => { acts.toggleGodBattery(); this.refresh() }
    mkBtnStyleApply(god)
    panels.appendChild(mkBtn('F3 — painel de diagnóstico', false, acts.toggleF3))
    panels.appendChild(god)

    el.querySelector('[data-role="close"]').onclick = () => this.hideAndLock()
    document.body.appendChild(el)
    this.el = el
  }
}
