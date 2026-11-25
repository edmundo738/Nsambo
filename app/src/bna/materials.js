import * as THREE from 'three'

export const loadingManager = new THREE.LoadingManager()
const texLoader = new THREE.TextureLoader(loadingManager)

function loadMap(url, { srgb = false } = {}) {
  const t = texLoader.load(url)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}
const T = (p) => `/textures/${p}`

export function makeBnaMaterials(maxAniso = 8) {
  const salmon = loadMap(T('plaster-salmon.jpg'), { srgb: true })
  const salmonN = loadMap(T('plaster-salmon.normal.jpg'))
  const salmonR = loadMap(T('plaster-salmon.roughness.jpg'))
  const tiles = loadMap(T('roof-tiles.jpg'), { srgb: true })
  const tilesN = loadMap(T('roof-tiles.normal.jpg'))
  const tilesR = loadMap(T('roof-tiles.roughness.jpg'))
  const stone = loadMap(T('stone-white.jpg'), { srgb: true })
  const stoneN = loadMap(T('stone-white.normal.jpg'))
  const stoneR = loadMap(T('stone-white.roughness.jpg'))
  const copper = loadMap(T('dome-copper.jpg'), { srgb: true })
  const copperN = loadMap(T('dome-copper.normal.jpg'))
  const copperR = loadMap(T('dome-copper.roughness.jpg'))
  const granite = loadMap(T('plaza-granite.jpg'), { srgb: true })
  const graniteN = loadMap(T('plaza-granite.normal.jpg'))
  const graniteR = loadMap(T('plaza-granite.roughness.jpg'))
  const asphalt = loadMap(T('asphalt.jpg'), { srgb: true })
  const asphaltN = loadMap(T('asphalt.normal.jpg'))
  const asphaltR = loadMap(T('asphalt.roughness.jpg'))
  for (const t of [salmon, salmonN, salmonR, tiles, tilesN, tilesR, stone, stoneN, stoneR, copper, copperN, copperR, granite, graniteN, graniteR, asphalt, asphaltN, asphaltR]) {
    t.anisotropy = maxAniso
  }

  // Textura dedicada p/ paredes extrudidas (UVs em metros → 1 tile a cada N metros)
  const stoneExt = stone.clone(); stoneExt.repeat.set(1 / 2.6, 1 / 2.6)
  const stoneExtN = stoneN.clone(); stoneExtN.repeat.set(1 / 2.6, 1 / 2.6)
  const tilesExt = tiles.clone(); tilesExt.repeat.set(1 / 2.3, 1 / 2.3)
  const tilesExtN = tilesN.clone(); tilesExtN.repeat.set(1 / 2.3, 1 / 2.3)

  const M = {
    salmon: new THREE.MeshStandardMaterial({ map: salmon, normalMap: salmonN, roughnessMap: salmonR, roughness: 1.0, normalScale: new THREE.Vector2(0.65, 0.65) }),
    salmonFlat: new THREE.MeshStandardMaterial({ color: 0xc9917f, roughness: 0.85 }),       // superfícies planas pequenas
    salmonDark: new THREE.MeshStandardMaterial({ color: 0x8a6355, roughness: 0.9 }),        // interior da passagem
    stone: new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneN, roughnessMap: stoneR, roughness: 1.0, normalScale: new THREE.Vector2(0.5, 0.5) }),
    stoneFlat: new THREE.MeshStandardMaterial({ color: 0xe8e0cd, roughness: 0.6 }),
    stoneWallExt: new THREE.MeshStandardMaterial({ map: stoneExt, normalMap: stoneExtN, roughness: 0.72, normalScale: new THREE.Vector2(0.6, 0.6) }),
    roof: new THREE.MeshStandardMaterial({ map: tilesExt, normalMap: tilesExtN, roughness: 0.68, normalScale: new THREE.Vector2(1.15, 1.15) }),
    copper: new THREE.MeshStandardMaterial({ map: copper, normalMap: copperN, roughnessMap: copperR, roughness: 1.0, metalness: 0.62, envMapIntensity: 1.15, normalScale: new THREE.Vector2(0.7, 0.7) }),
    copperRib: new THREE.MeshStandardMaterial({ color: 0x6e3a22, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.2 }),
    granite: new THREE.MeshStandardMaterial({ map: granite, normalMap: graniteN, roughnessMap: graniteR, roughness: 1.0, normalScale: new THREE.Vector2(0.9, 0.9), color: 0xc2beb2 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphalt, normalMap: asphaltN, roughnessMap: asphaltR, roughness: 1.0 }),
    cornice: new THREE.MeshStandardMaterial({ color: 0xefe8d6, roughness: 0.55 }),
    trimDark: new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.72, metalness: 0.12 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x1d272c, roughness: 0.06, metalness: 0.5, envMapIntensity: 1.5 }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0x3a2c1a, emissive: 0xffc06a, emissiveIntensity: 1.35, roughness: 0.4 }),
    darkOpen: new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.95 }),
    vault: new THREE.MeshStandardMaterial({ color: 0xe7dcc4, roughness: 0.92, side: THREE.BackSide }),
    iron: new THREE.MeshStandardMaterial({ color: 0x191b1f, roughness: 0.48, metalness: 0.72 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x54401e, roughness: 0.32, metalness: 0.88 }),
    bronzeGlow: new THREE.MeshStandardMaterial({ color: 0x3a2c12, emissive: 0xffc978, emissiveIntensity: 0.0, roughness: 0.4, metalness: 0.6 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0x554433, emissive: 0xffd194, emissiveIntensity: 1.3, roughness: 0.6 }),
    coreDark: new THREE.MeshStandardMaterial({ color: 0x2c2724, roughness: 1.0 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x6e675c, roughness: 0.97 })
  }

  // Letreiro "BANCO NACIONAL DE ANGOLA" — placa de identificação (canvas, não textura de material)
  const c = document.createElement('canvas'); c.width = 2048; c.height = 128
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 2048, 128)
  ctx.font = '600 66px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  try { ctx.letterSpacing = '14px' } catch (_) {}
  ctx.fillStyle = '#4a3a1c'
  ctx.fillText('BANCO NACIONAL DE ANGOLA', 1024, 70)
  const signTex = new THREE.CanvasTexture(c)
  signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8
  M.signTex = signTex

  return M
}
