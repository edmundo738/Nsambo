// NSAMBO ENGINE — meshmix.mjs — recomputação de normais/tangentes para malhas deformadas no CPU.
// Poses blendadas por vértice (arms / stalker) mudam a silhueta mas não as normais estáticas —
// iluminar geometria deformada com dados da pose original é um defeito (VM-006). Aqui recomputamos.
// Custo: acumulação por triângulo (poucos milhares) — trivial a 60 Hz.

// normais suavizadas por acumulação de área de face (sem costuras novas)
export function recomputeNormals(positions, indices, out) {
  const o = out ?? new Float32Array(positions.length)
  o.fill(0)
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2]
    const e1x = positions[b] - ax, e1y = positions[b + 1] - ay, e1z = positions[b + 2] - az
    const e2x = positions[c] - ax, e2y = positions[c + 1] - ay, e2z = positions[c + 2] - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    o[a] += nx; o[a + 1] += ny; o[a + 2] += nz
    o[b] += nx; o[b + 1] += ny; o[b + 2] += nz
    o[c] += nx; o[c + 1] += ny; o[c + 2] += nz
  }
  for (let v = 0; v < o.length; v += 3) {
    const x = o[v], y = o[v + 1], z = o[v + 2]
    const len = Math.hypot(x, y, z) || 1
    o[v] = x / len; o[v + 1] = y / len; o[v + 2] = z / len
  }
  return o
}

// tangentes por triângulo (Gram–Schmidt sobre o normal recomputado) + sinal do bitangente (w=±1)
export function recomputeTangents(positions, normals, uvs, indices, out) {
  const o = out ?? new Float32Array((positions.length / 3) * 4)
  const t1 = new Float32Array(positions.length)   // acumulador tangente
  const t2 = new Float32Array(positions.length)   // acumulador bitangente
  for (let f = 0; f < indices.length; f += 3) {
    const i0 = indices[f], i1 = indices[f + 1], i2 = indices[f + 2]
    const a = i0 * 3, b = i1 * 3, c = i2 * 3
    const u0 = i0 * 2, u1 = i1 * 2, u2 = i2 * 2
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2]
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2]
    const du1 = uvs[u1] - uvs[u0], dv1 = uvs[u1 + 1] - uvs[u0 + 1]
    const du2 = uvs[u2] - uvs[u0], dv2 = uvs[u2 + 1] - uvs[u0 + 1]
    const det = du1 * dv2 - du2 * dv1
    const r = Math.abs(det) < 1e-8 ? 0 : 1 / det
    const sx = (e1x * dv2 - e2x * dv1) * r, sy = (e1y * dv2 - e2y * dv1) * r, sz = (e1z * dv2 - e2z * dv1) * r
    const bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r
    for (const v of [a, b, c]) {
      t1[v] += sx; t1[v + 1] += sy; t1[v + 2] += sz
      t2[v] += bx; t2[v + 1] += by; t2[v + 2] += bz
    }
  }
  for (let v = 0; v < positions.length; v += 3) {
    const nx = normals[v], ny = normals[v + 1], nz = normals[v + 2]
    const rx = t1[v], ry = t1[v + 1], rz = t1[v + 2]
    const d = nx * rx + ny * ry + nz * rz
    let tx = rx - nx * d, ty = ry - ny * d, tz = rz - nz * d   // Gram–Schmidt
    const len = Math.hypot(tx, ty, tz)
    if (len < 1e-6) { tx = 1; ty = 0; tz = 0 } else { tx /= len; ty /= len; tz /= len }
    // sinal: n × t aponta com ou contra o bitangente acumulado?
    const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx
    const dw = cx * t2[v] + cy * t2[v + 1] + cz * t2[v + 2]
    const o4 = (v / 3) * 4
    o[o4] = tx; o[o4 + 1] = ty; o[o4 + 2] = tz; o[o4 + 3] = dw < 0 ? -1 : 1
  }
  return o
}
