import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'

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
