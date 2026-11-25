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
  executablePath, args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const q = process.argv[3] ?? 'armanim=finger_gun_idle&armtime=1.0'
await page.goto(`http://localhost:5173/backrooms.html?autostart=1&seed=1337&armsonly=1&${q}`, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game?.modelsReady === true, { timeout: 60000 })
await page.waitForTimeout(600)
await page.screenshot({ path: process.argv[2] ?? '/tmp/qa-arms.jpg' })
console.log('saved', process.argv[2] ?? '/tmp/qa-arms.jpg')
await browser.close()
