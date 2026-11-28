// Pré-visualização headless da pilha AA — screenshots em três ângulos
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
const page = await browser.newPage({ viewport: { width: 620, height: 460 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
for (const angle of ['hero', 'lay', 'float']) {
  await page.goto('http://localhost:5173/battery-preview.html?angle=' + angle, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => window.__batteryReady === true || window.__batteryError, { timeout: 15000 })
  const err = await page.evaluate(() => window.__batteryError ?? null)
  if (err) errors.push('GLB load: ' + err)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `/tmp/battery-${angle}.png` })
  console.log('shot', angle)
}
console.log('erros:', errors.length ? errors : 'nenhum')
await browser.close()
