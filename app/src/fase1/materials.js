import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Pipeline PBR — albedos GERADOS por IA (nunca pintados por código).
// Normal + roughness são DERIVADOS matematicamente do albedo em tools/derive_maps.py.
// ---------------------------------------------------------------------------

export const loadingManager = new THREE.LoadingManager()

const texLoader = new THREE.TextureLoader(loadingManager)

function loadMap(url, { srgb = false, repeat = [1, 1] } = {}) {
  const t = texLoader.load(url)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.repeat.set(repeat[0], repeat[1])
  return t
}

// uvScaledPlane movido para ../shared/uv.js (partilhado BNA/Fase 1)
import { uvScaledPlane } from '../shared/uv.js'
export { uvScaledPlane }

export function makeMaterials(maxAniso = 8) {
  const T = (p) => `/textures/${p}`

  const concrete = loadMap(T('concrete-wall.jpg'), { srgb: true })
  const concreteN = loadMap(T('concrete-wall.normal.jpg'))
  const concreteR = loadMap(T('concrete-wall.roughness.jpg'))
  const asphalt = loadMap(T('asphalt.jpg'), { srgb: true })
  const asphaltN = loadMap(T('asphalt.normal.jpg'))
  const asphaltR = loadMap(T('asphalt.roughness.jpg'))
  const pavers = loadMap(T('sidewalk-pavers.jpg'), { srgb: true })
  const paversN = loadMap(T('sidewalk-pavers.normal.jpg'))
  const paversR = loadMap(T('sidewalk-pavers.roughness.jpg'))

  for (const t of [concrete, concreteN, concreteR, asphalt, asphaltN, asphaltR, pavers, paversN, paversR]) {
    t.anisotropy = maxAniso
  }

  const concreteWall = new THREE.MeshStandardMaterial({
    map: concrete, normalMap: concreteN, roughnessMap: concreteR,
    roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(0.9, 0.9), color: 0xdcd8ce
  })
  const concretePlain = new THREE.MeshStandardMaterial({ color: 0xa8a499, roughness: 0.82, metalness: 0.0 })
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 0.85 })
  const coreDark = new THREE.MeshStandardMaterial({ color: 0x35322e, roughness: 1.0 })

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphalt, normalMap: asphaltN, roughnessMap: asphaltR,
    roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(0.7, 0.7)
  })
  const paverMat = new THREE.MeshStandardMaterial({
    map: pavers, normalMap: paversN, roughnessMap: paversR,
    roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(1.2, 1.2)
  })
  const terracePaver = paverMat.clone()
  paverMat.color = new THREE.Color(0xcac5b8)          // pavers menos estourados
  terracePaver.color = new THREE.Color(0xcac5b8)   // mesmo material, UV escalado por geometria

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xa29b8e, roughness: 0.55 })
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x7a7264, roughness: 0.97 })

  // Vidro reflectivo escuro (fachada) — reflexos físicos via envMap PMREM
  const glass = new THREE.MeshStandardMaterial({
    color: 0x27333b, roughness: 0.045, metalness: 0.6, envMapIntensity: 3.0
  })
  // Vidro de retalho/loja — transparente, revela o interior aquecido
  const glassStorefront = new THREE.MeshPhysicalMaterial({
    color: 0x9fb6bd, roughness: 0.04, metalness: 0.0,
    transparent: true, opacity: 0.32, envMapIntensity: 1.5,
    clearcoat: 0.6, clearcoatRoughness: 0.1
  })
  const shadowGap = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.6, metalness: 0.2 })

  const aluminum = new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.38, metalness: 0.85 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.58, metalness: 0.35 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x777d84, roughness: 0.28, metalness: 0.95 })
  const roadPaint = new THREE.MeshStandardMaterial({ color: 0xd9d9d2, roughness: 0.6 })

  const waterTank = new THREE.MeshStandardMaterial({ color: 0x35423a, roughness: 0.55, metalness: 0.05 })
  // Interior de retalho iluminado (visto através da montra)
  const retailGlow = new THREE.MeshStandardMaterial({
    color: 0x2a2015, emissive: 0xffc182, emissiveIntensity: 1.05, roughness: 0.9
  })
  const lobbyGlow = new THREE.MeshStandardMaterial({
    color: 0x3a2f1d, emissive: 0xffdca4, emissiveIntensity: 1.5, roughness: 0.9
  })
  const beacon = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2.2 })

  // Letreiro NSAMBO — gerado em canvas apenas para a placa (não é textura de material)
  const signCanvas = document.createElement('canvas')
  signCanvas.width = 1024; signCanvas.height = 128
  const ctx = signCanvas.getContext('2d')
  ctx.fillStyle = '#16181b'; ctx.fillRect(0, 0, 1024, 128)
  ctx.font = '700 72px Arial, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  try { ctx.letterSpacing = '26px' } catch (_) { /* canvas antigo */ }
  ctx.fillStyle = '#ffd9a0'
  ctx.fillText('NSAMBO', 512, 68)
  const signTex = new THREE.CanvasTexture(signCanvas)
  signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex, emissive: 0xffc87a, emissiveMap: signTex, emissiveIntensity: 0.9, roughness: 0.5
  })

  return {
    concreteWall, concretePlain, concreteDark, coreDark,
    asphaltMat, paverMat, terracePaver, curbMat, dirtMat,
    glass, glassStorefront, shadowGap,
    aluminum, darkMetal, steel, roadPaint,
    waterTank, lobbyGlow, beacon, signMat, retailGlow
  }
}
