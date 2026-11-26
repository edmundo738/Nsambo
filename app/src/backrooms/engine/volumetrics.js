// Geometria volumétrica falsa: dois "cartões" em cruz alinhados ao eixo do cone
// (mesma técnica de light-shafts de jogos clássicos). Vistos de fora ou de dentro
// do feixe funcionam, ao contrário de um cone de superfície (tangente a partir do
// ápice → some completamente). Sem disco de base, sem arestas duras.

// fita unitária: ápice (0,0,0) → base (z=1) com meia-largura = z (mesmo perfil do cone)
export function buildShaft() {
  const a = 0.02              // meia-largura no ápice (evita triângulo degenerado)
  const positions = new Float32Array([
    // fita A — plano XZ (horizontal, normal +Y)
    -a, 0, 0,   a, 0, 0,   -1, 0, 1,   1, 0, 1,
    // fita B — plano YZ (vertical, normal +X)
    0, -a, 0,   0, a, 0,   0, -1, 1,   0, 1, 1,
  ])
  const normals = new Float32Array([
    0, 1, 0,    0, 1, 0,    0, 1, 0,    0, 1, 0,
    1, 0, 0,    1, 0, 0,    1, 0, 0,    1, 0, 0,
  ])
  const indices = new Uint16Array([
    0, 2, 3, 0, 3, 1,        // fita A
    4, 6, 7, 4, 7, 5,        // fita B
  ])
  return { positions, normals, indices }
}

// caixa toroidal de poeira: sementes aleatórias + ruído por grão
export function buildDust(count = 150, box = [6.5, 2.4, 6.5], seed = 1337) {
  let s = seed >>> 0
  const rnd = () => {                     // xorshift32
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  const aSeed = new Float32Array(count * 3)
  const aRnd = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    aSeed[i * 3 + 0] = (rnd() * 2 - 1) * box[0]
    aSeed[i * 3 + 1] = (rnd() * 2 - 1) * box[1]
    aSeed[i * 3 + 2] = (rnd() * 2 - 1) * box[2]
    aRnd[i * 2 + 0] = rnd()
    aRnd[i * 2 + 1] = rnd()
  }
  return { aSeed, aRnd }
}

// matriz de modelo: alinha +Z → dir, escala (radius, radius, length), translação em apex
// (column-major, pronto para uniformMatrix4fv)
export function coneModel(apex, dir, radius, length) {
  const d = norm3(dir)
  // base ortonormal com z = d
  const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]
  const x = norm3(cross(up, d))
  const y = cross(d, x)                   // unitário (d e x unitários e perpendiculares)
  return new Float32Array([
    x[0] * radius, x[1] * radius, x[2] * radius, 0,
    y[0] * radius, y[1] * radius, y[2] * radius, 0,
    d[0] * length, d[1] * length, d[2] * length, 0,
    apex[0],       apex[1],       apex[2],       1,
  ])
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
