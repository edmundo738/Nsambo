import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
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
await page.waitForTimeout(2000)
const shot = (p) => page.screenshot({ path: p })
const bufOf = (p) => readFileSync(p)
const diff = (a, b) => { const A = bufOf(a), B = bufOf(b); let n = Math.abs(A.length - B.length); const m = Math.min(A.length, B.length); for (let i = 0; i < m; i += 997) if (A[i] !== B[i]) n++; return n }
await shot('/tmp/nav-1-antes.png')
// 1) botão esquerdo no VAZIO do canvas → deve ORBITAR (câmara move)
const cv = await page.locator('#cv-3d').boundingBox()
const cx = cv.x + cv.width * 0.72, cy = cv.y + cv.height * 0.28  // canto vazio (longe das esferas?)
await page.mouse.move(cx, cy)
await page.mouse.down()
await page.mouse.move(cx + 160, cy + 60, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(400)
await shot('/tmp/nav-2-orbitou.png')
console.log('pixels diferentes após orbitar (esq vazio):', diff('/tmp/nav-1-antes.png', '/tmp/nav-2-orbitou.png'))
// 2) wheel → zoom (câmara aproxima)
const before = await page.evaluate(() => document.querySelector('#model-info')?.textContent)
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2)
await page.mouse.wheel(0, -400)
await page.waitForTimeout(400)
await shot('/tmp/nav-3-zoom.png')
console.log('zoom aplicado (pixels mudaram):', diff('/tmp/nav-2-orbitou.png', '/tmp/nav-3-zoom.png') > 0)
// 3) botão vista «Frente»
await page.click('#view-front')
await page.waitForTimeout(400)
await shot('/tmp/nav-4-frente.png')
// 4) vista «Cima» e «Lado» — só verificar que mudam pixels e não rebentam
await page.click('#view-top'); await page.waitForTimeout(300); await shot('/tmp/nav-5-cima.png')
await page.click('#view-side'); await page.waitForTimeout(300); await shot('/tmp/nav-6-lado.png')
console.log('frente≠cima:', diff('/tmp/nav-4-frente.png', '/tmp/nav-5-cima.png') > 0, '| cima≠lado:', diff('/tmp/nav-5-cima.png', '/tmp/nav-6-lado.png') > 0)
// 5) Recentrar após andar pela cena
await page.click('#view-reset'); await page.waitForTimeout(400); await shot('/tmp/nav-7-reset.png')
console.log('reset≠lado:', diff('/tmp/nav-6-lado.png', '/tmp/nav-7-reset.png') > 0)
// 6) sidebar: altura da lista de juntas > 0 e scroll próprio
const list = await page.evaluate(() => {
  const el = document.querySelector('.joint-list')
  return { h: el?.clientHeight, scroll: el?.scrollHeight, canScroll: (el?.scrollHeight ?? 0) > (el?.clientHeight ?? 0) }
})
console.log('joint-list:', JSON.stringify(list))
const sideScroll = await page.evaluate(() => ({ ch: document.querySelector('.side').clientHeight, sh: document.querySelector('.side').scrollHeight }))
console.log('sidebar scroll:', JSON.stringify(sideScroll))
// 7) rodapé JSON recolhível
await page.click('#json-toggle'); await page.waitForTimeout(150)
const collapsed = await page.evaluate(() => document.getElementById('statusbar').classList.contains('collapsed'))
await page.click('#json-toggle')
console.log('rodapé recolhe/expande:', collapsed === true)
// 8) detalhes recolhíveis existem e Análise aberta por omissão
const det = await page.evaluate(() => [...document.querySelectorAll('.box-collapse')].map(d => ({ summary: d.querySelector('summary')?.textContent?.trim().slice(0, 26), open: d.open })))
console.log('details:', JSON.stringify(det))
console.log('HUD:', await page.evaluate(() => document.getElementById('hud-3d').textContent))
console.log('ERROS:', errors.join('\n') || '(nenhum)')
await browser.close()
