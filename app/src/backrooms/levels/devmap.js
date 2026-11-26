// GALERIA DEV / MAPA DE ATIVOS — sala aberta onde TODOS os modelos e mecânicas do jogo se encontram
// Acesso: ?devmap=1 ou escrevendo «build» durante o jogo → menu de desenvolvedor → teleporte.
// Salão 22×22 sem divisórias — movimento livre, visão ampla, poço de porta na parede este.
import { OPEN, WALL, validateLevel } from '../engine/wfc.js'

export const DEVMAP_SEED = 0xde00

export function buildDevMapLevel() {
  const size = 26
  const cells = new Uint8Array(size * size)
  const idx = (x, z) => z * size + x
  const carve = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[idx(x, z)] = OPEN
  }
  carve(2, 2, 23, 23)             // salão principal
  cells[idx(24, 13)] = OPEN       // célula de saída (o vão da porta do jogo)
  // o resto do bordo stays WALL — cozinha o perímetro do salão

  const spawn = { x: 3, z: 13 }
  const exit = { x: 24, z: 13 }
  const key = { x: 13, z: 13 }    // mesa central com a chave
  const pillarCells = [
    idx(8, 8), idx(8, 18), idx(18, 8), idx(18, 18),
    idx(13, 7), idx(13, 19),
  ]

  const lvl = {
    id: 'devmap',
    name: 'GALERIA DEV — MAPA DE ATIVOS',
    seed: DEVMAP_SEED,
    size,
    cells,
    ids: null,
    carved: new Uint8Array(size * size).fill(1),
    spawn,
    exit,
    key,
    openCount: cells.reduce((a, c) => a + c, 0),
    maxDist: 0,
    pillars: pillarCells.length,
    pillarCells,
    sealedEdges: [],
  }
  const v = validateLevel(lvl)
  if (!v.ok) console.error('GALERIA DEV: planta inválida:', v.errors)
  return lvl
}
