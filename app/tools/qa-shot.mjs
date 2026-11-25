// screenshot QA: node tools/_shot.mjs "<params>" <out.jpg> [lookYaw] [lookPitch]
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(), args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300)) })
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)))
const [params, out] = [process.argv[2] || 'autostart=1&seed=1337', process.argv[3] || '/tmp/shot.jpg']
await page.goto(`http://localhost:5175/backrooms.html?${params}`, { waitUntil: 'load', timeout: 90000 })
await page.waitForFunction(() => window.__game?.frameCount > 30, { timeout: 90000 })
// posicionar junto à porta e virar para ela
const info = await page.evaluate(() => {
  const g = window.__game, b = g.built
  const exitIdx = { x: b.door.axisX ? b.door.dat : b.door.plane, z: b.door.axisX ? b.door.plane : b.door.dat }
  return { door: b.door, exit: b.exit, spawn: g.lvl.spawn, lamps: (b.lamps ?? []).length, pillars: g.lvl.pillars }
})
console.log(JSON.stringify(info, null, 0))
await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 400))
await page.screenshot({ path: out, type: 'jpeg', quality: 82 })
await browser.close()
