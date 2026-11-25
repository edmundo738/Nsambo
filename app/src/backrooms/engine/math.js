// NSAMBO ENGINE — math.js — vetores/matrizes mínimas (column-major, estilo gl-matrix)
export const vec3 = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  from: (v) => [v[0], v[1], v[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
}

export const mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m },
  multiply(out, a, b) { // out = a * b
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
    return out
  },
  perspective(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2)
    const nf = 1 / (near - far)
    const m = new Float32Array(16)
    m[0] = f / aspect; m[5] = f
    m[10] = (far + near) * nf; m[11] = -1
    m[14] = 2 * far * near * nf
    return m
  },
  lookAt(eye, target, up = [0, 1, 0]) {
    const z = vec3.normalize(vec3.sub(eye, target))
    const x = vec3.normalize(vec3.cross(up, z))
    const y = vec3.cross(z, x)
    const m = new Float32Array(16)
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0]
    m[4] = x[1]; m[5] = y[1]; m[6] = z[1]
    m[8] = x[2]; m[9] = y[2]; m[10] = z[2]
    m[12] = -vec3.dot(x, eye); m[13] = -vec3.dot(y, eye); m[14] = -vec3.dot(z, eye); m[15] = 1
    return m
  },
  invert(m) { // inversa geral 4x4 (gl-matrix)
    const inv = new Float32Array(16)
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
    if (!det) return null
    det = 1.0 / det
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det
    inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det
    inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det
    inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det
    inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det
    inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det
    inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det
    inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det
    inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det
    inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det
    inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det
    inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det
    inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det
    inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det
    inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det
    inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det
    return inv
  },
  normalFromMat4(m) { // mat3 transposta da inversa (parte superior) — os modelos são rígidos
    const inv = mat4.invert(m)
    if (!inv) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    // mat3 transposta de inv (col-major 3x3)
    return new Float32Array([inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]])
  },
}
