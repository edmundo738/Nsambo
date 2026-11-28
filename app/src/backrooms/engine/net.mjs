// Cliente WebSocket fino para o multijogador LAN — URL no formato host:port
// (ex.: ws://192.168.1.20:8322). Toda a lógica de jogo vive no main.js;
// aqui só há transporte: JSON, connect/send/close e callbacks.
export class LanNet {
  /** @param {number} localId — 'h' (anfitrião) ou 'g' (convidado), atribuído pelo servidor */
  constructor() {
    this.ws = null
    this.localId = null
    this.connected = false
    this.closed = false
    this.onPeer = null      // (id) => void
    this.onReady = null     // () => void — o par formou-se (só o anfitrião recebe)
    this.onMessage = null   // (m) => void — mensagem JSON do outro lado
    this.onClose = null     // (reason?) => void
  }

  connect(url) {
    const full = url.startsWith('ws://') || url.startsWith('wss://') ? url : `ws://${url}`
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(full)
        this.ws = ws
        const t = setTimeout(() => reject(new Error('sem resposta do anfitrião em 4 s')), 4000)
        ws.onopen = () => { this.connected = true }
        ws.onerror = () => { clearTimeout(t); reject(new Error('não ligou — IP errado, servidor fechado ou firewall')) }
        ws.onclose = (ev) => {
          this.connected = false
          this.closed = true
          this.onClose?.(ev?.reason || 'ligação perdida')
        }
        ws.onmessage = (ev) => {
          let m = null
          try { m = JSON.parse(ev.data) } catch { return }
          if (!m || typeof m !== 'object' || typeof m.type !== 'string') return
          if (m.type === 'peer') {
            this.localId = m.id
            clearTimeout(t)
            this.onPeer?.(m.id)
            resolve(m.id)
            return
          }
          if (m.type === 'ready') { this.onReady?.(); return }   // o convidado chegou — só o anfitrião
          this.onMessage?.(m)
        }
      } catch (e) { reject(e) }
    })
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(m)) } catch { /* canal fechou a meio */ }
    }
  }

  close() {
    this.closed = true
    try { this.ws?.close() } catch { /* já fechou */ }
  }
}
