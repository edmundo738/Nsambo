// NSAMBO ENGINE — puzzle.js — Puzzle da SAÍDA como máquina de estados PURA (testável em node)
// Regras do nível: a chave existe no mundo; a porta da saída exige a chave;
// a saída só é alcançável após desbloqueio. Nenhuma dessas regras depende de render.
// Condições de entrada / dicas / solução:
//   (1) ENTRADA   — o nível gerado garante chave alcançável e saída alcançável (validateLevel).
//   (2) SOLUÇÃO   — o jogador encontra a chave (brilho dourado + som) e a porta de saída reconhece-a.
//   (3) CONCLUSÃO — ao usar a porta com a chave, doorOpen=true; pisar a célula de saída → vitória.
//   (4) VALIDAÇÃO — validatePuzzle() abaixo + testes em test/puzzle.test.mjs.
export function createPuzzleState() {
  return {
    keySpawned: true,     // o nível L1 gera sempre chave
    keyTaken: false,
    hasKey: false,
    exitUnlocked: false,
    doorOpen: false,
    steps: 0,             // quantas ações relevantes (debug/QA)
    lockedNudges: 0,      // quantas vezes o jogador tentou a porta sem chave (telemetria)
  }
}

export function pickKey(s) {
  if (s.keyTaken) return s
  return { ...s, keyTaken: true, hasKey: true, steps: s.steps + 1 }
}

export function tryExitDoor(s) {
  if (s.doorOpen) return { state: s, result: 'already' }
  if (s.hasKey) {
    const next = { ...s, exitUnlocked: true, doorOpen: true, steps: s.steps + 1 }
    return { state: next, result: 'unlocked' }
  }
  return { state: { ...s, lockedNudges: s.lockedNudges + 1 }, result: 'locked' }
}

// Puzzle VALIDATOR — invariantes que a geração nunca pode violar
export function validatePuzzle(s) {
  const errors = []
  if (s.exitUnlocked && !s.hasKey && !s.doorOpen) errors.push('saída desbloqueada sem chave')
  if (s.doorOpen && !s.exitUnlocked) errors.push('porta aberta sem desbloqueio')
  if (s.hasKey && !s.keyTaken) errors.push('chave na posse sem ter sido apanhada')
  if (s.lockedNudges < 0) errors.push('telemetria inválida')
  return { ok: errors.length === 0, errors }
}
