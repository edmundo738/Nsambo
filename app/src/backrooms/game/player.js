// NSAMBO ENGINE — player.js — controlador FPS (movimento, gravidade/salto, estamina,
// colisão círculo × grelha + arestas seladas + barreira da porta de saída)
import { CELL, WALL_H } from '../engine/scene.js'
import { OPEN, WALL } from '../engine/wfc.js'

const EDGE_KEY = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a)
const RADIUS = 0.34
const EYE = 1.62
const GRAV = 12.5

const EYE_CROUCH = 1.02
export class Player {
  constructor(lvl) {
    this.lvl = lvl
    this.size = lvl.size
    this.sealed = new Set((lvl.sealedEdges ?? []).map(([a, b]) => EDGE_KEY(a, b)))
    this.exitIdx = lvl.exit.z * this.size + lvl.exit.x
    this.exitBlocked = true        // a porta só abre com a chave
    // colunas finas dos Backrooms — obstáculos físicos em células abertas
    this.columns = (lvl.pillarCells ?? []).map(i => {
      const cx = (i % this.size) * CELL + CELL / 2, cz = Math.floor(i / this.size) * CELL + CELL / 2
      return [cx - 0.175, cz - 0.175, cx + 0.175, cz + 0.175]
    })
    // spawn (célula -> mundo)
    this.x = lvl.spawn.x * CELL + CELL / 2
    this.z = lvl.spawn.z * CELL + CELL / 2
    this.feet = 0
    this.vy = 0
    this.yaw = Math.PI * 0.75
    this.pitch = 0
    this.stamina = 1.0
    this.exhausted = false
    this.bobPhase = 0
    this.bobAmount = 0
    this.stepDistance = 0
    this.finished = false
    this.crouch = false            // AGACHAR — [C] alterna; silencioso, lento, baixo
    this.eyeH = EYE                // altura actual dos olhos (interpola para agachar)
    this.roll = 0                  // inclinação lateral da câmara no strafe (suavizada)
    this.landDip = 0               // afundar da câmara ao aterrar
  }
  setCrouch(v) { this.crouch = !!v }
  cellAt(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return WALL
    return this.lvl.cells[cz * this.size + cx]
  }
  isSolid(cx, cz) {
    if (this.cellAt(cx, cz) === WALL) return true
    const i = cz * this.size + cx
    if (this.exitBlocked && i === this.exitIdx) return true
    return false
  }
  // aresta selada entre as células (cx,cz) e (nx,nz)?
  isEdgeSealed(cx, cz, nx, nz) {
    if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) return false
    return this.sealed.has(EDGE_KEY(cz * this.size + cx, nz * this.size + nx))
  }
  update(dt, input, sensitivity = 0.0023) {
    // rato → orientação
    // convenção: yaw=0 → olhar −Z; yaw cresce no sentido horário (vista roda p/ a direita com rato p/ a direita)
    const md = input.consumeMouseDelta()
    this.yaw += md.x * sensitivity
    this.pitch -= md.y * sensitivity
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch))
    // direção no plano
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const fwd = [sinY, 0, -cosY]      // yaw=0 → -Z
    const right = [cosY, 0, sinY]
    let mx = 0, mz = 0
    if (input.isDown('KeyW')) { mx += fwd[0]; mz += fwd[2] }
    if (input.isDown('KeyS')) { mx -= fwd[0]; mz -= fwd[2] }
    if (input.isDown('KeyD')) { mx += right[0]; mz += right[2] }
    if (input.isDown('KeyA')) { mx -= right[0]; mz -= right[2] }
    const len = Math.hypot(mx, mz)
    const moving = len > 0.001
    if (moving) { mx /= len; mz /= len }
    // estamina / sprint (agachado não corre; ruído é a metade)
    const wantsSprint = input.isSprint() && moving && !this.crouch
    if (this.exhausted && this.stamina > 0.3) this.exhausted = false
    const sprinting = wantsSprint && !this.exhausted && this.stamina > 0.02
    if (sprinting) this.stamina = Math.max(0, this.stamina - 0.30 * dt)
    else this.stamina = Math.min(1, this.stamina + (this.crouch ? 0.30 : 0.185) * dt)
    if (this.stamina <= 0.02) this.exhausted = true
    const speed = this.crouch ? 1.5 : (sprinting ? 4.6 : 2.7)
    // física vertical
    const vyBefore = this.vy
    if (input.isDown('Space') && this.feet <= 0.001) this.vy = 4.7
    this.vy -= GRAV * dt
    this.feet += this.vy * dt
    if (this.feet <= 0) {
      if (vyBefore < -5.2) this.landDip = 0.13          // aterrou de salto — a câmara cede
      this.feet = 0; this.vy = 0
    }
    this.landDip = Math.max(0, this.landDip - dt * 0.42)
    // movimento no plano + colisão (2 iterações)
    let nx = this.x + mx * speed * dt
    let nz = this.z + mz * speed * dt
    for (let iter = 0; iter < 2; iter++) {
      const res = this._resolve(nx, nz)
      nx = res[0]; nz = res[1]
    }
    this.x = nx; this.z = nz
    // head-bob + distância de passada
    // agachar — altura dos olhos interpolada; bob e strafe-roll reduzidos/suavizados
    const eyeTarget = this.crouch ? EYE_CROUCH : EYE
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 9)
    const lat = moving ? (mx * right[0] + mz * right[2]) : 0    // +1 strafe direita
    const rollTarget = -lat * (this.crouch ? 0.020 : 0.030)
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 7)
    const bobScale = this.crouch ? 0.018 : 1
    const horizSpeed = moving ? speed : 0
    this.bobAmount += ((moving ? (sprinting ? 1 : this.crouch ? 0.32 : 0.55) : 0) - this.bobAmount) * Math.min(1, dt * 8)
    this.bobPhase += horizSpeed * dt * 1.9
    const before = this.stepDistance
    if (moving) this.stepDistance += horizSpeed * dt
    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmount * bobScale
    const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmount * bobScale
    this.camEye = [this.x + right[0] * bobX, this.eyeH + this.feet + bobY - this.landDip, this.z + right[2] * bobX]
    return { eyeX: this.camEye[0], eyeZ: this.camEye[2], eyeY: this.camEye[1], moving, sprinting, crouch: this.crouch, roll: this.roll, stepped: this.stepDistance - before }
  }
  _resolve(px, pz) {
    // círculo vs AABBs de células sólidas + divisórias seladas
    let x = px, z = pz
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cellX = cx + dx, cellZ = cz + dz
      if (this.isSolid(cellX, cellZ)) {
        const box = [cellX * CELL, cellZ * CELL, cellX * CELL + CELL, cellZ * CELL + CELL]
        const res = pushCircleOutOfBox(x, z, RADIUS, box)
        x = res[0]; z = res[1]
      } else if (cellX >= 0 && cellZ >= 0 && cellX < this.size && cellZ < this.size) {
        // colunas finas desta célula (obstáculo físico, célula aberta)
        for (const box of this.columns) {
          const cxi = Math.floor(((box[0] + box[2]) / 2) / CELL), czi = Math.floor(((box[1] + box[3]) / 2) / CELL)
          if (cxi !== cellX || czi !== cellZ) continue
          const res = pushCircleOutOfBox(x, z, RADIUS, box)
          x = res[0]; z = res[1]
        }
        // arestas seladas desta célula com os vizinhos E e S (para não repetir)
        if (this.isEdgeSealed(cellX, cellZ, cellX + 1, cellZ)) {
          const bx = (cellX + 1) * CELL
          const res = pushCircleOutOfBox(x, z, RADIUS, [bx - 0.06, cellZ * CELL, bx + 0.06, cellZ * CELL + CELL])
          x = res[0]; z = res[1]
        }
        if (this.isEdgeSealed(cellX, cellZ, cellX, cellZ + 1)) {
          const bz = (cellZ + 1) * CELL
          const res = pushCircleOutOfBox(x, z, RADIUS, [cellX * CELL, bz - 0.06, cellX * CELL + CELL, bz + 0.06])
          x = res[0]; z = res[1]
        }
      }
    }
    return [x, z]
  }
  // linha de visão XZ (células sólidas + arestas seladas). ignoreCell: índice de célula sólida a ignorar (porta da saída)
  hasLineOfSight(x0, z0, x1, z1, ignoreCell = -1) {
    const passable = (ax, az, bx, bz) => {
      if (this.isEdgeSealed(ax, az, bx, bz)) return false
      return !(this.isSolid(bx, bz) && bz * this.size + bx !== ignoreCell)
    }
    const dx = x1 - x0, dz = z1 - z0
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1))
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
  forward() { return [Math.sin(this.yaw), 0, -Math.cos(this.yaw)] }
  lookDir() {
    const cp = Math.cos(this.pitch)
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp]
  }
  currentCell() { return { x: Math.floor(this.x / CELL), z: Math.floor(this.z / CELL) } }
}

function pushCircleOutOfBox(x, z, r, [x0, z0, x1, z1]) {
  const nx = Math.max(x0, Math.min(x, x1))
  const nz = Math.max(z0, Math.min(z, z1))
  let dx = x - nx, dz = z - nz
  const d2 = dx * dx + dz * dz
  if (d2 > r * r) return [x, z]
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2)
    return [nx + (dx / d) * r, nz + (dz / d) * r]
  }
  // centro dentro da caixa — empurrar na menor penetração
  const pen = [x - x0 + r, x1 - x + r, z - z0 + r, z1 - z + r]
  const m = Math.min(...pen)
  if (m === pen[0]) return [x0 - r, z]
  if (m === pen[1]) return [x1 + r, z]
  if (m === pen[2]) return [x, z0 - r]
  return [x, z1 + r]
}
