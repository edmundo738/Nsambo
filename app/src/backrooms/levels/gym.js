// ACADEMIA DE GAMEPLAY (Gameplay Gym / Test Room) — The Backrooms
// Nível FEITO À MÃO e determinístico para testar as mecânicas SEM jogar a campanha:
//   A — Arena do stalker (divisórias em L, pilares finos)
//   B — Muro em U + portão estreito (pathfinding do stalker / discriminação de obstáculos)
//   C — Salão principal (mobília: chave na mesa, quadro elétrico, quadros novos, pilares)
//   D — Saída SELADA com porta dupla (vão + quarto de saída com lâmpada nua)
//   E — Corredor sul de lâmpadas (fixtures testados) + nicho oeste (impasse "impossível")
//   F — Pilares de coluna (colisão fina, não parede)
// As regras do jogo são exatamente as mesmas — só a planta é fixa.
import { OPEN, WALL, validateLevel } from '../engine/wfc.js'

export const GYM_SEED = 0x6a11

export function buildGymLevel() {
  const size = 26
  const cells = new Uint8Array(size * size)   // tudo WALL por defeito
  const idx = (x, z) => z * size + x
  const carve = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[idx(x, z)] = OPEN
  }
  const block = (x, z) => { cells[idx(x, z)] = WALL }

  carve(2, 2, 14, 8)      // A — arena do stalker
  carve(6, 9, 7, 9)       // gargalo arena → salão
  carve(17, 2, 24, 8)     // B — ôco do muro em U
  carve(15, 5, 16, 5)     // portão estreito arena → ôco
  carve(2, 10, 22, 17)    // C — salão principal
  cells[idx(23, 13)] = OPEN   // D — gargalo do vão da porta
  cells[idx(24, 13)] = OPEN   // célula de saída
  carve(11, 18, 12, 19)   // gargalo sul
  carve(2, 20, 23, 21)    // E — corredor sul de lâmpadas
  carve(0, 20, 1, 21)     // nicho oeste (impasse)

  // divisórias em L na arena
  block(5, 4); block(5, 5); block(5, 6)
  block(10, 3); block(10, 4); block(10, 5)
  // muro em U dentro do ôco (boca a sul — testa o stalker a contornar)
  block(20, 2); block(21, 2); block(22, 2); block(23, 2)
  block(20, 3); block(20, 4)
  block(23, 3); block(23, 4)

  const spawn = { x: 2, z: 13 }
  const exit = { x: 24, z: 13 }
  const key = { x: 20, z: 15 }              // mesa lateral no salão, canto sudeste
  const pillarCells = [idx(7, 13), idx(12, 13), idx(17, 13)]   // F — colunas (OPEN, só geometria)

  const lvl = {
    id: 'gym',
    name: 'ACADEMIA DE GAMEPLAY',
    seed: GYM_SEED,
    size,
    cells,
    ids: null,                              // buildLevelMeshes/findPath toleram (carved=1 faz bypass do WFC)
    carved: new Uint8Array(size * size).fill(1),
    spawn,
    exit,
    key,
    openCount: cells.reduce((a, c) => a + c, 0),
    maxDist: 0,
    pillars: pillarCells.length,
    pillarCells,
    sealedEdges: [],                        // a porta já nasce como único acesso (neighbors são parede)
  }
  const v = validateLevel(lvl)
  if (!v.ok) console.error('ACADEMIA: plantas de testes inválidas:', v.errors)
  return lvl
}
