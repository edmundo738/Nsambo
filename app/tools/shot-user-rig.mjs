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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('dialog', d => d.accept())
const errors = []
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
await page.goto('http://localhost:5173/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1800)
await page.click('#btn-load')          // carrega rig-data/stalker.json (o ficheiro do user)
await page.waitForTimeout(700)
console.log('F y (esperado 0.406):', await page.inputValue('#joint-list-3d .joint-row[data-id="F"] input[data-axis="y"]'))
await page.click('#btn-anim')
await page.waitForTimeout(4200)
console.log(await page.evaluate(() => document.getElementById('model-info')?.textContent))
await page.screenshot({ path: '/tmp/user-anim.png' })
await page.click('#btn-anim')
await page.waitForTimeout(600)
console.log('ERRORS:', errors.join('\n') || '(nenhum)')
await browser.close()
