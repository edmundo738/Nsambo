// NSAMBO ENGINE — scene.js — constrói a geometria do nível a partir da grelha WFC
// Materiais: 'wall' (papel de parede + POM), 'carpet', 'ceiling', 'panel' (emissivo),
// 'frame' (dourado), 'wood' (escuro), 'baseboard', 'sign' (SAÍDA), 'door'
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
// faces com UV 0..1 (inteira) — para painéis de porta/textura pintada
function boxFacesUV01(b, lo, hi) {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi
  addQuad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
  addQuad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
  addQuad(b, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
  addQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
  addQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
  addQuad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
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
    wall: makeBucket(), carpet: makeBucket(), ceiling: makeBucket(), panel: makeBucket(), panelBad: makeBucket(), cornice: makeBucket(), bulb: makeBucket(), exitRoom: makeBucket(), fuseDoor: makeBucket(), fuseFrame: makeBucket(),
    frame: makeBucket(), wood: makeBucket(), baseboard: makeBucket(),
    sign: makeBucket(), paintingEye: makeBucket(), paintingMtn: makeBucket(),
    lampHousing: makeBucket(), lampSteel: makeBucket(),
    fusebox: makeBucket(), fuseLamp: makeBucket(),
  }
  const lampSpots = []          // lâmpadas colocadas — main.js usa as 2 mais próximas como luzes pontuais reais
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
    // LUMINÁRIA fluorescente modelada (não é um quad branco): caixa de encastrar escura,
    // bandeja reflectora de aço e 2 tubos emissores. ~20% estão a morrer (bad → sem luz).
    if (x % 3 === 1 && z % 3 === 2) {
      const px = x * CELL + CELL / 2, pz = z * CELL + CELL / 2
      const h = ((x * 73856093) ^ (z * 19349663)) >>> 0
      const dead = (h % 5 === 0)
      // caixa de encastrar (aço escuro) — encostada ao tecto mas SALIENTE 15 cm (montagem visível)
      boxFaces(B.lampHousing, [px - 0.84, WALL_H - 0.150, pz - 0.28], [px + 0.84, WALL_H - 0.004, pz + 0.28])
      // bandeja reflectora (aço claro) — fundo do recetáculo (dentro da caixa, por cima dos tubos)
      boxFaces(B.lampSteel, [px - 0.74, WALL_H - 0.150, pz - 0.19], [px + 0.74, WALL_H - 0.142, pz + 0.19])
      // dois tubos (T8) — quads emissores ABAIXO da caixa, afastados 0.095 do eixo
      const bucket = dead ? B.panelBad : B.panel
      for (const dz of [-0.095, 0.095]) {
        addQuad(bucket, [px - 0.70, WALL_H - 0.158, pz + dz - 0.042], [px + 0.70, WALL_H - 0.158, pz + dz - 0.042], [px + 0.70, WALL_H - 0.158, pz + dz + 0.042], [px - 0.70, WALL_H - 0.158, pz + dz + 0.042],
          [0, -1, 0], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
      }
      lampSpots.push({ x: px, y: WALL_H - 0.158, z: pz, bad: dead })
    }
  }

  // ── porta de saída: NO BORDO DE ENTRADA do percurso spawn→saída ──
  // Calculada cedo: a PAREDE DO VÃO precisa dela (a porta vive DENTRO de uma parede real,
  // não solta num bordo de células abertas).
  const path = findPath(lvl)
  const prevIdx = path && path.length >= 2 ? path[path.length - 2] : -1
  // ── acabamento do quadro: friso saliente, dobradiças, puxador, parafusos e porta texturada ──
  function buildFuseDress(axis, c, y0, y1, door, zn, sgn) {
    const fr = 0.045, fp = 0.014
    const box = (lo, hi, bucket) => boxFaces(bucket ?? B.fuseFrame, lo, hi)
    const at = (a, b, off) => axis === 'z' ? [a, b, zn + sgn * off] : [zn + sgn * off, b, a]
    const boxW = axis === 'z'
      ? (lo1, hi1, lo2, hi2, off, b2) => box([lo1, lo2, zn + sgn * off], [hi1, hi2, zn + sgn * (off + fp)], b2)
      : (lo1, hi1, lo2, hi2, off, b2) => box([zn + sgn * off, lo2, lo1], [zn + sgn * (off + fp), hi2, hi1], b2)
    // friso (moldura saliente)
    boxW(c - door - 0.012, c + door + 0.012, y1, y1 + fr, 0)
    boxW(c - door - 0.012, c + door + 0.012, y0 - fr, y0, 0)
    boxW(c - door - fr, c - door, y0 - fr, y1 + fr, 0)
    boxW(c + door, c + door + fr, y0 - fr, y1 + fr, 0)
    // dobradiças (lado direito da porta)
    boxW(c + door - 0.055, c + door - 0.015, y1 - 0.17, y1 - 0.05, fp, B.lampSteel)
    boxW(c + door - 0.055, c + door - 0.015, y0 + 0.05, y0 + 0.17, fp, B.lampSteel)
    // puxador vertical
    boxW(c + door - 0.115, c + door - 0.075, y0 + 0.26, y1 - 0.26, fp + 0.008, B.fusebox)
    // parafusos dos cantos
    for (const sx of [-1, 1]) for (const [sy, sc] of [[-1, y0 + 0.052], [1, y1 - 0.052]]) {
      const cxr = c + sx * (door - 0.056)
      boxW(cxr - 0.015, cxr + 0.015, sc - 0.015, sc + 0.015, fp + 0.002, B.lampSteel)
    }
    // piloto âmbar pequeno acima da porta, encostado ao friso (indica "energizado")
    boxW(c - 0.022, c + 0.022, y1 + 0.006, y1 + fr - 0.004, fp * 0.6, B.fuseLamp)
    // porta com a textura de aço escovado — quad UV 0..1, orientação pelo sinal da face
    const zn2 = zn + sgn * 0.002
    const n = axis === 'z' ? [0, 0, sgn] : [sgn, 0, 0]
    const t = axis === 'z' ? (sgn > 0 ? [1, 0, 0, 0] : [-1, 0, 0, 0]) : (sgn > 0 ? [0, 0, -1, 0] : [0, 0, 1, 0])
    const quad = (s0, s1, fa, fb) => axis === 'z'
      ? (sgn > 0
        ? addQuad(B.fuseDoor, [s0, fa, zn2], [s1, fa, zn2], [s1, fb, zn2], [s0, fb, zn2], n, t, [0, 0], [1, 0], [1, 1], [0, 1])
        : addQuad(B.fuseDoor, [s1, fa, zn2], [s0, fa, zn2], [s0, fb, zn2], [s1, fb, zn2], n, t, [0, 0], [1, 0], [1, 1], [0, 1]))
      : (sgn > 0
        ? addQuad(B.fuseDoor, [zn2, fa, s1], [zn2, fa, s0], [zn2, fb, s0], [zn2, fb, s1], n, t, [0, 0], [1, 0], [1, 1], [0, 1])
        : addQuad(B.fuseDoor, [zn2, fa, s0], [zn2, fa, s1], [zn2, fb, s1], [zn2, fb, s0], n, t, [0, 0], [1, 0], [1, 1], [0, 1]))
    quad(c - door, c + door, y0, y1)
  }
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

  // ── paredes (fronteira entre célula aberta e parede/vazio) ─────
  // regista faces candidatas a receber quadros
  const paintingSpots = []
  const faceList = []
  const addWallFace = (openX, openZ, dir) => {
    // dir: 0=+x face da célula aberta, 1=-x, 2=+z, 3=-z
    const x = openX, z = openZ
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL
    const us = 1.5, TH = WALL_H + 0.07
    if (dir === 0) addQuad(B.wall, [x1, 0, z0], [x1, 0, z1], [x1, TH, z1], [x1, TH, z0], [-1, 0, 0], [0, 0, 1, 0], [z0 / us, 0], [z1 / us, 0], [z1 / us, TH / us], [z0 / us, TH / us])
    else if (dir === 1) addQuad(B.wall, [x0, 0, z1], [x0, 0, z0], [x0, TH, z0], [x0, TH, z1], [1, 0, 0], [0, 0, -1, 0], [z1 / us, 0], [z0 / us, 0], [z0 / us, TH / us], [z1 / us, TH / us])
    else if (dir === 2) addQuad(B.wall, [x1, 0, z1], [x0, 0, z1], [x0, TH, z1], [x1, TH, z1], [0, 0, -1], [-1, 0, 0, 0], [x1 / us, 0], [x0 / us, 0], [x0 / us, TH / us], [x1 / us, TH / us])
    else addQuad(B.wall, [x0, 0, z0], [x1, 0, z0], [x1, TH, z0], [x0, TH, z0], [0, 0, 1], [1, 0, 0, 0], [x0 / us, 0], [x1 / us, 0], [x1 / us, TH / us], [x0 / us, TH / us])
    // cornija — moldura escura no encontro parede/teto (esconde qualquer greta)
    const cb = 0.085, cOff = 0.010
    if (dir === 0) addQuad(B.cornice, [x1 - cOff, WALL_H - cb, z0], [x1 - cOff, WALL_H - cb, z1], [x1 - cOff, WALL_H, z1], [x1 - cOff, WALL_H, z0], [-1, 0, 0], [0, 0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else if (dir === 1) addQuad(B.cornice, [x0 + cOff, WALL_H - cb, z1], [x0 + cOff, WALL_H - cb, z0], [x0 + cOff, WALL_H, z0], [x0 + cOff, WALL_H, z1], [1, 0, 0], [0, 0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else if (dir === 2) addQuad(B.cornice, [x1, WALL_H - cb, z1 - cOff], [x0, WALL_H - cb, z1 - cOff], [x0, WALL_H, z1 - cOff], [x1, WALL_H, z1 - cOff], [0, 0, -1], [-1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
    else addQuad(B.cornice, [x0, WALL_H - cb, z0 + cOff], [x1, WALL_H - cb, z0 + cOff], [x1, WALL_H, z0 + cOff], [x0, WALL_H, z0 + cOff], [0, 0, 1], [1, 0, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1])
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
  // ── sala de saída: arestas fora do mapa recebem face de parede de papel ──
  if (lvl.exit.x + 1 >= size) addWallFace(lvl.exit.x, lvl.exit.z, 0)
  if (lvl.exit.x - 1 <  0)    addWallFace(lvl.exit.x, lvl.exit.z, 1)
  if (lvl.exit.z + 1 >= size) addWallFace(lvl.exit.x, lvl.exit.z, 2)
  if (lvl.exit.z - 1 <  0)    addWallFace(lvl.exit.x, lvl.exit.z, 3)

  // ── divisórias seladas (paredes finas) ─────────────────────────
  for (const [a, b] of sealedEdges ?? []) {
    const az = Math.floor(a / size), ax = a % size, bz = Math.floor(b / size), bx = b % size
    const T = 0.055
    if (az === bz) { // divisória vertical (plano x = ax+1)
      const bxp = (ax + 1) * CELL, z0 = az * CELL, z1 = (az + 1) * CELL
      boxFaces(B.wall, [bxp - T, 0, z0], [bxp + T, WALL_H + 0.07, z1])
    } else { // divisória horizontal (plano z = az+1)
      const bzp = (az + 1) * CELL, x0 = ax * CELL, x1 = (ax + 1) * CELL
      boxFaces(B.wall, [x0, 0, bzp - T], [x1, WALL_H + 0.07, bzp + T])
    }
  }

  // ── pilares ────────────────────────────────────────────────────
  for (const i of pillarCells) {
    const z = Math.floor(i / size), x = i % size
    const c = cellToWorld(x, z)
    boxFaces(B.wall, [c.x - 0.15, 0.16, c.z - 0.15], [c.x + 0.15, 2.64, c.z + 0.15])          // fuste esbelto (30 cm)
    boxFaces(B.wall, [c.x - 0.19, 2.64, c.z - 0.19], [c.x + 0.19, 2.86, c.z + 0.19])          // capitel
    boxFaces(B.baseboard, [c.x - 0.185, 0, c.z - 0.185], [c.x + 0.185, 0.16, c.z + 0.185])    // base — ancora o pilar ao chão
  }

  // ── pontos de spawn/saída/chave ────────────────────────────────
  const sp = cellToWorld(lvl.spawn.x, lvl.spawn.z)
  const ex = cellToWorld(lvl.exit.x, lvl.exit.z)
  const kp = lvl.key ? cellToWorld(lvl.key.x, lvl.key.z) : null

  // ── PAREDE DO VÃO: a fronteira prev↔exit vira parede com porta recortada ──
  // (antes: folha e moldura soltas entre duas células abertas — "a porta não faz parte
  //  da parede"). Agora: muro com vão 224 cm × 246 cm + ombreiras de 12 cm.
  {
    const T = 0.07, OP_HW = 1.12, OP_H = 2.46
    if (doorInfo.axisX) {
      const plane = doorInfo.plane, dat = doorInfo.dat
      const x0 = lvl.exit.x * CELL, x1 = x0 + CELL
      boxFaces(B.wall, [x0, 0, plane - T], [dat - OP_HW, WALL_H, plane + T])
      boxFaces(B.wall, [dat + OP_HW, 0, plane - T], [x1, WALL_H, plane + T])
      boxFaces(B.wall, [dat - OP_HW, OP_H, plane - T], [dat + OP_HW, WALL_H + 0.07, plane + T])
    } else {
      const plane = doorInfo.plane, dat = doorInfo.dat
      const z0 = lvl.exit.z * CELL, z1 = z0 + CELL
      boxFaces(B.wall, [plane - T, 0, z0], [plane + T, WALL_H, dat - OP_HW])
      boxFaces(B.wall, [plane - T, 0, dat + OP_HW], [plane + T, WALL_H, z1])
      boxFaces(B.wall, [plane - T, OP_H, dat - OP_HW], [plane + T, WALL_H + 0.07, dat + OP_HW])
    }
  }

  // ── sala de saída: lâmpada nua pendurada + engradado de madeira no canto ──
  // o "além" tem luz própria — funil quente, discreto, atrás da porta
  {
    const ex = cellToWorld(lvl.exit.x, lvl.exit.z)
    // cordão + casquilho + bolha emissiva
    boxFaces(B.lampHousing, [ex.x - 0.006, WALL_H - 0.36, ex.z - 0.006], [ex.x + 0.006, WALL_H + 0.02, ex.z + 0.006])
    boxFaces(B.lampSteel,   [ex.x - 0.038, WALL_H - 0.40, ex.z - 0.038], [ex.x + 0.038, WALL_H - 0.36, ex.z + 0.038])
    boxFaces(B.bulb,        [ex.x - 0.056, WALL_H - 0.51, ex.z - 0.056], [ex.x + 0.056, WALL_H - 0.40, ex.z + 0.056])
    // engradado no canto oposto ao vão da porta
    const off = 0.64
    let cx, cz
    if (doorInfo.axisX) {
      cx = lvl.exit.x * CELL + CELL / 2
      cz = (doorInfo.plane <= lvl.exit.z * CELL + CELL / 2) ? lvl.exit.z * CELL + CELL - off : lvl.exit.z * CELL + off
    } else {
      cz = lvl.exit.z * CELL + CELL / 2
      cx = (doorInfo.plane <= lvl.exit.x * CELL + CELL / 2) ? lvl.exit.x * CELL + CELL - off : lvl.exit.x * CELL + off
    }
    boxFaces(B.exitRoom, [cx - 0.30, 0, cz - 0.30], [cx + 0.30, 0.50, cz + 0.30])
    boxFaces(B.exitRoom, [cx - 0.305, 0.44, cz - 0.305], [cx + 0.305, 0.50, cz + 0.305])
    boxFaces(B.exitRoom, [cx - 0.22, 0.50, cz - 0.22], [cx + 0.22, 0.54, cz + 0.22])
  }

  // moldura (2 ombreiras + verga) e porta dupla — folhas SEPARADAS p/ deslizarem para os bolsos
  const DoorL = makeBucket()
  const DoorR = makeBucket()
  const doorHwL = makeBucket()  // ferragens (maçanetas) — latão polido, separado da folha
  const doorHwR = makeBucket()
  const doorSign = makeBucket()
  const depth = 0.10
  const doorAxisX = doorInfo.axisX   // parede alinhada a x→ porta desliza em x
  const nrm = doorInfo.normal, dat = doorInfo.dat, plane = doorInfo.plane
  if (doorAxisX) {
    boxFaces(B.frame, [dat - 1.12, 0, plane - depth / 2], [dat - 0.97, 2.32, plane + depth / 2])
    boxFaces(B.frame, [dat + 0.97, 0, plane - depth / 2], [dat + 1.12, 2.32, plane + depth / 2])
    boxFaces(B.frame, [dat - 1.12, 2.32, plane - depth / 2], [dat + 1.12, 2.46, plane + depth / 2])
    boxFacesUV01(DoorL, [dat - 0.97, 0.02, plane - depth / 2], [dat - 0.02, 2.30, plane + depth / 2])
    boxFacesUV01(DoorR, [dat + 0.02, 0.02, plane - depth / 2], [dat + 0.97, 2.30, plane + depth / 2])
    boxFaces(doorHwL, [dat - 0.13, 1.05, plane - 0.09], [dat - 0.06, 1.18, plane + 0.09])
    boxFaces(doorHwR, [dat + 0.06, 1.05, plane - 0.09], [dat + 0.13, 1.18, plane + 0.09])
  } else {
    boxFaces(B.frame, [plane - depth / 2, 0, dat - 1.12], [plane + depth / 2, 2.32, dat - 0.97])
    boxFaces(B.frame, [plane - depth / 2, 0, dat + 0.97], [plane + depth / 2, 2.32, dat + 1.12])
    boxFaces(B.frame, [plane - depth / 2, 2.32, dat - 1.12], [plane + depth / 2, 2.46, dat + 1.12])
    boxFacesUV01(DoorL, [plane - depth / 2, 0.02, dat - 0.97], [plane + depth / 2, 2.30, dat - 0.02])
    boxFacesUV01(DoorR, [plane - depth / 2, 0.02, dat + 0.02], [plane + depth / 2, 2.30, dat + 0.97])
    boxFaces(doorHwL, [plane - 0.09, 1.05, dat - 0.13], [plane + 0.09, 1.18, dat - 0.06])
    boxFaces(doorHwR, [plane - 0.09, 1.05, dat + 0.06], [plane + 0.09, 1.18, dat + 0.13])
  }
  // sinal SAÍDA — encostado ao plano da porta, virado para a abordagem
  {
    const y0 = 2.52, y1 = 2.86, half = 0.55, off = 0.085   // +1,5 cm à frente da face do lintéu (T=0,07) — evita z-fight com a parede
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

  // ── quadro elétrico (interativo) — parede lateral do penúltimo troço do corredor da saída ──
  const fuseboxPos = (() => {
    const wallCandidates = []
    if (path && path.length >= 3) {
      for (let i = path.length - 2; i >= Math.max(0, path.length - 9); i--) {
        const idx = path[i]
        wallCandidates.push({ px: idx % size, pz: Math.floor(idx / size), next: path[i + 1] })
      }
    } else if (prevIdx >= 0) {
      wallCandidates.push({ px: prevIdx % size, pz: Math.floor(prevIdx / size), next: -1 })
    }
    for (const { px, pz, next } of wallCandidates) {
      const res = placeFusebox(px, pz, next)
      if (res) return res
    }
    return null

    function placeFusebox(px, pz, nextIdx) {
    const y0 = 0.98, y1 = 1.62, hw = 0.34, D = 0.10
    // direção de viagem desta célula para a seguinte (ou exit, se for o fim)
    const nxt = nextIdx >= 0 ? nextIdx : (lvl.exit.z * size + lvl.exit.x)
    const nx = nxt % size, nz = Math.floor(nxt / size)
    const sides = []
    if (nx !== px) {   // viajamos em x → paredes em z
      sides.push({ axis: 'z', cell: pz + 1, at: (pz + 1) * CELL, face: -1 })
      sides.push({ axis: 'z', cell: pz - 1, at: pz * CELL,       face: 1 })
    } else if (nz !== pz) {  // viajamos em z → paredes em x
      sides.push({ axis: 'x', cell: px + 1, at: (px + 1) * CELL, face: -1 })
      sides.push({ axis: 'x', cell: px - 1, at: px * CELL,       face: 1 })
    } else {           // célula virada para a saída — tenta qualquer parede lateral
      sides.push({ axis: 'z', cell: pz + 1, at: (pz + 1) * CELL, face: -1 })
      sides.push({ axis: 'z', cell: pz - 1, at: pz * CELL,       face: 1 })
      sides.push({ axis: 'x', cell: px + 1, at: (px + 1) * CELL, face: -1 })
      sides.push({ axis: 'x', cell: px - 1, at: px * CELL,       face: 1 })
    }
    for (const s of sides) {
      const wx = s.axis === 'z' ? px : s.cell    // índice da célula vizinha
      const wz = s.axis === 'z' ? s.cell : pz
      if (cellAt(wx, wz) !== WALL) continue
      const ax = s.axis === 'z' ? (px + 0.5) * CELL : s.at
      const az = s.axis === 'z' ? s.at : (pz + 0.5) * CELL
      const door = 0.34
      if (s.axis === 'z') {
        const zFace = s.at
        if (s.face === -1) boxFaces(B.fusebox, [ax - door, y0, zFace - D], [ax + door, y1, zFace + 0.06])
        else               boxFaces(B.fusebox, [ax - door, y0, zFace - 0.06], [ax + door, y1, zFace + D])
        const zn = s.face === -1 ? zFace - D - 0.004 : zFace + D + 0.004
        // ── acabamento: friso, dobradiças, puxador, parafusos, porta com textura ──
        const sgnZ = s.face === -1 ? -1 : 1
        buildFuseDress('z', ax, y0, y1, door, zn, sgnZ)
        return { x: ax, y: (y0 + y1) / 2, z: zFace + (s.face === -1 ? -D : D), face: s.face, axis: 'z' }
      } else {
        const xFace = s.at
        if (s.face === -1) boxFaces(B.fusebox, [xFace - D, y0, az - door], [xFace + 0.06, y1, az + door])
        else               boxFaces(B.fusebox, [xFace - 0.06, y0, az - door], [xFace + D, y1, az + door])
        const xn = s.face === -1 ? xFace - D - 0.004 : xFace + D + 0.004
        const sgnX = s.face === -1 ? -1 : 1
        buildFuseDress('x', az, y0, y1, door, xn, sgnX)
        return { x: xFace + (s.face === -1 ? -D : D), y: (y0 + y1) / 2, z: az, face: s.face, axis: 'x' }
      }
    }
    return null
    }
  })()

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
  push('cornice', B.cornice, { untextured: { baseColor: [0.20, 0.16, 0.105], metallic: 0.0, roughness: 0.85 } })
  push('bulb', B.bulb, { emissive: true })
  push('wood', B.exitRoom, { untextured: { baseColor: [0.40, 0.26, 0.145], metallic: 0.0, roughness: 0.55 } })
  push('panel', B.panel, { emissive: true })
  push('panelBad', B.panelBad, { emissive: true })
  push('frame', B.frame, { untextured: { baseColor: [0.72, 0.55, 0.22], metallic: 1.0, roughness: 0.32 } })
  push('wood', Ped, { untextured: { baseColor: [0.40, 0.26, 0.145], metallic: 0.0, roughness: 0.55 } })
  push('paintingEye', B.paintingEye)
  push('paintingMtn', B.paintingMtn)
  push('sign', doorSign, { emissive: true })
  push('lampHousing', B.lampHousing, { untextured: { baseColor: [0.14, 0.14, 0.16], metallic: 0.55, roughness: 0.62 } })
  push('lampSteel', B.lampSteel, { untextured: { baseColor: [0.34, 0.36, 0.40], metallic: 0.85, roughness: 0.45 } })
  push('fusebox', B.fusebox, { untextured: { baseColor: [0.15, 0.15, 0.16], metallic: 0.6, roughness: 0.55 } })
  push('fuseLamp', B.fuseLamp, { emissive: true })
  push('fuseDoor', B.fuseDoor)
  push('fuseFrame', B.fuseFrame, { untextured: { baseColor: [0.27, 0.28, 0.31], metallic: 0.8, roughness: 0.42 } })

  return {
    meshes,
    doorMeshes: { left: pushDoor(DoorL), right: pushDoor(DoorR), hwLeft: pushDoor(doorHwL), hwRight: pushDoor(doorHwR) },
    lamps: lampSpots,
    spawn: { x: sp.x, y: 1.62, z: sp.z, yaw: lvl.spawn.z * Math.PI * 0 + Math.PI / 4 },
    exit: { x: ex.x, z: ex.z },
    keyPos: kp ? { x: kp.x, y: 1.02, z: kp.z } : null,
    door: { x: doorInfo.axisX ? doorInfo.dat : doorInfo.plane, z: doorInfo.axisX ? doorInfo.plane : doorInfo.dat, axisX: doorAxisX, normal: doorInfo.normal, plane: doorInfo.plane, dat: doorInfo.dat },
    fusebox: fuseboxPos,
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
