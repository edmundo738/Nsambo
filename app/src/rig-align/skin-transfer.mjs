// NSAMBO · rig-align — Auto-paint por distância inversa (RASCUNHO, não produção)
// Para cada vértice calcula as k juntas mais próximas (espaço do modelo) e pondera 1/d².
// É um PONTO DE PARTIDA — o motor de skinning da spec exige pintura manual + normalização
// sparsity-preserving para aprovação Nível 1. Útil para bootstrapar esqueletos novos (v2/humanos expandidos).
// NÃO usar para aprovar deformação; serve para o round-trip export→reimport ter dados válidos.

// restP: Float32Array xyz · joints: [{pos:[x,y,z]}] (mesma moldura) → { w4, v4 } em base64 (bytes 0..255, soma exata 255)
export function autoSkinWeights(restP, joints, { k = 4, eps = 2e-3 } = {}) {
  const vcount = restP.length / 3
  const nj = joints.length
  if (nj === 0) throw new Error('esqueleto sem juntas')
  const wIdx = new Uint8Array(vcount * 4), wVal = new Uint8Array(vcount * 4)
  const kk = Math.min(k, nj)
  // distâncias + k menores sem ordenar tudo: k pequeno, ordem parcial é barata
  for (let v = 0; v < vcount; v++) {
    const x = restP[v * 3], y = restP[v * 3 + 1], z = restP[v * 3 + 2]
    const bestD = new Float64Array(kk).fill(Infinity), bestJ = new Int32Array(kk).fill(-1)
    for (let j = 0; j < nj; j++) {
      const dx = joints[j].pos[0] - x, dy = joints[j].pos[1] - y, dz = joints[j].pos[2] - z
      const d = dx * dx + dy * dy + dz * dz
      // manter os k menores
      let mk = 0
      for (let m = 1; m < kk; m++) if (bestD[m] > bestD[mk]) mk = m
      if (d < bestD[mk]) { bestD[mk] = d; bestJ[mk] = j }
    }
    // pesos 1/(d²+ε)
    const w = new Float64Array(kk)
    let sum = 0
    for (let m = 0; m < kk; m++) { w[m] = 1 / (bestD[m] + eps); sum += w[m] }
    for (let m = 0; m < kk; m++) w[m] /= sum
    // quantizar 0..255 com soma exata 255 (maior resto)
    const raw = Array.from(w, x => x * 255)   // Array.from — NÃO Float64Array.map (coage arrays→Number)
    const base = raw.map(x => Math.floor(x))
    let acc = base.reduce((a, b) => a + b, 0)
    const rem = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0])
    for (let i = 0; i < 255 - acc; i++) base[rem[i][1]]++
    for (let m = 0; m < 4; m++) {
      const o = v * 4 + m
      wIdx[o] = m < kk ? bestJ[m] : 0
      wVal[o] = m < kk ? base[m] : 0
    }
  }
  const enc = (u8) => (typeof btoa === 'function'
    ? btoa(String.fromCharCode(...u8))
    : Buffer.from(u8).toString('base64'))
  return { vcount, w4: enc(wIdx), v4: enc(wVal), format: 'b64-split-idx-w8', version: 1, autoSkin: true }
}
