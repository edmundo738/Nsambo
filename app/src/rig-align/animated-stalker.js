// NSAMBO · rig-align — ANIMAÇÃO diretamente no modelo GLB
// Um ÚNICO esqueleto: o derivado SÓ das tuas âncoras (A…I2 + opcionais J, K, M).
// O construtor partilhado com os testes está em ../backrooms/game/stalker-anchors.mjs;
// nada do bind legado entra — só os pesos (w4/v4) do stalker.rig.json, que são
// índices vértice→junta (a ordem das 21 juntas é fixa).
import * as THREE from 'three'
import { loadGLB } from '../backrooms/engine/gltf.js'
import { StalkerRig } from '../backrooms/game/stalker-rig.mjs'
import { buildRigDataFromAnchors, modelBoxFromPositions } from '../backrooms/game/stalker-anchors.mjs'

const DEMO = { state: 'stalk', speed: 1.15, hunt01: 0.35, pounce01: 0, stagger01: 0, lookYaw: 0.18, lookPitch: 0.03 }

export async function createStalkerAnimator({ scene, getAnchors, onStats }) {
  const [glbData, rigData] = await Promise.all([
    loadGLB('/models/stalker.glb'),
    fetch('/models/stalker.rig.json', { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error('stalker.rig.json HTTP ' + r.status)
      return r.json()
    }),
  ])

  // bbox do GLB — mesma convenção do editor (anchorToModel)
  const restP = Float32Array.from(glbData.positions)
  const restN = Float32Array.from(glbData.normals)
  const restT = glbData.tangents ? Float32Array.from(glbData.tangents) : null
  const modelBox = modelBoxFromPositions(restP)
  const buildRigData = (P) => buildRigDataFromAnchors(rigData, P, modelBox)

  // malha dinâmica alimentada pelo skinning do rig
  const outP = new Float32Array(restP)
  const outN = new Float32Array(restN)
  const vcount = glbData.verts
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(outP, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('normal', new THREE.BufferAttribute(outN, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(glbData.uvs), 2))
  const idx = glbData.indices instanceof Uint32Array ? glbData.indices : new Uint32Array(glbData.indices)
  geometry.setIndex(new THREE.BufferAttribute(idx, 1))
  geometry.computeBoundingSphere()

  const texLoader = new THREE.TextureLoader()
  const loadTex = (url, srgb) => {
    const t = texLoader.load(url)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  const pbrMat = new THREE.MeshStandardMaterial({
    map: loadTex('/textures/stalker/skin.jpg', true),
    normalMap: loadTex('/textures/stalker/skin.normal.jpg', false),
    roughnessMap: loadTex('/textures/stalker/skin.roughness.jpg', false),
    aoMap: loadTex('/textures/stalker/skin.ao.jpg', false),
    emissiveMap: loadTex('/textures/stalker/stalker.emissive.jpg', true),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.85,
    roughness: 1.0,
    metalness: 0.04,
    normalScale: new THREE.Vector2(0.85, 0.85),
  })
  const mesh = new THREE.Mesh(geometry, pbrMat)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)

  let rig = null
  let animTime = 0, walkDist = 0
  const applyAnchors = () => {
    const P = getAnchors?.()
    if (!P) throw new Error('âncoras não disponíveis')
    rig = new StalkerRig(buildRigData(P))
    skinNow()
  }
  const skinNow = () => {
    rig.skin(restP, restN, restT, outP, outN, null)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.normal.needsUpdate = true
  }
  applyAnchors()   // arranca já com as âncoras atuais

  const update = (dt) => {
    animTime += dt
    walkDist += DEMO.speed * dt
    rig.update(dt, { dt, time: animTime, state: DEMO.state, speed: DEMO.speed, walkDist, hunt01: DEMO.hunt01, pounce01: DEMO.pounce01, stagger01: DEMO.stagger01, lookYaw: DEMO.lookYaw, lookPitch: DEMO.lookPitch })
    skinNow()
    if (onStats) {
      let max = 0, sum = 0, over = 0
      for (let v = 0; v < vcount; v++) {
        const dx = outP[v * 3] - restP[v * 3], dy = outP[v * 3 + 1] - restP[v * 3 + 1], dz = outP[v * 3 + 2] - restP[v * 3 + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > max) max = d
        sum += d
        if (d > 0.12) over++
      }
      onStats({ max: max * 100, mean: (sum / vcount) * 100, over })
    }
  }
  const reset = () => { animTime = 0; walkDist = 0; applyAnchors() }
  const dispose = () => {
    scene.remove(mesh)
    geometry.dispose()
    mesh.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])
      for (const m of mats) { for (const k of Object.keys(m)) { if (m[k]?.isTexture) m[k].dispose() } m.dispose() }
    })
  }
  mesh.visible = true
  return { mesh, update, applyAnchors, reset, dispose, vcount }
}
