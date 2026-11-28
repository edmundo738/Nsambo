// NÍVEL 1 — "Lobby 0" — o amarelo infinito
// A luz violeta distante é o único acento — a assinatura do Nsambo.
export const LEVEL1 = {
  id: 'lobby0',
  name: 'LOBBY 0 — O AMARELO INFINITO',
  seedDefault: 1337,
  size: 26,
  cell: 3,
  wallH: 3,
  fog: { color: [0.345, 0.305, 0.205], density: 0.048 },
  hemi: { sky: [1.0, 0.94, 0.74], ground: [0.34, 0.265, 0.155], intensity: 0.86 },
  spot: { color: [1.0, 0.94, 0.76], intensity: 2.9, inner: 0.30, outer: 0.60 },   // 0.2.0: 10.0 estourava a pele pálida do stalker em LDR (clip branco total)
  exitLight: { color: [0.55, 1.0, 0.68], intensity: 6.5, radius: 6.0 },
  keyLight: { color: [1.0, 0.84, 0.36], intensity: 3.0, radius: 4.5 },
  violetLight: { color: [0.52, 0.26, 0.92], intensity: 4.2, radius: 10.0 },
  grain: 0.06,
  vignette: 0.52,
  levels: 44,
  batterySeconds: 120,   // 02:00 por pilha (design 2026-11-27)
}
