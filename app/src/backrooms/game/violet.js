// NSAMBO ENGINE — violet.js — a luz violeta tem de viver numa célula ABERTA (antes: 24% das seeds → dentro de parede)
import { OPEN } from '../engine/wfc.js'
export function pickVioletPos(lvl, CELL) {
  const { size, cells, spawn, exit } = lvl
  const tx = spawn.x + (exit.x - spawn.x) * 0.55, tz = spawn.z + (exit.z - spawn.z) * 0.55
  let best = null, bd = Infinity
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (cells[z * size + x] !== OPEN) continue
    if (x === exit.x && z === exit.z) continue
    const d = Math.hypot(x - tx, z - tz)
    if (d < bd) { bd = d; best = [x, z] }
  }
  const [bx, bz] = best ?? [spawn.x, spawn.z]
  return [(bx + 0.5) * CELL, 2.35, (bz + 0.5) * CELL]
}
