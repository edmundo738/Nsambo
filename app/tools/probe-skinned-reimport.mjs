import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const executablePath = await chromium.executablePath()
// garante que o GLB skinned existe (gera com o exportador real) e remove no fim — o jogo NÃO carrega este ficheiro
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { buildRigDataFromAnchors, normalizeWeights, modelBoxFromPositions } from '../src/backrooms/game/stalker-anchors.mjs'
import { buildSkinnedGLB } from '../src/rig-align/glb-export.js'
const SKINNED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'models', 'stalker.skinned.glb')
{
  const glb = readFileSync(join(ROOT_ASSETS(), 'models', 'stalker.glb'))
  const rigRaw = JSON.parse(readFileSync(join(ROOT_ASSETS(), 'models', 'stalker.rig.json'), 'utf8'))
  const anchors = JSON.parse(readFileSync(join(ROOT_ASSETS(), '..', 'rig-data', 'stalker.json'), 'utf8'))
  const clen = glb.readUInt32LE(12)
  const js = JSON.parse(glb.subarray(20, 20 + clen).toString('utf8'))
  const prim = js.meshes[0].primitives[0]
  const acc = js.accessors[prim.attributes.POSITION]
  const bv = js.bufferViews[acc.bufferView]
  let bOff = 20 + clen, bin = null
  while (bOff < glb.length) { const len = glb.readUInt32LE(bOff), t = glb.readUInt32LE(bOff + 4); if (t === 0x004e4942) bin = glb.subarray(bOff + 8, bOff + 8 + len); bOff += 8 + len }
  const pos = new Float32Array(acc.count * 3)
  const base = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  for (let v = 0; v < acc.count; v++) { const o = base + v * (bv.byteStride ?? 12); pos[v*3] = glb.readFloatLE(o); pos[v*3+1] = glb.readFloatLE(o+4); pos[v*3+2] = glb.readFloatLE(o+8) }
  const rigJson = normalizeWeights(rigRaw)
  const joints = buildRigDataFromAnchors(rigJson, anchors.points ?? anchors, modelBoxFromPositions(pos)).joints
  const { writeFileSync } = await import('node:fs')
  writeFileSync(SKINNED, buildSkinnedGLB({ glb, rigJson, joints }))
}
function ROOT_ASSETS() { return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets') }
process.on('exit', () => { try { rmSync(SKINNED) } catch {} })

const browser = await playwright.launch({
  executablePath, args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 640, height: 480 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
await page.goto('http://localhost:5177/skinned-reimport.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__REIMPORT_DONE__ === true, null, { timeout: 60000 })
const result = await page.evaluate(() => document.getElementById('out').textContent)
console.log(result)
console.log('ERRORS:', errors.join('\n') || '(nenhum)')
await browser.close()
