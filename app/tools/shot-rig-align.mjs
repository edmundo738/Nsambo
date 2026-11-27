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
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
await page.goto('http://localhost:5173/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1800)
const tabs = await page.evaluate(() => [...document.querySelectorAll('#tabs button[data-tab]')].map(b => b.dataset.tab))
console.log('TABS:', JSON.stringify(tabs))
console.log('PREVIEW tab existe:', tabs.includes('tab-anim'))
console.log('2D existe:', await page.$('#tab-2d') !== null)
console.log('BTN ANIM:', await page.$('#btn-anim') !== null)
await page.screenshot({ path: '/tmp/na-3d.png' })
// clica ANIMAÇÃO
await page.click('#btn-anim')
await page.waitForTimeout(4000)
const info1 = await page.evaluate(() => document.getElementById('model-info')?.textContent)
const btnLabel = await page.evaluate(() => document.getElementById('btn-anim')?.textContent)
console.log('MODEL-INFO durante ANIMAÇÃO:', info1)
console.log('BTN durante:', btnLabel)
await page.screenshot({ path: '/tmp/na- anim.png'.replace(' ', '') })
// para a animação
await page.click('#btn-anim')
await page.waitForTimeout(800)
const info2 = await page.evaluate(() => document.getElementById('model-info')?.textContent)
const btnLabel2 = await page.evaluate(() => document.getElementById('btn-anim')?.textContent)
console.log('MODEL-INFO depois de parar:', info2)
console.log('BTN depois de parar:', btnLabel2)
await page.screenshot({ path: '/tmp/na-stopped.png' })
console.log('ERRORS:', errors.join('\n') || '(nenhum)')
await browser.close()
