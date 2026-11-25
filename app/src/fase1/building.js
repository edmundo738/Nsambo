import * as THREE from 'three'
import { uvScaledPlane } from './materials.js'

// ---------------------------------------------------------------------------
// O EDIFÍCIO (Fase 1) — pódio + torre, construção por planos UV-escalados
// sobre núcleo oculto. Unidade: metros. Face frontal: +z.
//   Pódio: y 0 .. 8.4 | Torre: y 8.4 .. 48.0 | Ático: 48.0 .. 53.7
// ---------------------------------------------------------------------------

const TOWER = { w: 22, h: 39.6, d: 10.5, x0: 0, y0: 8.4, zFace: 0.4, zC: -4.85, floorH: 3.6, floors: 11 }
const PODIUM = { w: 34, h: 8.4, d: 12, x0: 0, zFace: 3.2, zC: -2.8 }

export function buildBuilding(scene, M) {
  const B = new THREE.Group()
  B.name = 'edificio'

  const box = (w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; B.add(m); return m
  }
  const plane = (w, h, tile, mat, x, y, z, rotY = 0, parent = B) => {
    const m = new THREE.Mesh(uvScaledPlane(w, h, tile), mat)
    m.position.set(x, y, z); m.rotation.y = rotY; m.receiveShadow = true; parent.add(m); return m
  }
  const dummy = new THREE.Object3D()

  // ============================ NÚCLEOS OCULTOS ============================
  // Pódio: núcleo apenas acima da montra (3.6..8.4) — o piso de retalho fica aberto.
  box(PODIUM.w, 4.8, 11.8, M.coreDark, 0, 6.0, -2.9, { cast: true })
  // Fachadas laterais e tardoz do pódio (nada fica vazado)
  plane(12, PODIUM.h, 4, M.concreteWall, -17.005, 4.2, PODIUM.zC, -Math.PI / 2)
  plane(12, PODIUM.h, 4, M.concreteWall, 17.005, 4.2, PODIUM.zC, Math.PI / 2)
  plane(PODIUM.w, PODIUM.h, 4, M.concreteWall, 0, 4.2, -8.805, Math.PI)
  // Torre: face frontal recuada do vidro (evita z-fighting e oclusão)
  box(TOWER.w, TOWER.h, 10.3, M.coreDark, 0, TOWER.y0 + TOWER.h / 2, -4.95, { cast: true })

  // ============================ PÓDIO — SUPERIOR ===========================
  // Faixa alta de betão aparente (y 4.5..8.4)
  plane(PODIUM.w, 3.9, 4, M.concreteWall, 0, 6.45, 3.21)
  // Ombreiras verticais (flutuação vertical) a cada 3.4 m — junta seca
  const grooveGeo = new THREE.BoxGeometry(0.055, 3.9, 0.03)
  for (const gx of [-13.6, -10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2, 13.6]) {
    box(0.055, 3.9, 0.03, M.shadowGap, gx, 6.45, 3.235, { cast: false })
  }
  // Janelas em vão no piso superior (esquadria + reveal + vidro)
  const upWinXs = [-15.24, -11.86, -8.47, -5.09, -1.7, 1.7, 5.09, 8.47, 11.86, 15.24]
  for (const wx of upWinXs) {
    plane(2.06, 2.06, 1, M.concreteDark, wx, 6.15, 3.215)   // reveal em sombra
    plane(1.78, 1.78, 1, M.darkMetal, wx, 6.15, 3.225)      // moldura
    plane(1.6, 1.6, 1, M.glass, wx, 6.15, 3.235)            // vidro
  }
  // Pilares de canto
  box(1.3, PODIUM.h, 0.26, M.concretePlain, -16.4, 4.2, 3.26)
  box(1.3, PODIUM.h, 0.26, M.concretePlain, 16.4, 4.2, 3.26)

  // ============================ PÓDIO — RÉS-DO-CHÃO ========================
  // Fiada de betão acima da montra (y 3.6..4.5)
  plane(PODIUM.w, 0.9, 4, M.concreteWall, 0, 4.05, 3.22)
  // Faixa de alumínio na base da fiada (transição montra→betão)
  box(PODIUM.w, 0.16, 0.05, M.aluminum, 0, 3.68, 3.235, { cast: false })
  // Blocos de betão nos cantos do piso de retalho
  plane(1.5, 3.6, 1.6, M.concreteWall, -16.25, 1.8, 3.21)
  plane(1.5, 3.6, 1.6, M.concreteWall, 16.25, 1.8, 3.21)
  // Pilares flanqueando a entrada (marcam o eixo)
  plane(1.05, 3.6, 1.2, M.concreteWall, -2.22, 1.8, 3.23)
  plane(1.05, 3.6, 1.2, M.concreteWall, 2.22, 1.8, 3.23)

  // Montra envidraçada (recuada 0.6 m — dá profundidade)
  const storefront = new THREE.Mesh(new THREE.PlaneGeometry(12.86, 3.5), M.glassStorefront)
  storefront.position.set(-9.23, 1.83, 2.6); B.add(storefront)
  const storefront2 = storefront.clone(); storefront2.position.set(9.23, 1.83, 2.6); B.add(storefront2)
  // Interior iluminado atrás da montra (tramos laterais; o eixo fica como entrada)
  const glow1 = new THREE.Mesh(new THREE.PlaneGeometry(12.86, 3.3), M.retailGlow)
  glow1.position.set(-9.23, 1.83, 2.02); B.add(glow1)
  const glow2 = glow1.clone(); glow2.position.set(9.23, 1.83, 2.02); B.add(glow2)
  // Montantes da montra (alumínio)
  const mullionGeo = new THREE.BoxGeometry(0.075, 3.5, 0.06)
  const mullions = new THREE.InstancedMesh(mullionGeo, M.aluminum, 14)
  let mi = 0
  for (const seg of [[-15.6, -2.75], [2.75, 15.6]]) {
    for (let x = seg[0] + 0.6; x < seg[1] - 0.2; x += 2.19) {
      dummy.position.set(x, 1.83, 2.63); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
      mullions.setMatrixAt(mi++, dummy.matrix)
    }
  }
  mullions.count = mi
  B.add(mullions)

  // ============================ ENTRADA (recedida) =========================
  // Pavimento interior contínuo com a plaza
  const lobbyFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.5), M.darkMetal)
  lobbyFloor.rotation.x = -Math.PI / 2; lobbyFloor.position.set(0, 0.175, 2.45); B.add(lobbyFloor)
  // Parede de fundo + fita de luz quente (interior iluminado)
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.6), M.concreteDark)
  backWall.position.set(0, 1.8, 1.78); B.add(backWall)
  const lightSlot = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.32), M.lobbyGlow)
  lightSlot.position.set(0, 2.42, 1.795); B.add(lightSlot)
  // Balcão de recepção (silhueta)
  box(2.3, 0.95, 0.62, M.darkMetal, 0, 0.65, 2.15)
  // Portas de vidro (folhas duplas)
  for (const dx of [-0.52, 0.52]) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.45), M.glassStorefront)
    leaf.position.set(dx, 1.42, 1.88); B.add(leaf)
    box(0.06, 2.45, 0.05, M.aluminum, dx - 0.49 * Math.sign(dx), 1.42, 1.885, { cast: false }) // ombreira lateral
  }
  box(2.2, 0.07, 0.06, M.aluminum, 0, 2.68, 1.885, { cast: false }) // verga
  // Reveses laterais do recesso
  plane(0.62, 3.6, 1, M.concreteDark, -2.71, 1.8, 2.9, Math.PI / 2)
  plane(0.62, 3.6, 1, M.concreteDark, 2.71, 1.8, 2.9, -Math.PI / 2)

  // Cobertura da entrada — lâmina fina + faixas + colunas
  box(7.4, 0.24, 2.1, M.darkMetal, 0, 3.12, 4.15)
  box(7.4, 0.06, 0.08, M.steel, 0, 2.99, 5.19, { cast: false })
  for (const cx of [-2.95, 2.95]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.88, 20), M.darkMetal)
    col.position.set(cx, 1.58, 4.95); col.castShadow = true; B.add(col)
  }
  // Letreiro NSAMBO na testa da cobertura
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 0.56), M.signMat)
  sign.position.set(0, 3.13, 5.215); B.add(sign)

  // Laje de remate do pódio + peitoril metálico
  box(34.9, 0.32, 12.9, M.concretePlain, 0, 8.56, -2.75)
  box(34.9, 0.07, 0.12, M.aluminum, 0, 8.73, 3.68, { cast: false })

  // ============================ TERRAÇO DO PÓDIO ===========================
  const terrace = new THREE.Mesh(uvScaledPlane(34.5, 12.5, 3), M.terracePaver)
  terrace.rotation.x = -Math.PI / 2; terrace.position.set(0, 8.735, -2.75); B.add(terrace)
  // Guarda-corpo de aço (posts + 2 travessas)
  const postGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.0, 10)
  const posts = new THREE.InstancedMesh(postGeo, M.steel, 25)
  for (let i = 0; i < 25; i++) {
    dummy.position.set(-17.25 + i * 1.4375, 9.23, 3.6); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
    posts.setMatrixAt(i, dummy.matrix)
  }
  posts.castShadow = true; B.add(posts)
  box(34.6, 0.055, 0.085, M.steel, 0, 9.75, 3.6, { cast: false })
  box(34.6, 0.035, 0.05, M.steel, 0, 9.3, 3.6, { cast: false })

  // ============================ TORRE ======================================
  const finXs = [-9.6, -7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2, 9.6]

  for (let i = 0; i < TOWER.floors; i++) {
    const y = TOWER.y0 + i * TOWER.floorH
    // Fiada de betão (spandrel) — face à prumo em z=0.47
    plane(TOWER.w, 1.3, 4, M.concreteWall, 0, y + 0.68, 0.47)
    // Vão envidraçado recuado
    plane(TOWER.w, 1.95, 1, M.glass, 0, y + 2.3, 0.40)
    // Junta de sombra (linha de laje)
    box(TOWER.w, 0.3, 0.045, M.shadowGap, 0, y + 3.45, 0.435, { cast: false })
  }
  // Fins verticais de betão (projeção 0.36 m) — dão ritmo e sombra própria
  for (const fx of finXs) {
    box(0.5, TOWER.h, 0.36, M.concretePlain, fx, TOWER.y0 + TOWER.h / 2, 0.58)
  }
  // Montantes verticais finos do envidraçado (1.1 m de cadência)
  const tmGeo = new THREE.BoxGeometry(0.055, 1.95, 0.035)
  const towerMullions = new THREE.InstancedMesh(tmGeo, M.aluminum, 11 * 19)
  let ti = 0
  for (let i = 0; i < TOWER.floors; i++) {
    const y = TOWER.y0 + i * TOWER.floorH + 2.3
    for (let x = -10.45; x <= 10.45; x += 1.16) {
      dummy.position.set(x, y, 0.415); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
      towerMullions.setMatrixAt(ti++, dummy.matrix)
    }
  }
  towerMullions.count = ti
  B.add(towerMullions)
  // Furos de tirante (tie holes) nas fiadas — 9 por piso
  const tieGeo = new THREE.CylinderGeometry(0.043, 0.043, 0.025, 16)
  const ties = new THREE.InstancedMesh(tieGeo, M.coreDark, 11 * 9)
  let tj = 0
  for (let i = 0; i < TOWER.floors; i++) {
    const y = TOWER.y0 + i * TOWER.floorH + 0.68
    for (const fx of finXs) {
      dummy.position.set(fx, y, 0.477); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.updateMatrix()
      ties.setMatrixAt(tj++, dummy.matrix)
    }
  }
  ties.count = tj
  B.add(ties)

  // -------- Fachadas laterais: betão com vãos ritmados --------
  for (const side of [1, -1]) {
    const xFace = side * (TOWER.w / 2 + 0.005)
    plane(TOWER.d, TOWER.h, 4, M.concreteWall, xFace, TOWER.y0 + TOWER.h / 2, TOWER.zC, side * Math.PI / 2)
    for (let i = 0; i < TOWER.floors; i++) {
      const y = TOWER.y0 + i * TOWER.floorH + 2.1
      for (const wz of [-2.4, -6.6]) {
        plane(2.0, 2.0, 1, M.concreteDark, xFace + side * 0.006, y, wz, side * Math.PI / 2)
        plane(1.72, 1.74, 1, M.darkMetal, xFace + side * 0.014, y, wz, side * Math.PI / 2)
        plane(1.5, 1.56, 1, M.glass, xFace + side * 0.022, y, wz, side * Math.PI / 2)
      }
    }
  }
  // -------- Tardoz: betão com 3 fendas verticais de serviço --------
  plane(TOWER.w, TOWER.h, 4, M.concreteWall, 0, TOWER.y0 + TOWER.h / 2, -10.105, Math.PI)
  for (const sx of [-6, 0, 6]) {
    plane(1.3, 35.5, 1, M.glass, sx, TOWER.y0 + 18.6, -10.115, Math.PI)
  }

  // ============================ COROAMENTO =================================
  box(22.8, 0.35, 11.3, M.concretePlain, 0, 48.175, TOWER.zC)
  // Peitoril de bordo
  box(22.8, 0.95, 0.24, M.concretePlain, 0, 48.825, 0.68)
  box(22.8, 0.95, 0.24, M.concretePlain, 0, 48.825, -10.38)
  box(0.24, 0.95, 11.3, M.concretePlain, -11.28, 48.825, TOWER.zC)
  box(0.24, 0.95, 11.3, M.concretePlain, 11.28, 48.825, TOWER.zC)
  for (const px of [0.68, -10.38]) box(22.84, 0.07, 0.3, M.aluminum, 0, 49.33, px, { cast: false })

  // Casa de máquinas (volume de serviço)
  box(6.2, 2.85, 4.3, M.concretePlain, -6, 49.775, -7.2)
  box(6.3, 0.16, 4.4, M.aluminum, -6, 51.28, -7.2, { cast: false })
  const mhDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.0), M.darkMetal)
  mhDoor.position.set(-6, 49.35, -5.045); B.add(mhDoor)
  for (let i = 0; i < 4; i++) box(1.5, 0.09, 0.05, M.darkMetal, -7.6, 50.4 + i * 0.2, -5.05, { cast: false })

  // Cisternas de água (2) sobre estruturas
  for (const tx of [4.9, 7.7]) {
    box(2.05, 0.5, 2.05, M.darkMetal, tx, 48.6, -7.0)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 1.78, 24), M.waterTank)
    tank.position.set(tx, 49.74, -7.0); tank.castShadow = true; B.add(tank)
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 16), M.darkMetal)
    lid.position.set(tx, 50.7, -7.0); B.add(lid)
  }
  // Antena + luz de balizamento
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.0, 10), M.darkMetal)
  antenna.position.set(9.0, 51.0, -9.3); antenna.castShadow = true; B.add(antenna)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), M.beacon)
  beacon.position.set(9.0, 53.55, -9.3); B.add(beacon)

  // ============================ BALIZADORES NO PASSEIO =====================
  const bollardGeo = new THREE.CylinderGeometry(0.095, 0.11, 0.78, 16)
  const bollards = new THREE.InstancedMesh(bollardGeo, M.darkMetal, 6)
  const stripeGeo = new THREE.CylinderGeometry(0.097, 0.097, 0.09, 16)
  const stripes = new THREE.InstancedMesh(stripeGeo, M.roadPaint, 6)
  const bx = [-9.5, -7, -4.5, 4.5, 7, 9.5]
  for (let i = 0; i < bx.length; i++) {
    dummy.position.set(bx[i], 0.16 + 0.39, 4.35); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
    bollards.setMatrixAt(i, dummy.matrix)
    dummy.position.set(bx[i], 0.16 + 0.62, 4.35); dummy.updateMatrix()
    stripes.setMatrixAt(i, dummy.matrix)
  }
  bollards.castShadow = true
  B.add(bollards); B.add(stripes)

  scene.add(B)
  return B
}
