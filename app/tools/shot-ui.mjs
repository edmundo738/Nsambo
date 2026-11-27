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
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
await page.goto('http://localhost:5177/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/ui-3d.png' })
// scroll até ao cimo da sidebar para ver Articulações
await page.evaluate(() => { document.querySelector('.side').scrollTop = 0 })
await page.waitForTimeout(200)
await page.screenshot({ path: '/tmp/ui-3d-top.png' })
await page.click('#tabs button[data-tab="tab-skeleton"]')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/ui-skeleton.png' })
await browser.close()
console.log('ok')
