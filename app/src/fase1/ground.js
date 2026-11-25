import * as THREE from 'three'
import { uvScaledPlane } from './materials.js'

// ---------------------------------------------------------------------------
// Terreno — gramática de zonas (R1–R5 do PLANO-AMBIENTE.md)
//   faixa de rodagem: asfalto | passeio/plaza: pavers | fronteira: bordo
//   lote por pavimentar: terra batida | edifício assenta na plaza, nunca na via
// ---------------------------------------------------------------------------

export function buildGround(scene, M) {
  const g = new THREE.Group()
  g.name = 'ground'
  const add = (mesh) => { mesh.receiveShadow = true; g.add(mesh); return mesh }

  // Lote / terreno base (terra batida)
  const dirt = new THREE.Mesh(uvScaledPlane(150, 100, 8), M.dirtMat)
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, 0, -8)
  add(dirt)

  // Faixa de rodagem — asfalto (R1)
  const road = new THREE.Mesh(uvScaledPlane(120, 7.6, 5), M.asphaltMat)
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 12.8)
  add(road)

  // Linha central descontínua (pintura sobre asfalto)
  const dashGeo = new THREE.BoxGeometry(2.6, 0.02, 0.14)
  const dashes = new THREE.InstancedMesh(dashGeo, M.roadPaint, 20)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 20; i++) {
    dummy.position.set(-57 + i * 6, 0.032, 12.8)
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
    dashes.setMatrixAt(i, dummy.matrix)
  }
  dashes.receiveShadow = true
  g.add(dashes)

  // Bordo / guia de betão — fronteira vertical asfalto↔passeio (R2)
  const curb = new THREE.Mesh(new THREE.BoxGeometry(120, 0.2, 0.26), M.curbMat)
  curb.position.set(0, 0.1, 9.0)
  curb.castShadow = true; curb.receiveShadow = true
  g.add(curb)

  // Passeio + plaza de entrada (mesma zona pedestre) — pavers (R1)
  const sidewalkBase = new THREE.Mesh(new THREE.BoxGeometry(120, 0.16, 5.8), M.concreteDark)
  sidewalkBase.position.set(0, 0.08, 6.1)
  sidewalkBase.receiveShadow = true
  g.add(sidewalkBase)
  const sidewalkTop = new THREE.Mesh(uvScaledPlane(120, 5.8, 3), M.paverMat)
  sidewalkTop.rotation.x = -Math.PI / 2; sidewalkTop.position.set(0, 0.163, 6.1)
  sidewalkTop.receiveShadow = true
  g.add(sidewalkTop)

  // Soleira sob o pódio (edifício assenta no passeio/plaza — R3)
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 1.2), M.curbMat)
  threshold.position.set(0, 0.19, 3.75); threshold.receiveShadow = true
  g.add(threshold)

  // Guarda-corpos baixos a delimitar a plaza (estacionamento futuro) — ritmo com o bordo
  // (apenas o tramo junto ao edifício; a rua fica à Fase 2)

  scene.add(g)
  return g
}
