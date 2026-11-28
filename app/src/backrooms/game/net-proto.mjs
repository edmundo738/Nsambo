// Protocolo LAN 1v1 — funções puras (testáveis em node sem WebSocket)
export const LAN_PORT = 8322

/** o papel do anfitrião e o do convidado são sempre opostos */
export const oppositeRole = (r) => (r === 'hunter' ? 'escapee' : 'hunter')

/** quantas mensagens 'st' por segundo (10 Hz — PSX agradece) */
export const STATE_HZ = 10
export const STATE_INTERVAL = 1 / STATE_HZ

/** cria o pacote inicial que o anfitrião manda ao convidado (seed compartilhada) */
export const makeInit = (seed, hostRole) => ({ type: 'init', seed, hostRole })

/** parse seguro de mensagens — devolve null em lixo, nunca lança */
export function parseMessage(raw) {
  try {
    const m = JSON.parse(raw)
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return null
    return m
  } catch { return null }
}

/** valida 'init' — o único pacote com autoridade sobre a partida */
export function parseInit(m) {
  if (!m || m.type !== 'init') return null
  const seed = Number(m.seed)
  if (!Number.isFinite(seed)) return null
  const hostRole = m.hostRole === 'hunter' ? 'hunter' : m.hostRole === 'escapee' ? 'escapee' : null
  if (!hostRole) return null
  return { type: 'init', seed: seed >>> 0, hostRole }
}

/** vetor de velocidade a partir de posições sucessivas (para animação/gait remota) */
export function stepVelocity(prev, next, dt) {
  if (!prev || !next || dt <= 0) return { vx: 0, vz: 0, speed: 0 }
  const vx = (next.x - prev.x) / dt
  const vz = (next.z - prev.z) / dt
  return { vx, vz, speed: Math.hypot(vx, vz) }
}

/** interpolação simples em direção ao alvo (10 Hz arrive → render suave) */
export function approachPos(cur, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt)
  return { x: cur.x + (target.x - cur.x) * k, z: cur.z + (target.z - cur.z) * k }
}

/** yaw mais curto entre dois ângulos (wrap em [-π, π]) */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}
