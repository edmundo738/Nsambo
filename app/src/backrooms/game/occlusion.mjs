// NSAMBO ENGINE — occlusion.mjs — consulta ÚNICA de oclusão/linha de visão.
// Uma só verdade para jogador, Stalker, faca e interações (auditoria 2026-11-27, Fase 1):
//   · célula sólida (WALL ou fora do mundo) bloqueia o feixe
//   · aresta selada entre duas células abertas (divisória fina do WFC) bloqueia o feixe
//   · `ignoreCell` ignora UMA célula sólida específica (o vão da porta de saída)
// Coordenadas de ENTRADA: mundo em metros (x, z). Células: `cells[z*size + x]`, 1 = aberta, 0 = parede.
import { CELL } from '../engine/scene.js'
import { OPEN } from '../engine/wfc.js'

export const EDGE_KEY = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a)
export const makeSealedSet = (sealedEdges) => new Set((sealedEdges ?? []).map(([a, b]) => EDGE_KEY(a, b)))

// ctx: { cells, size, sealed:Set(edgeKey), forcedSolid?:Set(idx) }
// forcedSolid: células adicionais tratadas como sólidas (ex.: vão da porta da saída fechada).
// ignoreCell tem prioridade sobre tudo (o jogador pode pedir a célula da porta ignorada).
function isSolidIdx(ctx, i, ignoreCell) {
  if (i === ignoreCell) return false
  if (ctx.cells[i] !== OPEN) return true
  if (ctx.forcedSolid && ctx.forcedSolid.has(i)) return true
  return false
}
function edgeSealed(ctx, a, b) { return !!ctx.sealed && ctx.sealed.has(EDGE_KEY(a, b)) }

// true = NÃO bloqueado entre (ax,az)→(bx,bz) em índices de célula (passável = não selada e destino não sólido salvo ignoreCell)
function stepPassable(ctx, ax, az, bx, bz, ignoreCell) {
  if (edgeSealed(ctx, az * ctx.size + ax, bz * ctx.size + bx)) return false
  return !isSolidIdx(ctx, bz * ctx.size + bx, ignoreCell)
}

// Linha de visão no plano XZ — passeia célula a célula como o jogador fazia em
// Player.hasLineOfSight (cantos detectados via dois caminhos possíveis).
export function losClearXZ(ctx, x0, z0, x1, z1, { ignoreCell = -1 } = {}) {
  const size = ctx.size
  const passable = (ax, az, bx, bz) => stepPassable(ctx, ax, az, bx, bz, ignoreCell)
  const dx = x1 - x0, dz = z1 - z0
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL / 30)))
  let pcx = Math.floor(x0 / CELL), pcz = Math.floor(z0 / CELL)
  for (let i = 1; i <= n; i++) {
    const cx = Math.floor((x0 + (dx * i) / n) / CELL), cz = Math.floor((z0 + (dz * i) / n) / CELL)
    if (cx === pcx && cz === pcz) continue
    if (cx !== pcx && cz !== pcz) {
      const viaX = passable(pcx, pcz, cx, pcz) && passable(cx, pcz, cx, cz)
      const viaZ = passable(pcx, pcz, pcx, cz) && passable(pcx, cz, cx, cz)
      if (!viaX && !viaZ) return false
    } else if (!passable(pcx, pcz, cx, cz)) return false
    pcx = cx; pcz = cz
  }
  return true
}

// Raio no plano XZ a partir de `eye` (mundo, metros) na direção `dir` (unitária ou não) até maxDist.
// true = o raio ATINGE oclusão (parede sólida, aresta selada ou fora do mundo) antes de maxDist.
// Usado pela faca: antes esta consulta NÃO via divisórias seladas.
export function rayBlocked(ctx, eye, dir, maxDist, { ignoreCell = -1 } = {}) {
  if (!ctx?.cells || !ctx.size) return false
  const len = Math.hypot(dir[0], dir[2])
  if (len < 1e-6) return false
  const ux = dir[0] / len, uz = dir[2] / len
  const step = 0.08
  let pcx = Math.floor(eye[0] / CELL), pcz = Math.floor(eye[2] / CELL)
  for (let t = 0.18; t <= maxDist; t += step) {
    const x = eye[0] + ux * t, z = eye[2] + uz * t
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    if (cx < 0 || cz < 0 || cx >= ctx.size || cz >= ctx.size) return true
    const ci = cz * ctx.size + cx
    if (isSolidIdx(ctx, ci, ignoreCell)) return true
    if (cx !== pcx || cz !== pcz) {
      // cruzou fronteira de célula — verificar a aresta atravessada (ambas as ordens L do canto)
      const edges = []
      if (cx !== pcx) edges.push([pcx, pcz, cx, pcz])   // saiu por X
      if (cz !== pcz) edges.push([pcx, pcz, pcx, cz])   // saiu por Z
      for (const [ax, az, bx, bz] of edges) {
        if (edgeSealed(ctx, az * ctx.size + ax, bz * ctx.size + bx)) return true
      }
      // canto (x e z mudam no mesmo passo): ambas as travessias têm de estar livres
      if (cx !== pcx && cz !== pcz) {
        const viaXok = !edgeSealed(ctx, pcz * ctx.size + pcx, pcz * ctx.size + cx) && !edgeSealed(ctx, pcz * ctx.size + cx, cz * ctx.size + cx)
        const viaZok = !edgeSealed(ctx, pcz * ctx.size + pcx, cz * ctx.size + pcx) && !edgeSealed(ctx, cz * ctx.size + pcx, cz * ctx.size + cx)
        if (!viaXok && !viaZok) return true
        // se a aresta direta for selada mas a outra via do canto estiver livre, o raio «serpenteia» — permitido
      }
      pcx = cx; pcz = cz
    }
  }
  return false
}

// Resolver círculo (raio r) contra AABBs no plano XZ — pilares e corpos. Devolve [x, z].
export function resolveCircleBoxes(x, z, r, boxes) {
  for (const [x0, z0, x1, z1] of boxes) {
    const nx = Math.max(x0, Math.min(x, x1))
    const nz = Math.max(z0, Math.min(z, z1))
    let dx = x - nx, dz = z - nz
    const d2 = dx * dx + dz * dz
    if (d2 > r * r) continue
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2)
      x = nx + (dx / d) * r; z = nz + (dz / d) * r
    } else {
      // centro dentro da caixa — empurrar pela menor penetração
      const pen = [x - x0 + r, x1 - x + r, z - z0 + r, z1 - z + r]
      const m = Math.min(...pen)
      if (m === pen[0]) x = x0 - r
      else if (m === pen[1]) x = x1 + r
      else if (m === pen[2]) z = z0 - r
      else z = z1 + r
    }
  }
  return [x, z]
}
