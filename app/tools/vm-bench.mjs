// Banco de testes do viewmodel — congela os braços num estado para inspeção visual.
// Uso: node tools/vm-bench.mjs <idle|walk|run> <out.jpg> [vmphase] [W H]
//   node tools/vm-bench.mjs walk /tmp/vm-walk.jpg 0.25
//   node tools/vm-bench.mjs run  /tmp/vm-run.jpg  0.75 1440 810
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const [state = 'idle', out = '/tmp/vm.jpg', vmphase = '0', W = '1280', H = '720'] = process.argv.slice(2)
const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(), args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.error('[console:error]', m.text()) })
const HASKEY = process.env.HASKEY ? '&haskey=1' : ''
const q = `autostart=1&seed=1337&vma=${state}${state === 'idle' ? '' : `&vmphase=${vmphase}`}${HASKEY}`
await page.goto(`http://localhost:5175/backrooms.html?${q}`, { waitUntil: 'load', timeout: 90000 })
await page.waitForFunction(() => window.__game?.frameCount > 10, { timeout: 90000 })
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const g = window.__game
  return { state: g._loco?.state, phase: g._loco?.phase?.toFixed(2), amp: g._loco?.amp?.toFixed(4), modelsReady: g.modelsReady }
})
console.log('vm:', JSON.stringify(info))
await page.screenshot({ path: out, type: 'jpeg', quality: 92 })
await browser.close()
