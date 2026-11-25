import * as THREE from 'three'
import { uvScaledPlane } from '../shared/uv.js'

// ===========================================================================
// BANCO NACIONAL DE ANGOLA — reconstrução arquitetónica (estudo Fase BNA)
// Referências: docs/referencias-bna/*.jpg (fotos, aerial, maqueta, banda desenhada)
// Unidades: metros. Fachada principal voltada a +z (Av. 4 de Fevereiro).
//   Arcada: 0 .. 5.6 · Friso: 5.6 .. 6.8 · Coroa arcada: 6.8 .. 7.35
//   Piso nobre 1: 7.35 .. 11.9 · Cordão: 11.9 .. 12.25 · Piso 2: 12.25 .. 15.35
//   Cornija: 15.35 .. 15.95 · Balaustrada ática: 15.95 .. 16.75 · Telhado: 16.3 .. 20.6
//   Rotunda: 0 .. 19.3 · Cúpula: 19.75 .. 26.35 · Lanterna: 26.85 .. 32.3 · Espiga: .. 34.4
// ===========================================================================

const ARCH = { count: 31, spacing: 3.75, springY: 4.3, radius: 1.075 }
const HALF = 61.5            // meia-largura da fachada
const ROT_R = 9.5            // raio da rotunda
const ROT_ZC = -9.5          // centro z da rotunda (face frontal em z = 0)
const WING = { x0: 9.5, x1: 61.5 }
const PAV = { x0: 17.6, x1: 34.4, proj: 1.15 }   // pavilhão de ordem gigante

// PRNG determinístico (janelas acesas à noite estáveis entre sessões)
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }

export function buildBNA(scene, M) {
  const B = new THREE.Group()
  B.name = 'bna'
  const dummy = new THREE.Object3D()
  const solid = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; B.add(mesh); return mesh }
  const plane = (w, h, tile, mat, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(uvScaledPlane(w, h, tile), mat)
    m.position.set(x, y, z); m.rotation.y = rotY; m.receiveShadow = true; B.add(m); return m
  }
  const box = (w, h, d, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; B.add(m); return m
  }

  const litWindowGlass = []   // guardados para o modo noturno
  const allWindowGlass = []

  // =====================================================================
  // 1) SÍTIO — plaza de granito, bordo, via, skyline
  // =====================================================================
  const plaza = new THREE.Mesh(uvScaledPlane(320, 46, 4), M.granite)
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0, 11.5); plaza.receiveShadow = true; B.add(plaza)
  const lot = new THREE.Mesh(uvScaledPlane(320, 80, 8), M.dirt)
  lot.rotation.x = -Math.PI / 2; lot.position.set(0, -0.02, -38); lot.receiveShadow = true; B.add(lot)
  const road = new THREE.Mesh(uvScaledPlane(320, 8, 5), M.asphalt)
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, 33.5); road.receiveShadow = true; B.add(road)
  const curb = box(320, 0.19, 0.26, M.cornice, 0, 0.095, 29.4, false)
  const dashGeo = new THREE.BoxGeometry(2.6, 0.02, 0.14)
  const dashes = new THREE.InstancedMesh(dashGeo, M.stoneFlat, 28)
  for (let i = 0; i < 28; i++) { dummy.position.set(-82 + i * 6.1, 0.045, 33.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); dashes.setMatrixAt(i, dummy.matrix) }
  B.add(dashes)
  // Skyline silhueta (Baixa de Luanda) — caixas escuras na neblina
  const skylineMat = new THREE.MeshStandardMaterial({ color: 0x333e4b, roughness: 1 })
  const skyline = [
    [-95, 28, -150, 15], [-66, 21, -165, 13], [-42, 34, -138, 17], [-14, 23, -160, 14],
    [18, 31, -146, 16], [46, 19, -162, 12], [70, 26, -136, 14], [98, 17, -152, 11]
  ]
  for (const [x, h, z, w] of skyline) box(w, h, w, skylineMat, x, h / 2, z, false)

  // =====================================================================
  // 2) NÚCLEOS OCULTOS — blocos dos corpos laterais (acima da arcada)
  // =====================================================================
  for (const s of [1, -1]) {
    const w = WING.x1 - WING.x0
    const cx = s * (WING.x0 + w / 2)
    box(w, 8.95, 16.05, M.coreDark, cx, 11.82, -7.97)   // y 7.35 .. 16.3
    box(0.8, 7.35, 16.05, M.stoneWallExt, s * 61.9, 3.675, -7.97)  // remate inferior (pedra)
    box(0.8, 8.95, 16.05, M.salmonFlat, s * 61.9, 11.825, -7.97)   // remate superior (reboco)
  }
  // Rotunda (acima da arcada)
  const drumCore = new THREE.Mesh(new THREE.CylinderGeometry(ROT_R - 0.1, ROT_R - 0.1, 11.95, 40), M.coreDark)
  drumCore.position.set(0, 13.375, ROT_ZC); drumCore.castShadow = true; B.add(drumCore)

  // =====================================================================
  // 3) ARCADA — parede ecrã extrudida com 31 arcos (o elemento-assinatura)
  // =====================================================================
  const arcadeShape = new THREE.Shape()
  arcadeShape.moveTo(-HALF, 0); arcadeShape.lineTo(HALF, 0)
  arcadeShape.lineTo(HALF, 5.6); arcadeShape.lineTo(-HALF, 5.6); arcadeShape.closePath()
  for (let i = -ARCH.count / 2 + 1; i <= ARCH.count / 2; i++) {
    const cx = i * ARCH.spacing
    if (Math.abs(cx) > HALF - 1.4) continue
    const hole = new THREE.Path()
    hole.moveTo(cx - ARCH.radius, 0.02)
    hole.lineTo(cx - ARCH.radius, ARCH.springY)
    hole.absarc(cx, ARCH.springY, ARCH.radius, Math.PI, 0, true)
    hole.lineTo(cx + ARCH.radius, 0.02)
    hole.closePath()
    arcadeShape.holes.push(hole)
  }
  const arcadeGeo = new THREE.ExtrudeGeometry(arcadeShape, { depth: 0.7, bevelEnabled: false, curveSegments: 20 })
  const arcade = new THREE.Mesh(arcadeGeo, M.stoneWallExt)
  arcade.position.z = -0.7; arcade.castShadow = true; arcade.receiveShadow = true; B.add(arcade)

  // =====================================================================
  // 4) CORREDOR (ambulacro) — pavimento, parede interior, abóbada, lanternas
  // =====================================================================
  const corrFloor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 3.9), M.darkOpen)
  corrFloor.rotation.x = -Math.PI / 2; corrFloor.position.set(0, 0.02, -1.95); corrFloor.receiveShadow = true; B.add(corrFloor)
  plane(HALF * 2, 5.6, 4, M.salmonDark, 0, 2.8, -3.92)                 // parede interior
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, HALF * 2 - 1.6, 24, 1, true, 0, Math.PI), M.vault)
  vault.rotation.z = Math.PI / 2; vault.position.set(0, 4.35, -1.95); B.add(vault)
  // Portas escuras na parede interior a cada 4 vãos
  const doorGeo = new THREE.PlaneGeometry(1.7, 3.5)
  for (let i = -7; i <= 7; i += 2) {
    const d = new THREE.Mesh(doorGeo, M.darkOpen); d.position.set(i * ARCH.spacing * 2, 1.75, -3.9); B.add(d)
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.8), M.stoneFlat); frame.position.set(i * ARCH.spacing * 2, 1.9, -3.915); B.add(frame); frame.position.z = -3.905
    frame.renderOrder = -1
  }
  // Lanternas suspensas (hexágono) — 3 partes instanciadas
  const lampXs = []
  for (let x = -HALF + ARCH.spacing / 2; x < HALF; x += ARCH.spacing) lampXs.push(x)
  const rodGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6)
  const rods = new THREE.InstancedMesh(rodGeo, M.iron, lampXs.length)
  const bodyPts = []
  for (const [r, y] of [[0.05, 0], [0.24, 0.06], [0.30, 0.22], [0.22, 0.42], [0.10, 0.5], [0.0, 0.52]]) bodyPts.push(new THREE.Vector2(r, y))
  const bodyGeo = new THREE.LatheGeometry(bodyPts, 6)
  const bodies = new THREE.InstancedMesh(bodyGeo, M.lampGlow, lampXs.length)
  const capGeo = new THREE.ConeGeometry(0.16, 0.2, 6)
  const caps = new THREE.InstancedMesh(capGeo, M.iron, lampXs.length)
  lampXs.forEach((x, i) => {
    dummy.position.set(x, 5.0, -1.95); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); rods.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, 4.18, -1.95); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, 4.78, -1.95); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix)
  })
  B.add(rods, bodies, caps)

  // =====================================================================
  // 5) FRISO + CORNIJA DA ARCADA + LETREIRO
  // =====================================================================
  box(HALF * 2 + 0.6, 1.38, 0.14, M.cornice, 0, 6.19, 0.03)                 // friso
  box(HALF * 2 + 0.8, 0.55, 0.46, M.cornice, 0, 7.03, 0.17)                 // cornija arcada
  const signMat = new THREE.MeshStandardMaterial({ map: M.signTex, transparent: true, emissive: 0xffc978, emissiveMap: M.signTex, emissiveIntensity: 0.12, roughness: 0.55 })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 1.1), signMat)
  sign.position.set(0, 6.17, 0.115); B.add(sign)
  M._signMat = signMat

  // =====================================================================
  // 6) PÓDIO / PISO NOBRE 1 + PISO 2 — paredes e cordão
  // =====================================================================
  for (const s of [1, -1]) {
    plane(WING.x1 - WING.x0, 8.95, 4, M.salmon, s * 35.5, 11.82, 0.055, 0)
    plane(15.9, 16.3, 4, M.salmon, s * 62.32, 8.15, -7.97, s === 1 ? Math.PI / 2 : -Math.PI / 2)   // remates extremos
  }
  // Reentrâncias de transição rotunda↔corpos laterais (juntas de sombra deliberadas)
  for (const s of [1, -1]) {
    plane(16.1, 8.95, 4, M.salmon, s * 9.47, 11.825, -8.1, s === 1 ? -Math.PI / 2 : Math.PI / 2)
    box(0.55, 8.95, 0.38, M.cornice, s * 9.5, 11.825, 0.0)
  }

  // Soffit circular sob a rotunda (não se vê o interior do tambor por baixo)
  const soffit = new THREE.Mesh(new THREE.CircleGeometry(9.46, 40), M.salmonDark)
  soffit.rotation.x = Math.PI / 2; soffit.position.set(0, 7.33, ROT_ZC); B.add(soffit)

  plane(HALF * 2, 16.3, 4, M.salmon, 0, 8.15, -16.03, Math.PI)              // tardoz
  // Cordão entre pisos
  box(HALF * 2 + 0.4, 0.34, 0.3, M.cornice, 0, 12.07, 0.12)

  // =====================================================================
  // 7) JANELAS — construtor com orlas, vergas e frontões alternados
  // =====================================================================
  function pedimentTriangle(w, h, depth, mat) {
    const sh = new THREE.Shape()
    sh.moveTo(-w / 2, 0); sh.lineTo(0, h); sh.lineTo(w / 2, 0); sh.closePath()
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false })
  }
  function pedimentSegment(w, h, depth, mat) {
    const sh = new THREE.Shape()
    sh.moveTo(-w / 2, 0)
    sh.quadraticCurveTo(0, h * 1.9, w / 2, 0)
    sh.lineTo(w / 2, -h * 0.36)
    sh.quadraticCurveTo(0, h * 1.12, -w / 2, -h * 0.36)
    sh.closePath()
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 16 })
  }
  const winGlassMat = () => {
    const idx = allWindowGlass.length
    const m = M.glassDark.clone()
    allWindowGlass.push(m)
    return m
  }
  function makeWindow({ w, h, pediment = 'none', arch = false }) {
    const g = new THREE.Group()
    const surround = new THREE.Mesh(new THREE.BoxGeometry(w + 0.66, h + 0.52, 0.16), M.cornice)
    surround.position.set(0, 0, 0.08); g.add(surround)
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), M.trimDark)
    inner.position.set(0, 0, 0.163); g.add(inner)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - 0.14), M.glassDark.clone())
    glass.position.set(0, 0, 0.175); glass.userData.dayMat = glass.material
    g.add(glass)
    allWindowGlass.push(glass)
    // Montantes e travessas (caixilharia de 6–9 panos)
    const barMat = M.cornice
    const bv = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.1, 0.03), barMat)
    bv.position.set(0, 0, 0.19); g.add(bv)
    const bh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.06, 0.03), barMat)
    bh.position.set(0, 0.18 * h, 0.19); g.add(bh)
    // Peitoril + avental
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.86, 0.15, 0.24), M.cornice)
    sill.position.set(0, -h / 2 - 0.33, 0.1); g.add(sill)
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.42, 0.1), M.cornice)
    apron.position.set(0, -h / 2 - 0.62, 0.05); g.add(apron)
    // Verga / frontão
    if (pediment === 'triangle') {
      const p = new THREE.Mesh(pedimentTriangle(w + 1.0, 0.66, 0.24), M.cornice)
      p.position.set(0, h / 2 + 0.26, 0.02); g.add(p)
      const tym = new THREE.Mesh(pedimentTriangle(w + 0.42, 0.44, 0.05), M.salmonFlat)
      tym.position.set(0, h / 2 + 0.30, 0.26); g.add(tym)
    } else if (pediment === 'segment') {
      const p = new THREE.Mesh(pedimentSegment(w + 1.0, 0.5, 0.24), M.cornice)
      p.position.set(0, h / 2 + 0.26, 0.02); g.add(p)
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.18, 0.2), M.cornice)
      cap.position.set(0, h / 2 + 0.35, 0.09); g.add(cap)
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    return g
  }
  function placeWindow(x, y, z, opts, rotY = 0, parent = B) {
    const w = makeWindow(opts)
    w.position.set(x, y, z); w.rotation.y = rotY; parent.add(w)
    return w
  }

  // Janelas dos corpos laterais — cadência 3.5 m, frontões alternados
  const baysA = [11.9, 15.4]                         // entre rotunda e pavilhão
  const baysB = [18.9, 26.0, 33.1].map(v => v)       // pavilhão (ordem gigante)
  const baysC = [37.4, 40.9, 44.4, 47.9, 51.4, 54.9, 58.4]  // pavilhão → extremo
  let pedIdx = 0
  for (const s of [1, -1]) {
    for (const b of [...baysA, ...baysC]) {
      const ped1 = pedIdx++ % 2 === 0 ? 'triangle' : 'segment'
      placeWindow(s * b, 9.95, 0.06, { w: 1.65, h: 2.95, pediment: ped1 })
      placeWindow(s * b, 13.75, 0.06, { w: 1.65, h: 2.25, pediment: 'none' })
    }
    // Pavilhão: 3 vãos mais altos, sempre frontão triangular nobre
    for (const b of baysB) {
      placeWindow(s * b, 9.95, PAV.proj + 0.06, { w: 1.8, h: 3.15, pediment: 'triangle' })
      placeWindow(s * b, 13.75, PAV.proj + 0.06, { w: 1.8, h: 2.35, pediment: 'none' })
    }
  }

  // =====================================================================
  // 8) PAVILHÕES DE ORDEM GIGANTE — blocos projectados, pilastras, frontão
  // =====================================================================
  for (const s of [1, -1]) {
    const cx = s * (PAV.x0 + PAV.x1) / 2         // 26.0
    box(PAV.x1 - PAV.x0, 8.95, PAV.proj, M.salmonFlat, cx, 11.82, PAV.proj / 2 + 0.02)
    // 4 pilastras gigantes coríntias
    for (const px of [PAV.x0 + 0.75, 23.55, 26.0, 28.45, PAV.x1 - 0.75].slice(0, 5)) {
      box(0.78, 8.0, 0.26, M.cornice, s * px, 11.35, PAV.proj + 0.1)
      box(1.02, 0.3, 0.34, M.cornice, s * px, 15.0, PAV.proj + 0.12)   // capitel
    }
    // Frontão triangular
    const ped = new THREE.Mesh(pedimentTriangle(PAV.x1 - PAV.x0 + 0.6, 2.05, 1.05), M.cornice)
    ped.position.set(cx, 15.35, PAV.proj / 2 - 0.45); ped.castShadow = true; B.add(ped)
    const tym = new THREE.Mesh(pedimentTriangle(PAV.x1 - PAV.x0 - 1.3, 1.45, 0.06), M.salmonFlat)
    tym.position.set(cx, 15.5, PAV.proj + 0.12); B.add(tym)
  }

  // =====================================================================
  // 9) PILASTRAS DOS CORPOS — com capitéis nos dois cordões
  // =====================================================================
  const pilasterGeo = new THREE.BoxGeometry(0.52, 8.0, 0.14)
  const capGeoP = new THREE.BoxGeometry(0.72, 0.2, 0.2)
  const pilasterXs = [11.9, 15.4, 18.3, 23.6, 28.4, 33.7, 37.4, 40.9, 44.4, 47.9, 51.4, 54.9, 58.4]
  const pilCount = pilasterXs.length * 2
  const pilasters = new THREE.InstancedMesh(pilasterGeo, M.cornice, pilCount)
  const pcapitals = new THREE.InstancedMesh(capGeoP, M.cornice, pilCount * 2)
  let pi = 0, ci = 0
  for (const s of [1, -1]) {
    for (const b of pilasterXs) {
      dummy.position.set(s * b + 1.75 * s, 11.35, 0.09); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
      pilasters.setMatrixAt(pi++, dummy.matrix)
      dummy.position.set(s * b + 1.75 * s, 15.28, 0.11); dummy.updateMatrix(); pcapitals.setMatrixAt(ci++, dummy.matrix)
      dummy.position.set(s * b + 1.75 * s, 12.28, 0.11); dummy.updateMatrix(); pcapitals.setMatrixAt(ci++, dummy.matrix)
    }
  }
  pilasters.count = pi; pcapitals.count = ci
  pilasters.castShadow = true
  B.add(pilasters, pcapitals)

  // =====================================================================
  // 10) CORNIJA PRINCIPAL + DENTÍCULOS
  // =====================================================================
  box(HALF * 2 + 0.9, 0.58, 0.55, M.cornice, 0, 15.62, 0.24)
  const dentilGeo = new THREE.BoxGeometry(0.17, 0.14, 0.16)
  const nDentils = Math.floor((HALF * 2) / 0.34)
  const dentils = new THREE.InstancedMesh(dentilGeo, M.cornice, nDentils)
  for (let i = 0; i < nDentils; i++) {
    dummy.position.set(-HALF + 0.18 + i * 0.34, 15.28, 0.34); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
    dentils.setMatrixAt(i, dummy.matrix)
  }
  B.add(dentils)

  // =====================================================================
  // 11) BALAUSTRADA ÁTICA — bilros instanciados ao longo da fachada
  // =====================================================================
  const balPts = []
  for (const [r, y] of [[0.085, 0], [0.115, 0.03], [0.065, 0.08], [0.05, 0.18], [0.088, 0.34], [0.105, 0.46], [0.07, 0.55], [0.10, 0.6], [0.10, 0.66], [0.0, 0.66]]) balPts.push(new THREE.Vector2(r, y))
  const balGeo = new THREE.LatheGeometry(balPts, 10)
  const balSpacing = 0.55
  const balXs = []
  for (let x = -HALF + 0.4; x <= HALF - 0.4; x += balSpacing) balXs.push(x)
  const balusters = new THREE.InstancedMesh(balGeo, M.cornice, balXs.length)
  balXs.forEach((x, i) => { dummy.position.set(x, 15.95, 0.16); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); balusters.setMatrixAt(i, dummy.matrix) })
  balusters.castShadow = true
  B.add(balusters)
  box(HALF * 2 + 0.5, 0.13, 0.2, M.cornice, 0, 16.68, 0.16)
  box(HALF * 2 + 0.5, 0.09, 0.18, M.cornice, 0, 15.99, 0.16)

  // Pináculos/urnas sobre pedestais
  const urnPts = []
  for (const [r, y] of [[0.02, 0], [0.3, 0.05], [0.16, 0.18], [0.14, 0.3], [0.34, 0.55], [0.42, 0.85], [0.28, 1.1], [0.12, 1.15], [0.16, 1.28], [0.0, 1.3]]) urnPts.push(new THREE.Vector2(r, y))
  const urnGeo = new THREE.LatheGeometry(urnPts, 12)
  const urnXs = [-61, -50.5, -40, -34.7, -17.6, 17.6, 34.7, 40, 50.5, 61]
  const urns = new THREE.InstancedMesh(urnGeo, M.cornice, urnXs.length)
  const pedXs = []
  urnXs.forEach((x, i) => {
    dummy.position.set(x, 16.78, 0.16); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); urns.setMatrixAt(i, dummy.matrix)
  })
  B.add(urns)
  for (const x of urnXs) box(0.62, 0.55, 0.5, M.cornice, x, 16.62, 0.16)

  // =====================================================================
  // 12) SACADA CENTRAL — lâmina + balaustrada (sobre o letreiro)
  // =====================================================================
  box(26.5, 0.24, 1.35, M.cornice, 0, 7.5, 0.65)
  const balcXs = []
  for (let x = -12.7; x <= 12.7; x += 0.52) balcXs.push(x)
  const balcBalusters = new THREE.InstancedMesh(balGeo, M.cornice, balcXs.length)
  balcXs.forEach((x, i) => { dummy.position.set(x, 7.62, 1.27); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); balcBalusters.setMatrixAt(i, dummy.matrix) })
  B.add(balcBalusters)
  box(26.5, 0.11, 0.16, M.cornice, 0, 8.34, 1.27)

  // =====================================================================
  // 13) ROTUNDA — tambor, ordem gigante, janelas em arco, coroamento
  // =====================================================================
  const drumMat = M.salmon.clone(); drumMat.side = THREE.DoubleSide
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(ROT_R, ROT_R, 11.95, 48, 1, true), drumMat)
  drum.position.set(0, 13.375, ROT_ZC)
  drum.castShadow = true; drum.receiveShadow = true; B.add(drum)
  // Pilastras do tambor
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const px = Math.sin(a) * (ROT_R + 0.09), pz = ROT_ZC + Math.cos(a) * (ROT_R + 0.09)
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 11.5, 0.2), M.cornice)
    pil.position.set(px, 13.3, pz); pil.rotation.y = a; pil.castShadow = true; B.add(pil)
  }
  // Janelas em arco, 2 níveis, voltadas para a frente
  function arcWindow(levelY, hgt, w) {
    for (const deg of [-52, -26, 0, 26, 52]) {
      const a = THREE.MathUtils.degToRad(deg)
      const r = ROT_R + 0.06
      const g = new THREE.Group()
      const surround = new THREE.Mesh(new THREE.BoxGeometry(w + 0.66, hgt + 0.5, 0.18), M.cornice)
      surround.position.set(0, 0, 0.09); g.add(surround)
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, hgt - 0.1), M.glassDark.clone())
      glass.position.set(0, 0, 0.19); glass.userData.dayMat = glass.material
      g.add(glass)
      allWindowGlass.push(glass)
      // Verga em arco (mouldura curvilínea)
      const arc = new THREE.Mesh(pedimentSegment(w + 0.72, 0.42, 0.2), M.cornice)
      arc.position.set(0, hgt / 2 + 0.2, 0.05); g.add(arc)
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.14, 0.22), M.cornice)
      sill.position.set(0, -hgt / 2 - 0.3, 0.1); g.add(sill)
      g.position.set(Math.sin(a) * r, levelY, ROT_ZC + Math.cos(a) * r)
      g.rotation.y = a
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      B.add(g)
    }
  }
  arcWindow(9.95, 3.1, 1.55)
  arcWindow(13.75, 2.15, 1.45)
  // Coroamento do tambor
  const drumCornice = new THREE.Mesh(new THREE.CylinderGeometry(ROT_R + 0.5, ROT_R + 0.5, 0.5, 48), M.cornice)
  drumCornice.position.set(0, 19.55, ROT_ZC); drumCornice.castShadow = true; B.add(drumCornice)
  const drumBalcony = new THREE.Mesh(new THREE.CylinderGeometry(ROT_R + 0.28, ROT_R + 0.28, 0.14, 48), M.cornice)
  drumBalcony.position.set(0, 19.9, ROT_ZC); B.add(drumBalcony)
  // Balaustrada circular de coroamento do tambor
  const ringCount = 30
  const ringBalusters = new THREE.InstancedMesh(balGeo, M.cornice, ringCount)
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2
    dummy.position.set(Math.sin(a) * (ROT_R + 0.24), 20.0, ROT_ZC + Math.cos(a) * (ROT_R + 0.24))
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); ringBalusters.setMatrixAt(i, dummy.matrix)
  }
  B.add(ringBalusters)

  // =====================================================================
  // 14) CÚPULA — perfil em lathe + 16 nervuras
  // =====================================================================
  const domeProfile = []
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const y = 6.6 * t
    const r = Math.max(8.55 * Math.cos(Math.pow(t, 0.8) * Math.PI / 2), 0.03)
    domeProfile.push(new THREE.Vector2(r, y))
  }
  const dome = new THREE.Mesh(new THREE.LatheGeometry(domeProfile, 56), M.copper)
  dome.position.set(0, 19.98, ROT_ZC); dome.castShadow = true; dome.receiveShadow = true; B.add(dome)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    const pts = []
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const y = 6.6 * t
      const r = Math.max(8.55 * Math.cos(Math.pow(t, 0.8) * Math.PI / 2), 0.03) + 0.07
      pts.push(new THREE.Vector3(Math.sin(a) * r, 19.98 + y, ROT_ZC + Math.cos(a) * r))
    }
    const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.15, 8), M.copperRib)
    rib.castShadow = true; B.add(rib)
  }

  // =====================================================================
  // 15) LANTERNA — base, tambor com 8 aberturas, mini-cúpula, espiga
  // =====================================================================
  const lantBase = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 3.15, 0.6, 24), M.cornice)
  lantBase.position.set(0, 26.75, ROT_ZC); B.add(lantBase)
  const lantMat = M.salmonFlat.clone(); lantMat.side = THREE.DoubleSide
  const lant = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 2.6, 24, 1, true), lantMat)
  lant.position.set(0, 28.3, ROT_ZC); lant.castShadow = true; B.add(lant)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const px = Math.sin(a) * 2.32, pz = ROT_ZC + Math.cos(a) * 2.32
    const op = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), M.darkOpen)
    op.position.set(px, 28.25, pz); op.rotation.y = a; B.add(op)
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 8), M.cornice)
    col.position.set(Math.sin(a + Math.PI / 8) * 2.32, 28.3, ROT_ZC + Math.cos(a + Math.PI / 8) * 2.32); B.add(col)
  }
  const lantCornice = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.62, 0.32, 24), M.cornice)
  lantCornice.position.set(0, 29.75, ROT_ZC); B.add(lantCornice)
  const lantDomeProfile = []
  for (let t = 0; t <= 1.0001; t += 0.08) {
    const y = 1.9 * t
    const r = Math.max(2.45 * Math.cos(Math.pow(t, 0.85) * Math.PI / 2), 0.03)
    lantDomeProfile.push(new THREE.Vector2(r, y))
  }
  const lantDome = new THREE.Mesh(new THREE.LatheGeometry(lantDomeProfile, 24), M.copper)
  lantDome.position.set(0, 29.9, ROT_ZC); lantDome.castShadow = true; B.add(lantDome)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), M.cornice)
  ball.position.set(0, 32.1, ROT_ZC); B.add(ball)
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.35, 8), M.iron)
  spike.position.set(0, 33.0, ROT_ZC); B.add(spike)
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.06), M.cornice)
  crossV.position.set(0, 34.0, ROT_ZC); B.add(crossV)
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.06), M.cornice)
  crossH.position.set(0, 34.15, ROT_ZC); B.add(crossH)

  // =====================================================================
  // 16) TELHADOS DE 4 ÁGUAS (hipped) — geometria à medida com UVs de cale
  // =====================================================================
  function hippedRoof(len, dep, rise) {
    const hx = len / 2, hz = dep / 2, ridge = len / 2 - dep / 2
    const v = [
      [-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], [-hx, 0, -hz],   // beira (0-3)
      [-ridge, rise, 0], [ridge, rise, 0]                        // cumeeira (4-5)
    ]
    const faces = [
      [0, 1, 5, 4],   // frente
      [2, 3, 4, 5],   // trás
      [3, 0, 4],      // esquerda
      [1, 2, 5]       // direita
    ]
    const pos = [], uv = []
    const quad = (a, b, c, d) => {
      for (const [i, j, k] of [[a, b, c], [a, c, d]]) {
        const p = v[i], q = v[j], r = v[k]
        pos.push(...p, ...q, ...r)
        uv.push(p[0] / 2.3 + 8, (p[2] + p[1] * 0.8) / 2.3 + 8, q[0] / 2.3 + 8, (q[2] + q[1] * 0.8) / 2.3 + 8, r[0] / 2.3 + 8, (r[2] + r[1] * 0.8) / 2.3 + 8)
      }
    }
    const tri = (a, b, c) => {
      const p = v[a], q = v[b], r = v[c]
      pos.push(...p, ...q, ...r)
      uv.push(p[0] / 2.3 + 8, (p[2] + p[1] * 0.8) / 2.3 + 8, q[0] / 2.3 + 8, (q[2] + q[1] * 0.8) / 2.3 + 8, r[0] / 2.3 + 8, (r[2] + r[1] * 0.8) / 2.3 + 8)
    }
    quad(...faces[0]); quad(...faces[1]); tri(...faces[2]); tri(...faces[3])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    return geo
  }
  const roofLen = WING.x1 - WING.x0 + 2.2, roofDep = 17.2, roofRise = 4.35
  const roofGeo = hippedRoof(roofLen, roofDep, roofRise)
  for (const s of [1, -1]) {
    const roof = new THREE.Mesh(roofGeo, M.roof)
    roof.position.set(s * 35.5, 16.3, -8.1)
    roof.castShadow = true; roof.receiveShadow = true; B.add(roof)
  }

  // =====================================================================
  // 17) Conjunto de Windows para o modo noturno
  // =====================================================================
  const rng = lcg(20261124)
  allWindowGlass.forEach((glass, i) => { if (rng() < 0.3) litWindowGlass.push(glass) })
  B.userData.litWindows = litWindowGlass
  B.userData.nightRig = null   // preenchido pelo main.js

  scene.add(B)
  return B
}
