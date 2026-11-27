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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
const url = process.argv[2] || 'http://localhost:5177/rig-align.html'
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1800)
const metrics = await page.evaluate(() => {
  const side = document.querySelector('.side')
  const layout = document.getElementById('layout')
  const out = {
    bodyOverflow: getComputedStyle(document.body).overflow,
    layoutH: layout?.clientHeight,
    sideClientH: side?.clientHeight,
    sideScrollH: side?.scrollHeight,
    sideScrollable: side ? side.scrollHeight > side.clientHeight + 1 : null,
    sideOverflowY: side ? getComputedStyle(side).overflowY : null,
    jointListScrollH: document.querySelector('.joint-list')?.scrollHeight,
    jointListClientH: document.querySelector('.joint-list')?.clientHeight,
    hud: document.getElementById('hud-3d')?.textContent,
  }
  return out
})
console.log(JSON.stringify(metrics, null, 2))
// tenta scroll na sidebar com a roda do rato sobre ela
const sideBox = await page.evaluate(() => { const r = document.querySelector('.side').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
await page.mouse.move(sideBox.x, sideBox.y)
await page.mouse.wheel(0, 600)
await page.waitForTimeout(300)
const after = await page.evaluate(() => document.querySelector('.side').scrollTop)
console.log('scrollTop após wheel sobre a sidebar:', after)
console.log('ERROS:', errors.join('\n') || '(nenhum)')
await page.screenshot({ path: '/tmp/layout-antes.png', fullPage: false })
await browser.close()
