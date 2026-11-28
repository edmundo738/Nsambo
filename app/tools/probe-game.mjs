// Smoke headless do jogo após a Fase 1 — sem erros de página; QA stalker ativo
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
const browser = await playwright.launch({
  executablePath, args: [...chromium.args, '--hide-scrollbars', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true,
})
const only = process.argv[2]
for (const [name, url] of [
  ['normal', 'http://localhost:5173/backrooms.html?seed=42'],
  ['stalkerhunt', 'http://localhost:5173/backrooms.html?seed=42&stalkerhunt'],
].filter(([n]) => !only || n === only)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(9000)   // deixa o jogo arrancar e a IA pensar
  const hud = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? '')
  console.log(`── ${name}: erros=${errors.length ? '' : 'nenhum'}`)
  for (const e of errors.slice(0, 5)) console.log('   ', e)
  await page.screenshot({ path: `/tmp/game-${name}.png` })
  await page.close()
}
await browser.close()
