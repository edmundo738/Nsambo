import * as THREE from 'three'

// Escala UV de um PlaneGeometry para a textura repetir a cada `tile` metros.
export function uvScaledPlane(w, h, tile) {
  const geo = new THREE.PlaneGeometry(w, h)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile)
  return geo
}
