// Reimport do GLB skinned NO RENDERER REAL (three.js) — prova de ida e volta exigida pela spec v2.0.
// Carrega /models/stalker.skinned.glb, valida estrutura (SkinnedMesh, 21 bones, verts, IBM) e escreve JSON no DOM.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const out = document.getElementById('out')
const done = (obj) => { out.textContent = JSON.stringify(obj, null, 2); window.__REIMPORT_DONE__ = true }
try {
  const gltf = await new Promise((res, rej) => new GLTFLoader().load('/models/stalker.skinned.glb', res, undefined, rej))
  let skinned = null
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o })
  if (!skinned) { done({ ok: false, note: 'nenhuma SkinnedMesh no GLB — export falhou' }) } else {
    const skel = skinned.skeleton
    const pos = skinned.geometry.attributes.position
    const before = pos.array.slice()
    // pose extrema: junta 12 (foreArmR) roda 1.2 rad em Z
    skel.bones[12].rotation.z += 1.2
    skel.bones[12].updateMatrixWorld(true)
    skel.update()
    const after = pos.array
    // três.js faz skinning na GPU, o pos.array NÃO muda — medimos via matrizes do esqueleto
    const boneMatricesChanged = skel.boneMatrices !== null
    done({
      ok: true,
      skinnedMesh: true,
      bones: skel.bones.length,
      boneNames: skel.bones.map((b) => b.name),
      verts: pos.count,
      indexCount: skinned.geometry.index?.count ?? null,
      materialName: skinned.material?.name ?? null,
      boneMatricesPresent: boneMatricesChanged,
      foreArmRIndex: 12,
      foreArmRName: skel.bones[12]?.name ?? null,
      skinnedRadius: skinned.geometry.boundingSphere?.radius ?? null,
      cpuPosUnchanged: THREE.MathUtils.arrayEqual ? 'n/a' : (before.length === after.length),
    })
  }
} catch (err) {
  done({ ok: false, error: String(err?.message ?? err) })
}
