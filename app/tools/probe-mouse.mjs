// Verificação headless da lógica do mouse (o lock real só no PC do user):
//  1) movementX > 0 ⇒ yaw SOBE (vista roda para a direita) — convenção FPS
//  2) movementX < 0 ⇒ yaw DESCE
//  3) spike |movementX| > 200 ⇒ ignorado (anti-"estalo")
//  4) movementY > 0 (rato p/ baixo) ⇒ pitch desce (olhar baixa) — como antes
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
await page.goto('http://localhost:5173/backrooms.html?autostart=1&seed=1337&noflash=1', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
await page.waitForTimeout(800)

const snap = () => page.evaluate(() => [window.__game.player.yaw, window.__game.player.pitch])
const seq = (dx, dy, n = 12) => page.evaluate(([dx, dy, n]) => {
  // simula o lock (headless não o concede sem gesto real)
  window.__game.input.locked = true
  for (let i = 0; i < n; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy }))
}, [dx, dy, n])
const frames = (n) => page.evaluate((n) => new Promise((res) => {
  let c = 0
  const tick = () => { if (++c >= n) res(); else requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), n)

const [y0] = await snap()
await seq(10, 0)          // rato p/ a direita
await frames(3)
const [y1] = await snap()
await seq(-10, 0)         // rato p/ a esquerda
await frames(3)
const [y2] = await snap()
await seq(500, 0, 1)      // spike absurdo — ignorado
await frames(3)
const [y3] = await snap()
const [, p0] = await snap()
await seq(0, 10)          // rato p/ baixo
await frames(3)
const [, p1] = await snap()

const f = (n) => (n >= 0 ? '+' : '') + n.toFixed(4)
console.log('yaw inicial  :', f(y0))
console.log('após direita :', f(y1), '→ yaw subiu?', y1 > y0)
console.log('após esquerda:', f(y2), '→ yaw desceu?', y2 < y1)
console.log('após spike   :', f(y3), '→ spike ignorado?', Math.abs(y3 - y2) < 1e-6)
console.log('pitch inicial:', f(p0), '→ após rato p/ baixo:', f(p1), '(desceu?', p1 < p0, ')')
const ok = y1 > y0 + 0.001 && y2 < y1 - 0.001 && Math.abs(y3 - y2) < 1e-6 && p1 < p0
console.log(ok ? '\nMOUSE-FIX: PASS' : '\nMOUSE-FIX: FALHOU')
await browser.close()
process.exit(ok ? 0 : 1)
