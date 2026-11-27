import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { buildRigDataFromAnchors, normalizeWeights, modelBoxFromPositions } from './src/backrooms/game/stalker-anchors.mjs'
import { buildSkinnedGLB } from './src/rig-align/glb-export.js'

const here = dirname(fileURLToPath(import.meta.url))

// Ferramenta dev rig-align — grava os JSON de articulações direto no workspace (../rig-data/)
function rigAlignSave() {
  const dir = resolve(here, '..', 'rig-data')
  const safe = (n) => String(n || 'rig').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) || 'rig'
  const readBody = (req) => new Promise((res, rej) => {
    let b = ''
    req.on('data', (c) => { b += c; if (b.length > 4e6) req.destroy() })
    req.on('end', () => res(b))
    req.on('error', rej)
  })
  return {
    name: 'rig-align-save',
    configureServer(server) {
      // Preview do Arena abre na raiz (/) — dev-only: vai direito ao editor de articulações.
      // O BNA continua acessível em /index.html e o jogo em /backrooms.html.
      server.middlewares.use('/', (req, res, next) => {
        const path = (req.url ?? '').split('?')[0].replace(/^\//, '') // connect monta em '/': '/' fica '' e '/?x' fica '?x' à entrada
        if (req.method === 'GET' && path === '') {
          res.statusCode = 302
          res.setHeader('location', '/rig-align.html')
          res.end()
          return
        }
        next()
      })
      server.middlewares.use('/__rig/export', async (req, res) => {
        // exporta o GLB skinned a partir das âncoras correntes do editor (dev-only)
        try {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('{"ok":false}'); return }
          const { points, normalize = true, demoAnim = false } = JSON.parse(await readBody(req))
          const glbPath = resolve(here, '..', 'assets', 'models', 'stalker.glb')
          const rigRaw = JSON.parse(readFileSync(resolve(here, '..', 'assets', 'models', 'stalker.rig.json'), 'utf8'))
          const glb = readFileSync(glbPath)
          const rigJson = normalize ? normalizeWeights(rigRaw) : rigRaw
          const clen = glb.readUInt32LE(12)
          const srcJson = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
          const prim = srcJson.meshes[0].primitives[0]
          const acc = srcJson.accessors[prim.attributes.POSITION]
          const bv = srcJson.bufferViews[acc.bufferView]
          let bOff = 20 + clen, bin = null
          while (bOff < glb.length) { const len = glb.readUInt32LE(bOff), t = glb.readUInt32LE(bOff + 4); if (t === 0x004e4942) bin = glb.subarray(bOff + 8, bOff + 8 + len); bOff += 8 + len }
          const restP = new Float32Array(acc.count * 3)
          const base = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
          for (let v = 0; v < acc.count; v++) { const o = base + v * (bv.byteStride ?? 12); restP[v*3] = glb.readFloatLE(o); restP[v*3+1] = glb.readFloatLE(o+4); restP[v*3+2] = glb.readFloatLE(o+8) }
          const joints = buildRigDataFromAnchors(rigJson, points, modelBoxFromPositions(restP)).joints
          const bytes = buildSkinnedGLB({ glb, rigJson, joints, demoAnim })
          res.setHeader('content-type', 'model/gltf-binary')
          res.setHeader('content-disposition', 'attachment; filename="stalker.skinned.glb"')
          res.end(Buffer.from(bytes))
        } catch (err) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
        }
      })
      server.middlewares.use('/__rig/save', async (req, res) => {
        res.setHeader('content-type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"ok":false,"error":"POST only"}'); return }
        try {
          const { filename, data } = JSON.parse(await readBody(req))
          if (!data || typeof data !== 'object') throw new Error('data em falta')
          mkdirSync(dir, { recursive: true })
          const path = resolve(dir, safe(filename).replace(/\.json$/i, '') + '.json')
          writeFileSync(path, JSON.stringify(data, null, 2))
          res.end(JSON.stringify({ ok: true, path: `rig-data/${path.split('/').pop()}` }))
        } catch (err) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
        }
      })
      server.middlewares.use('/__rig/load', (req, res) => {
        res.setHeader('content-type', 'application/json')
        const name = String(new URL(req.url, 'http://rig.local').searchParams.get('name') ?? '')
          .replace(/[^a-z0-9_.-]/gi, '_').replace(/\.json$/i, '').slice(0, 80) || 'stalker'
        try {
          res.end(readFileSync(resolve(dir, name + '.json'), 'utf8'))
        } catch {
          res.statusCode = 404
          res.end('{"ok":false,"error":"ficheiro não encontrado"}')
        }
      })
      server.middlewares.use('/__rig/list', (req, res) => {
        res.setHeader('content-type', 'application/json')
        try {
          mkdirSync(dir, { recursive: true })
          res.end(JSON.stringify({ ok: true, files: readdirSync(dir).filter(f => f.endsWith('.json')) }))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
        }
      })
    }
  }
}

export default defineConfig({
  publicDir: '../assets',          // assets/textures/*.jpg servidos em /textures/...
  plugins: [rigAlignSave()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,            // preview do Arena (host *.e2b.app)
    fs: { allow: ['..'] }
  }
})
