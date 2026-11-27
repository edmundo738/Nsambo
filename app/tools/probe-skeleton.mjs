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
await page.waitForTimeout(1800)
// abrir o tab Esqueleto v2
await page.click('#tabs button[data-tab="tab-skeleton"]')
await page.waitForTimeout(400)
const stats = await page.evaluate(() => document.getElementById('sk-stats')?.innerText ?? '(vazio)')
const valid = await page.evaluate(() => document.getElementById('sk-validation')?.innerText ?? '(vazio)')
const rows = await page.evaluate(() => document.querySelectorAll('#sk-tree .sk-row').length)
console.log('STATS:', stats.replace(/\n/g, ' | '))
console.log('VALIDAÇÃO:', valid.replace(/\n/g, ' | '))
console.log('linhas na árvore (inclui cabeçalho):', rows)
console.log('export enabled:', await page.evaluate(() => !document.getElementById('sk-export').disabled))
// trocar para o template do jogo (preservar)
await page.selectOption('#sk-template', 'game')
await page.waitForTimeout(400)
console.log('--- após "Preservar — Stalker (21)" ---')
console.log('STATS:', await page.evaluate(() => document.getElementById('sk-stats')?.innerText.replace(/\n/g, ' | ')))
console.log('VALIDAÇÃO:', (await page.evaluate(() => document.getElementById('sk-validation')?.innerText) || '').replace(/\n/g, ' | ').slice(0, 300))
// adicionar junta e ver a validação continuar limpa
await page.click('#sk-add')
await page.waitForTimeout(400)
console.log('--- após "+ Junta" ---')
console.log('VALIDAÇÃO:', (await page.evaluate(() => document.getElementById('sk-validation')?.innerText) || '').replace(/\n/g, ' | ').slice(0, 300))
console.log('ERROS:', errors.join('\n') || '(nenhum)')
await page.screenshot({ path: '/tmp/sk-tab.png' })
await browser.close()
