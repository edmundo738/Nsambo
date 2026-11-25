// NSAMBO ENGINE — scene.js — constrói a geometria do nível a partir da grelha WFC
// Materiais: 'wall' (papel de parede + POM), 'carpet', 'ceiling', 'panel' (emissivo),
// 'frame' (dourado), 'wood' (escuro), 'keycard' (ouro emissivo), 'baseboard', 'sign' (SAÍDA)
import { OPEN, WALL, findPath } from './wfc.js'

export const CELL = 3.0
export const WALL_H = 3.0

// buffers por bucket de material
function makeBucket() { return { positions: [], normals: [], tangents: [], uvs: [], indices: [] } }
function addQuad(b, v0, v1, v2, v3, normal, tangent, u0v0, u1v1, u2v2, u3v3) {
  const base = b.positions.length / 3
  const verts = [v0, v1, v2, v3]
  const uvs = [u0v0, u1v1, u2v2, u3v3]
  for (let i = 0; i < 4; i++) {
    b.positions.push(verts[i][0], verts[i][1], verts[i][2])
    b.normals.push(normal[0], normal[1], normal[2])
    b.tangents.push(tangent[0], tangent[1], tangent[2], 1)
    b.uvs.push(uvs[i][0], uvs[i][1])
  }
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}
function boxFaces(b, lo, hi) {
  // 6 faces com enrolamento correto visto de fora; uvs em metros
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi
  const S = 1.5
  // +x
  addQuad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0, -1, 0], [z1 / S, y0 / S], [z0 / S, y0 / S], [z0 / S, y1 / S], [z1 / S, y1 / S])
  addQuad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0, 1, 0], [z0 / S, y0 / S], [z1 / S, y0 / S], [z1 / S, y1 / S], [z0 / S, y1 / S])
  addQuad(b, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0], [1, 0, 0, 0], [x1 / S, z0 / S], [x0 / S, z0 / S], [x0 / S, z1 / S], [x1 / S, z1 / S])
  addQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [1, 0, 0, 0], [x0 / S, z0 / S], [x1 / S, z0 / S], [x1 / S, z1 / S], [x0 / S, z1 / S])
  addQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [1, 0, 0, 0], [x0 / S, y0 / S], [x1 / S, y0 / S], [x1 / S, y1 / S], [x0 / S, y1 / S])
  addQuad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-1, 0, 0, 0], [x1 / S, y0 / S], [x0 / S, y0 / S], [x0 / S, y1 / S], [x1 / S, y1 / S])
}
function addCylinder(b, cx, cz, y0, y1, r, seg = 8, uvScale = 1.5) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
    const n = [(c0 + c1) / 2, 0, (s0 + s1) / 2]
    const ln = Math.hypot(n[0], n[2]); n[0] /= ln; n[2] /= ln
    const t = [-Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)]
    addQuad(b,
      [cx + c0 * r, y0, cz + s0 * r], [cx + c1 * r, y0, cz + s1 * r],
      [cx + c1 * r, y1, cz + s1 * r], [cx + c0 * r, y1, cz + s0 * r],
      n, t,
      [a0 * r / uvScale, y0 / uvScale], [a1 * r / uvScale, y0 / uvScale],
      [a1 * r / uvScale, y1 / uvScale], [a0 * r / uvScale, y1 / uvScale])
  }
  // tampa superior
  const top = makeBucket()
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2
    addQuad(top,
      [cx, y1, cz], [cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r],
      [cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r], [cx, y1, cz],
      [0, 1, 0], [1, 0, 0, 0],
      [0, 0], [Math.cos(a0), Math.sin(a0)], [Math.cos(a1), Math.sin(a1)], [0, 0])
  }
  // remover duplicados da tampa (addQuad duplica vértices — ok, é barato)
  b.positions.push(...top.positions); b.normals.push(...top.normals); b.tangents.push(...top.tangents); b.uvs.push(...top.uvs); b.indices.push(...top.indices)
}

export function buildLevelMeshes(lvl) {
  const { cells, size, sealedEdges } = lvl
  const B = {
    wall: makeBucket(), carpet: makeBucket(), ceiling: makeBucket(), panel: makeBucket(),
    frame: makeBucket(), wood: makeBucket(), keycard: makeBucket(), baseboard: makeBucket(),
    sign: makeBucket(), paintingEye: makeBucket(), paintingMtn: makeBucket(),
  }
  const pillarCells = new Set(lvl.pillarCells ?? [])
  const at = (x, z) => z * size + x
  const cellAt = (x, z) => (x < 0 || z < 0 || x >= size || z >= size) ? WALL : cells[at(x, z)]
  const cellToWorld = (cx, cz) => ({ x: cx * CELL + CELL / 2, z: cz * CELL + CELL / 2 })

  // ── chão e tecto ──────────────────────────────────────────────
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL
    if (cellAt(x, z) !== OPEN) {
      // célula de bloco — selar a visão (capacetes opacos), baratos e nunca vistos de perto
      addQuad(B.ceiling, [x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1], [0, -1, 0], [1, 0, 0, 0],
        [x0 / 2.3, z0 / 2.3], [x1 / 2.3, z0 / 2.3], [x1 / 2.3, z1 / 2.3], [x0 / 2.3, z1 / 2.3])
      addQuad(B.carpet, [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [0, 1, 0], [1, 0, 0, 0],
        [x0 / 2, z0 / 2], [x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2])
      continue
    }
    addQuad(B.carpet, [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [0, 1, 0], [1, 0, 0, 0],
      [x0 / 2, z0 / 2], [x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2])
    addQuad(B.ceiling, [x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1], [0, -1, 0], [1, 0, 0, 0],
      [x0 / 2.3, z0 / 2.3], [x1 / 2.3, z0 / 2.3], [x1 / 2.3, z1 / 2.3], [x0 / 2.3, z1 / 2.3])
    // painel fluorescente alinhado à grelha do tecto (a cada 3 células)
    if (x % 3 === 1 && z % 3 === 2) {
      const px = x * CELL + CELL / 2, pz = z * CELL + CELL / 2, pw = 0.75, pd = 0.32
      addQuad(B.panel, [px - pw, WALL_H - 0.015, pz - pd], [px + pw, WALL_H - 0.015, pz - pd], [px + pw, WALL_H - 0.015, pz + pd], [px - pw, WALL_H - 0.015, pz + pd],
        [0, -1, 0], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    }
  }

  // ── paredes (fronteira entre célula aberta e parede/vazio) ─────
  // regista faces candidatas a receber quadros
  const paintingSpots = []
  const faceList = []
  const addWallFace = (openX, openZ, dir) => {
    // dir: 0=+x face da célula aberta, 1=-x, 2=+z, 3=-z
    const x = openX, z = openZ
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL
    const us = 1.5
    if (dir === 0) addQuad(B.wall, [x1, 0, z0], [x1, 0, z1], [x1, WALL_H, z1], [x1, WALL_H, z0], [-1, 0, 0], [0, 0, 1, 0], [z0 / us, 0], [z1 / us, 0], [z1 / us, WALL_H / us], [z0 / us, WALL_H / us])
    else if (dir === 1) addQuad(B.wall, [x0, 0, z1], [x0, 0, z0], [x0, WALL_H, z0], [x0, WALL_H, z1], [1, 0, 0], [0, 0, -1, 0], [z1 / us, 0], [z0 / us, 0], [z0 / us, WALL_H / us], [z1 / us, WALL_H / us])
    else if (dir === 2) addQuad(B.wall, [x1, 0, z1], [x0, 0, z1], [x0, WALL_H, z1], [x1, WALL_H, z1], [0, 0, -1], [-1, 0, 0, 0], [x1 / us, 0], [x0 / us, 0], [x0 / us, WALL_H / us], [x1 / us, WALL_H / us])
    else addQuad(B.wall, [x0, 0, z0], [x1, 0, z0], [x1, WALL_H, z0], [x0, WALL_H, z0], [0, 0, 1], [1, 0, 0, 0], [x0 / us, 0], [x1 / us, 0], [x1 / us, WALL_H / us], [x0 / us, WALL_H / us])
    // rodapé escuro
    const hb = 0.17
    if (dir === 0) addQuad(B.baseboard, [x1 - 0.008, 0, z0], [x1 - 0.008, 0, z1], [x1 - 0.008, hb, z1], [x1 - 0.008, hb, z0], [-1, 0, 0], [0, 0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else if (dir === 1) addQuad(B.baseboard, [x0 + 0.008, 0, z1], [x0 + 0.008, 0, z0], [x0 + 0.008, hb, z0], [x0 + 0.008, hb, z1], [1, 0, 0], [0, 0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else if (dir === 2) addQuad(B.baseboard, [x1, 0, z1 - 0.008], [x0, 0, z1 - 0.008], [x0, hb, z1 - 0.008], [x1, hb, z1 - 0.008], [0, 0, -1], [-1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else addQuad(B.baseboard, [x0, 0, z0 + 0.008], [x1, 0, z0 + 0.008], [x1, hb, z0 + 0.008], [x0, hb, z0 + 0.008], [0, 0, 1], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    faceList.push({ x, z, dir })
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (cellAt(x, z) !== OPEN) continue
    if (cellAt(x + 1, z) === WALL) addWallFace(x, z, 0)
    if (cellAt(x - 1, z) === WALL) addWallFace(x, z, 1)
    if (cellAt(x, z + 1) === WALL) addWallFace(x, z, 2)
    if (cellAt(x, z - 1) === WALL) addWallFace(x, z, 3)
  }

  // ── divisórias seladas (paredes finas) ─────────────────────────
  for (const [a, b] of sealedEdges ?? []) {
    const az = Math.floor(a / size), ax = a % size, bz = Math.floor(b / size), bx = b % size
    const T = 0.055
    if (az === bz) { // divisória vertical (plano x = ax+1)
      const bxp = (ax + 1) * CELL, z0 = az * CELL, z1 = (az + 1) * CELL
      boxFaces(B.wall, [bxp - T, 0, z0], [bxp + T, WALL_H, z1])
    } else { // divisória horizontal (plano z = az+1)
      const bzp = (az + 1) * CELL, x0 = ax * CELL, x1 = (ax + 1) * CELL
      boxFaces(B.wall, [x0, 0, bzp - T], [x1, WALL_H, bzp + T])
    }
  }

  // ── pilares ────────────────────────────────────────────────────
  for (const i of pillarCells) {
    const z = Math.floor(i / size), x = i % size
    const c = cellToWorld(x, z)
    boxFaces(B.wall, [c.x - 0.26, 0, c.z - 0.26], [c.x + 0.26, WALL_H, c.z + 0.26])
  }

  // ── pontos de spawn/saída/chave ────────────────────────────────
  const sp = cellToWorld(lvl.spawn.x, lvl.spawn.z)
  const ex = cellToWorld(lvl.exit.x, lvl.exit.z)
  const kp = lvl.key ? cellToWorld(lvl.key.x, lvl.key.z) : null

  // ── porta de saída: NO BORDO DE ENTRADA do percurso spawn→saída ──
  // (o jogador encara a porta no fim do caminho; nunca escondida noutro canto)
  const path = findPath(lvl)
  const prevIdx = path && path.length >= 2 ? path[path.length - 2] : -1
  const doorInfo = (() => {
    const mk = (axisX, plane, at_, normal) => ({ axisX, plane, dat: at_, normal })
    if (prevIdx >= 0) {
      const px = prevIdx % size, pz = Math.floor(prevIdx / size)
      if (px < lvl.exit.x) return mk(false, lvl.exit.x * CELL, (lvl.exit.z + 0.5) * CELL, [-1, 0, 0])
      if (px > lvl.exit.x) return mk(false, (lvl.exit.x + 1) * CELL, (lvl.exit.z + 0.5) * CELL, [1, 0, 0])
      if (pz < lvl.exit.z) return mk(true, lvl.exit.z * CELL, (lvl.exit.x + 0.5) * CELL, [0, 0, -1])
      return mk(true, (lvl.exit.z + 1) * CELL, (lvl.exit.x + 0.5) * CELL, [0, 0, 1])
    }
    return mk(false, lvl.exit.x * CELL, (lvl.exit.z + 0.5) * CELL, [-1, 0, 0])
  })()
  // moldura (2 ombreiras + verga) e porta dupla — bucket separado p/ animação da porta
  const Door = makeBucket()
  const doorSign = makeBucket()
  const depth = 0.10
  const doorAxisX = doorInfo.axisX   // parede alinhada a x→ porta desliza em x
  const nrm = doorInfo.normal, dat = doorInfo.dat, plane = doorInfo.plane
  if (doorAxisX) {
    boxFaces(B.frame, [dat - 1.12, 0, plane - depth / 2], [dat - 0.97, 2.32, plane + depth / 2])
    boxFaces(B.frame, [dat + 0.97, 0, plane - depth / 2], [dat + 1.12, 2.32, plane + depth / 2])
    boxFaces(B.frame, [dat - 1.12, 2.32, plane - depth / 2], [dat + 1.12, 2.46, plane + depth / 2])
    boxFaces(Door, [dat - 0.97, 0.02, plane - depth / 2], [dat - 0.02, 2.30, plane + depth / 2])
    boxFaces(Door, [dat + 0.02, 0.02, plane - depth / 2], [dat + 0.97, 2.30, plane + depth / 2])
    boxFaces(Door, [dat - 0.13, 1.05, plane - 0.09], [dat - 0.06, 1.18, plane + 0.09])
    boxFaces(Door, [dat + 0.06, 1.05, plane - 0.09], [dat + 0.13, 1.18, plane + 0.09])
  } else {
    boxFaces(B.frame, [plane - depth / 2, 0, dat - 1.12], [plane + depth / 2, 2.32, dat - 0.97])
    boxFaces(B.frame, [plane - depth / 2, 0, dat + 0.97], [plane + depth / 2, 2.32, dat + 1.12])
    boxFaces(B.frame, [plane - depth / 2, 2.32, dat - 1.12], [plane + depth / 2, 2.46, dat + 1.12])
    boxFaces(Door, [plane - depth / 2, 0.02, dat - 0.97], [plane + depth / 2, 2.30, dat - 0.02])
    boxFaces(Door, [plane - depth / 2, 0.02, dat + 0.02], [plane + depth / 2, 2.30, dat + 0.97])
    boxFaces(Door, [plane - 0.09, 1.05, dat - 0.13], [plane + 0.09, 1.18, dat - 0.06])
    boxFaces(Door, [plane - 0.09, 1.05, dat + 0.06], [plane + 0.09, 1.18, dat + 0.13])
  }
  // sinal SAÍDA — encostado ao plano da porta, virado para a abordagem
  {
    const y0 = 2.52, y1 = 2.86, half = 0.55, off = 0.07
    if (doorAxisX) {
      const z = plane + off * nrm[2]
      if (nrm[2] >= 0) addQuad(doorSign, [dat - half, y0, z], [dat + half, y0, z], [dat + half, y1, z], [dat - half, y1, z], [0, 0, 1], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
      else addQuad(doorSign, [dat + half, y0, z], [dat - half, y0, z], [dat - half, y1, z], [dat + half, y1, z], [0, 0, -1], [-1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    } else {
      const x = plane + off * nrm[0]
      if (nrm[0] >= 0) addQuad(doorSign, [x, y0, dat + half], [x, y0, dat - half], [x, y1, dat - half], [x, y1, dat + half], [1, 0, 0], [0, 0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
      else addQuad(doorSign, [x, y0, dat - half], [x, y0, dat + half], [x, y1, dat + half], [x, y1, dat - half], [-1, 0, 0], [0, 0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    }
  }

  // ── pedestal + chave ───────────────────────────────────────────
  const Ped = makeBucket()
  if (kp) {
    addCylinder(Ped, kp.x, kp.z, 0.0, 0.08, 0.26, 8)
    addCylinder(Ped, kp.x, kp.z, 0.08, 0.92, 0.15, 8)
    addCylinder(Ped, kp.x, kp.z, 0.92, 0.98, 0.27, 8)
  }
  // chave: eixo + 2 dentes + anel (ouro)
  const Key = makeBucket()
  boxFaces(Key, [-0.14, -0.018, -0.008], [0.09, 0.018, 0.008])
  boxFaces(Key, [0.045, -0.055, -0.008], [0.085, -0.018, 0.008])
  boxFaces(Key, [0.005, -0.05, -0.008], [0.035, -0.018, 0.008])
  addCylinder(Key, -0.19, 0, -0.028, 0.028, 0.055, 10, 1)

  // ── quadros nas paredes ─────────────────────────────────────────
  const paintings = []
  {
    const candidates = faceList.filter(f => {
      const dSpawn = Math.abs(f.x - lvl.spawn.x) + Math.abs(f.z - lvl.spawn.z)
      const dExit = Math.abs(f.x - lvl.exit.x) + Math.abs(f.z - lvl.exit.z)
      const dKey = kp ? Math.abs(f.x - lvl.key.x) + Math.abs(f.z - lvl.key.z) : 99
      return dSpawn >= 5 && dExit >= 2 && dKey >= 2
    })
    // embrulhar com hash determinístico e espalhar
    let h = 2166136261 >>> 0
    for (const f of candidates) { h ^= (f.x * 73856093) ^ (f.z * 19349663) ^ (f.dir * 83492791); h = Math.imul(h, 16777619) >>> 0; f.h = h }
    candidates.sort((a, b) => a.h - b.h)
    const usedCells = new Set()
    for (const f of candidates) {
      if (paintings.length >= 5) break
      const cellKey = f.x + ':' + f.z + ':' + f.dir
      // espaçar: não dois quadros na mesma célula nem colados
      if (usedCells.has(cellKey)) continue
      usedCells.add(cellKey)
      const off = 0.035, y0 = 1.32, y1 = 2.32
      let cx, cz, n, t
      // donos = célula aberta; o quadro vive DENTRO da sala, encostado à face
      if (f.dir === 0) { cx = (f.x + 1) * CELL - off; cz = (f.z + 0.5) * CELL; n = [-1, 0, 0]; t = [0, 0, 1] }
      else if (f.dir === 1) { cx = f.x * CELL + off; cz = (f.z + 0.5) * CELL; n = [1, 0, 0]; t = [0, 0, -1] }
      else if (f.dir === 2) { cx = (f.x + 0.5) * CELL; cz = (f.z + 1) * CELL - off; n = [0, 0, -1]; t = [-1, 0, 0] }
      else { cx = (f.x + 0.5) * CELL; cz = f.z * CELL + off; n = [0, 0, 1]; t = [1, 0, 0] }
      const w = 0.78, hH = 0.52
      const p = (s, y) => [cx + t[0] * s, y, cz + t[2] * s]
      const isEye = paintings.length === 2 && kp  // um quadro "especial" por nível
      const bucket = isEye ? B.paintingEye : B.paintingMtn
      // moldura dourada atrás
      const fw = w + 0.09
      const pf = (s, y, push) => [cx + t[0] * s + n[0] * push, y, cz + t[2] * s + n[2] * push]
      addQuad(B.frame, pf(-fw, y0 - 0.07, -0.015), pf(fw, y0 - 0.07, -0.015), pf(fw, y1 + 0.07, -0.015), pf(-fw, y1 + 0.07, -0.015), n, t, [0, 0], [1, 0], [1, 1], [0, 1])
      addQuad(bucket, p(-w, y0), p(w, y0), p(w, y1), p(-w, y1), n, t, [0, 0], [1, 0], [1, 1], [0, 1])
      paintings.push({ pos: p(0, (y0 + y1) / 2), normal: n, eye: isEye })
    }
  }

  const meshes = []
  const push = (material, bucket, opts = {}) => {
    if (!bucket.indices.length) return
    meshes.push({
      material, ...opts,
      positions: new Float32Array(bucket.positions),
      normals: new Float32Array(bucket.normals),
      tangents: new Float32Array(bucket.tangents),
      uvs: new Float32Array(bucket.uvs),
      indices: new Uint32Array(bucket.indices),
    })
  }
  push('wall', B.wall, { pom: true })
  push('carpet', B.carpet)
  push('ceiling', B.ceiling)
  push('panel', B.panel, { emissive: true })
  push('frame', B.frame, { untextured: { baseColor: [0.72, 0.55, 0.22], metallic: 1.0, roughness: 0.32 } })
  push('wood', Ped, { untextured: { baseColor: [0.40, 0.26, 0.145], metallic: 0.0, roughness: 0.55 } })
  push('paintingEye', B.paintingEye)
  push('paintingMtn', B.paintingMtn)
  push('sign', doorSign, { emissive: true })
  push('door', Door, { untextured: { baseColor: [0.30, 0.18, 0.09], metallic: 0.1, roughness: 0.55 } })
  push('keycard', Key, { untextured: { baseColor: [1.0, 0.78, 0.25], metallic: 1.0, roughness: 0.25, emissive: [0.55, 0.38, 0.06] } })

  return {
    meshes,
    doorMesh: pushDoor(Door),
    keyMesh: pushDoor(Key),
    spawn: { x: sp.x, y: 1.62, z: sp.z, yaw: lvl.spawn.z * Math.PI * 0 + Math.PI / 4 },
    exit: { x: ex.x, z: ex.z },
    keyPos: kp ? { x: kp.x, y: 1.02, z: kp.z } : null,
    door: { x: doorInfo.axisX ? doorInfo.dat : doorInfo.plane, z: doorInfo.axisX ? doorInfo.plane : doorInfo.dat, axisX: doorAxisX, normal: doorInfo.normal },
    paintings,
  }

  function pushDoor(bucket) {
    return {
      positions: new Float32Array(bucket.positions),
      normals: new Float32Array(bucket.normals),
      tangents: new Float32Array(bucket.tangents),
      uvs: new Float32Array(bucket.uvs),
      indices: new Uint32Array(bucket.indices),
    }
  }
}
