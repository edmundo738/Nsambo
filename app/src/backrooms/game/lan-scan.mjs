// Descoberta de salas THE BACKROOMS na LAN (à Minecraft) — pura e testável:
// sem WebSocket, sem fetch concreto. O main.js injeta o fetch do browser;
// os testes injetam um falso. Estratégia: o anfitrião corre `relay.cjs`, que
// expõe HTTP GET /lan-info (CORS *). O cliente percorre os /24 candidatos em
// paralelo com timeout curto e lista as salas que responderem.
//
// Bluetooth NÃO entra aqui de propósito: a Web Bluetooth é só «Central» —
// nenhum browser funciona como periférico BLE, por isso dois PCs não jogam
// um jogo sobre Bluetooth sem app nativa. A LAN/WLAN cobre o caso real.

export const LAN_INFO_PORT = 8322

/** Prefixos /24 por omissão (os mais comuns em redes domésticas) + mesma máquina. */
export const defaultPrefixes = () => ['127.0.0', '192.168.0', '192.168.1', '192.168.8', '10.0.0']

/** Lista de URLs de sonda para os prefixos dados (hosts 1..254). */
export const probeList = (prefixes, port = LAN_INFO_PORT) => {
  const out = []
  for (const raw of prefixes) {
    const p = String(raw ?? '').trim().replace(/\.+$/, '')
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p)) continue            // prefixo inválido — ignora
    if (p.split('.').some(o => Number(o) > 255)) continue
    for (let host = 1; host <= 254; host++) out.push(`http://${p}.${host}:${port}/lan-info`)
  }
  return out
}

/** Normaliza a resposta de /lan-info → sala descoberta, ou null se não for um relé THE BACKROOMS. */
export const parseLanInfo = (json, url) => {
  try {
    const m = typeof json === 'string' ? JSON.parse(json) : json
    if (!m || typeof m !== 'object') return null
    if (m.game !== 'backrooms') return null
    const port = Number(m.port)
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null
    const host = new URL(url).hostname
    const players = Number(m.players) || 0
    return {
      host,
      room: typeof m.room === 'string' ? m.room.slice(0, 32) : `${host}:${port}`,
      port,
      ws: `ws://${host}:${port}`,
      name: typeof m.name === 'string' ? m.name.slice(0, 40) : 'THE BACKROOMS',
      players: Math.min(Math.max(players, 0), 2),
      capacity: 2,
      open: !!m.open && players === 1,           // só salas com anfitrião à espera
    }
  } catch { return null }
}

/**
 * Percorre as sondas em paralelo com limite de concorrência.
 * @param {{fetchImpl: typeof fetch, prefixes?: string[], port?: number, timeoutMs?: number, concurrency?: number, onProgress?: (done: number, total: number) => void}} opts
 */
export const scanLan = async ({ fetchImpl, prefixes = defaultPrefixes(), port = LAN_INFO_PORT, timeoutMs = 400, concurrency = 48, onProgress } = {}) => {
  const urls = probeList(prefixes, port)
  const found = []
  let done = 0
  const worker = async () => {
    while (urls.length) {
      const url = urls.pop()
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(url, { signal: ctrl.signal, cache: 'no-store' })
        if (res?.ok) {
          const room = parseLanInfo(await res.text(), url)
          if (room && room.players >= 1) found.push(room)
        }
      } catch { /* máquina sem relé — normal na maioria dos endereços */ } finally {
        clearTimeout(t)
        done++
        onProgress?.(done, done + urls.length)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(urls.length, 1)) }, worker))
  // a mesma sala pode aparecer por vários endereços (loopback 127/8 responde em todo o lado) —
  // dedup pelo id da sala; fica o endereço mais "canónico" (127.0.0.1 primeiro, senão o IP numericamente maior? não — o primeiro/encontrado por prefixo)
  const seen = new Map()
  for (const room of found) {
    const key = room.room
    const prev = seen.get(key)
    if (!prev || (room.host === '127.0.0.1' && prev.host !== '127.0.0.1')) seen.set(key, room)
  }
  const rooms = [...seen.values()]
  rooms.sort((a, b) => a.host.localeCompare(b.host, 'en', { numeric: true }))
  return rooms
}
