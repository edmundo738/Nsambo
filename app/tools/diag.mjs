import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const pkgRoot = join(new URL(import.meta.resolve('@sparticuz/chromium')).pathname, '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const executablePath = await chromium.executablePath()
const browser = await playwright.launch({ executablePath, args: [...chromium.args, '--hide-scrollbars'], env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() }, headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
page.on('console', (m) => console.error('[console]', m.type(), m.text().slice(0, 300)))
page.on('pageerror', (e) => console.error('[pageerror]', String(e.stack || e).slice(0, 700)))
await page.goto('http://localhost:5173/backrooms.html?autostart=1&seed=1337', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1000)
  const s = await page.evaluate(() => ({ state: window.__game?.state, frames: window.__game?.frameCount, err: window.__game?._lastError ?? null })).catch((e) => ({ err: String(e) }))
  console.error('t+' + (i + 1) + 's', JSON.stringify(s))
}
await browser.close()
process.exit(0)
