// TASK 001 — capturas headless do Lobby 0 (chromium + swiftshader) para as rondas de avaliação
// Uso: node tools/task001/shots.mjs [--prefix=NAME] [--seed=1337] [--shot=ID]...
// As poses são fixas entre rondas (mesmas posições + mesma seed) para comparação objectiva.
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')

const OUT = new URL('../../../docs/screenshots/task001/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const SEED = opt('seed', '1337')
const PREFIX = opt('prefix', 'lobby0-before')

// poses fixas (mundo em metros; CELL=3, nível 26×26) — descobertas com ?topdown
// id, query extras, nota
const SHOTS = [
  ['01-spawn',      'autostart=1&noflash=1',                          'spawn — corredor à saída do menú'],
  ['02-topdown',    'autostart=1&topdown=1&noflash=1',                'vista de cima — estrutura completa'],
  // as restantes são escolhidas após inspecionar o topdown (see README)
]

const executablePath = await chromium.executablePath()
const browser = await playwright.launch({
  executablePath,
  args: [...chromium.args, '--hide-scrollbars'],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'),
    FONTCONFIG_PATH: join(tmpdir(), 'fonts'),
    HOME: tmpdir()
  },
  headless: true
})
// máquina de referência: 1366×768 @ 60 Hz (HP ProBook 450 G5) — NÃO alterar sem autorização
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

for (const [id, extra, note] of SHOTS) {
  const url = `${BASE}/backrooms.html?seed=${SEED}&${extra}`
  await page.goto(url, { waitUntil: 'load', timeout: 90000 })
  await page.waitForFunction(() => window.__READY === true, undefined, { timeout: 60000 })
  await page.waitForTimeout(900)
  const dataUrl = await page.evaluate(() => {
    // forçar um render sincrono ANTES de ler — o contexto não tem preserveDrawingBuffer
    const g = window.__game
    if (g && typeof g._render === 'function') g._render(performance.now() / 1000)
    const c = document.getElementById('gl')
    return c.toDataURL('image/jpeg', 0.92)
  })
  const file = `${OUT}${PREFIX}-${id}.jpg`
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('saved', file, '—', note)
}
await browser.close()
