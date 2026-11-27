// NSAMBO ENGINE — health.mjs — vida do jogador (lógica PURA, sem DOM/GL)
// CoD-style: dano instantâneo, regeneração após delay sem ser atingido, pulso crítico < 34
export const HEALTH_MAX = 100
export const REGEN_DELAY = 5.5          // s sem dano antes de regenerar
export const REGEN_RATE = 16            // pontos por segundo (após o delay, com rampa)
export const LOW_HP = 34                // abaixo disto: batidas + vermelho no ecrã
export const INVULN_SECONDS = 1.4       // invulnerabilidade breve após um golpe do stalker

export function createHealth(max = HEALTH_MAX) {
  return { max, hp: max, sinceDamage: 999, invuln: 0, hits: 0 }
}

// aplica dano; devolve o dano efetivamente aplicado (0 durante a invulnerabilidade)
export function damageHealth(h, amount) {
  if (h.invuln > 0 || h.hp <= 0) return 0
  const applied = Math.min(h.hp, amount)
  h.hp = Math.max(0, h.hp - applied)
  h.sinceDamage = 0
  h.invuln = INVULN_SECONDS
  h.hits += 1
  return applied
}

// medkit / efeitos
export function healHealth(h, amount) {
  h.hp = Math.min(h.max, h.hp + amount)
  h.sinceDamage = Math.max(h.sinceDamage, 2)   // pequeno fôlego — regen não arranca já
  return h.hp
}

// tick de regeneração CoD
export function updateHealth(h, dt) {
  h.sinceDamage += dt
  if (h.invuln > 0) h.invuln = Math.max(0, h.invuln - dt)
  if (h.sinceDamage > REGEN_DELAY && h.hp < h.max && h.hp > 0) {
    // rampa: a regen arranca suave (45%) e atinge 100% ao fim de ~2.4 s
    const ramp = Math.min(1, 0.45 + (h.sinceDamage - REGEN_DELAY) / 2.4)
    h.hp = Math.min(h.max, h.hp + REGEN_RATE * ramp * dt)
  }
  return h.hp
}

// 0..1 — força do «vermelho + batidas» (ecrã) quando a vida está baixa
export const lowHealthPulse = (h) => (h.hp >= LOW_HP ? 0 : 1 - h.hp / LOW_HP)
// batida cardíaca: intervalo encurta quanto mais baixa a vida (0.92 s → 0.52 s)
export const heartbeatInterval = (h) => 0.92 - 0.40 * lowHealthPulse(h)
