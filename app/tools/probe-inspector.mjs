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
const url = process.argv[2] || 'http://localhost:5177/rig-align.html'
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2200)
// abre o details «Inspetor GLB» e clica «Inspecionar GLB»
await page.click('.box-collapse summary:has-text("Inspetor GLB")')
await page.waitForTimeout(200)
await page.click('#btn-inspect')
await page.waitForTimeout(2500)
const rep = await page.evaluate(() => document.getElementById('glb-report')?.innerText ?? '(vazio)')
console.log('=== GLB REPORT (primeiros 1500 chars) ===')
console.log(rep.slice(0, 1500))
// abre a vista de pesos
await page.selectOption('#weight-bone', '0')
await page.click('#btn-weights')
await page.waitForTimeout(600)
const legendHidden = await page.evaluate(() => document.getElementById('weight-legend')?.hidden)
console.log('legend visível após «Ver pesos»:', legendHidden === false)
// análise
const anal = await page.evaluate(() => document.getElementById('analysis-report')?.innerText ?? '(vazio)')
console.log('=== ANÁLISE (primeiros 900 chars) ===')
console.log(anal.slice(0, 900))
console.log('ERRORS:', errors.join('\n') || '(nenhum)')
await browser.close()
