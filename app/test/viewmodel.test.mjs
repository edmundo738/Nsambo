// Testes do viewmodel — falham no código antigo (lanterna para trás, cotos dos braços no frame)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { armsLocal, flashLocal, transformDir, VM, FLASH_TIP } from '../src/backrooms/game/viewmodel.js'
import { toggleFlashlight, lightIsOn } from '../src/backrooms/game/flashlight.js'

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }

test('lanterna: a lente (+X do GLB) aponta para a frente (−Z), nunca para a câmara', () => {
  const d = norm(transformDir(flashLocal(), [1, 0, 0]))
  assert.ok(d[2] < -0.95, `lente deveria apontar −Z, obtido ${d.map((x) => x.toFixed(2))}`)
  assert.ok(Math.abs(d[0]) < 0.2)
})

test('lanterna: bateria 0 não acende com F e a luz não fica ligada', () => {
  assert.equal(lightIsOn(true, 0), false)
  assert.deepEqual(toggleFlashlight(false, 0), { on: false, denied: true })
  assert.deepEqual(toggleFlashlight(false, 0.5), { on: true, denied: false })
  assert.deepEqual(toggleFlashlight(true, 0.5), { on: false, denied: false })
})

// carrega o GLB em node (shim de fetch só para o teste)
async function bakeArms(anim) {
  globalThis.fetch = async (u) => { const b = fs.readFileSync(u); return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }
  const { loadGLB } = await import('../src/backrooms/engine/gltf.js')
  return loadGLB(new URL('../../assets/models/arms_rig.glb', import.meta.url).pathname, { anim, animTime: 1.0 })
}
function openBoundaryVerts(m) {
  const P = m.positions, I = m.indices, W = new Int32Array(m.verts), wk = new Map()
  for (let v = 0; v < m.verts; v++) { const k = [0, 1, 2].map((i) => Math.round(P[v * 3 + i] * 1e4)).join(','); if (!wk.has(k)) wk.set(k, wk.size); W[v] = wk.get(k) }
  const ec = new Map(), key = (a, b) => { a = W[a]; b = W[b]; return a < b ? a * 1e5 + b : b * 1e5 + a }
  for (let i = 0; i < I.length; i += 3) for (const [x, y] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) ec.set(key(x, y), (ec.get(key(x, y)) || 0) + 1)
  const open = new Set(); for (const [k, c] of ec) if (c === 1) { open.add(Math.floor(k / 1e5)); open.add(k % 1e5) }
  return [...Array(m.verts).keys()].filter((v) => open.has(W[v]))
}

for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
  test(`braços @${aspect.toFixed(2)}: bordas abertas (cotos) nunca visíveis; mãos visíveis nos lados certos`, async () => {
    const m = await bakeArms('knife_idle')
    const f = 1 / Math.tan((VM.fovDeg * Math.PI) / 360)
    const bnd = new Set(openBoundaryVerts(m))
    for (const reach of [0, 1]) {
      const M = armsLocal(reach)
      let left = 0, right = 0
      for (let v = 0; v < m.verts; v++) {
        const [x, y, z] = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]]
        const vx = M[0] * x + M[4] * y + M[8] * z + M[12], vy = M[1] * x + M[5] * y + M[9] * z + M[13], vz = M[2] * x + M[6] * y + M[10] * z + M[14]
        const inFront = vz < -VM.near
        const visible = inFront && Math.abs((vy * f) / -vz) <= 1 && Math.abs((vx * f) / aspect / -vz) <= 1
        if (bnd.has(v)) assert.ok(!visible, `vértice de borda aberta visível (reach=${reach}) em v=${v}`)
        if (visible && vx < -0.1) left++
        if (visible && vx > 0.1) right++
      }
      assert.ok(left > 40 && right > 40, `mãos devem aparecer à esquerda (${left}) e à direita (${right})`)
    }
  })
}
