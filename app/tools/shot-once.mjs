// shot único com query arbitrário: node tools/shot-once.mjs out.jpg "autostart=1&seed=1337&at=40.5,4.5&yaw=0&pitch=0.02"
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
const page = await browser.newPage({ viewport: { width: 1200, height: 750 } })
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
await page.goto(`http://localhost:5173/backrooms.html?${process.argv[3]}`, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: process.argv[2] })
console.log('saved', process.argv[2])
await browser.close()
