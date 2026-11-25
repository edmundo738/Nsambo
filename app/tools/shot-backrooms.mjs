// Screenshots headless do THE BACKROOMS — captura canvas + HUD via Playwright
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')

const OUT = new URL('../docs/screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const ALL = [
  { name: 'br-title', q: '' },
  { name: 'br-spawn', q: 'autostart=1&seed=1337' },
  { name: 'br-wall', q: 'autostart=1&seed=1337&yaw=2.6&pitch=0.05' },
  { name: 'br-top', q: 'autostart=1&seed=1337&topdown=1' },
  { name: 'br-key', q: 'autostart=1&seed=1337&at=40.5,7.5&yaw=0&pitch=-0.12' },
  { name: 'br-door', q: 'autostart=1&seed=1337&at=76.5,56.3&yaw=0&pitch=-0.03' },
      { name: 'br-painting', q: 'autostart=1&seed=1337&at=31.5,35.4&yaw=0&pitch=0&noflash=1' },
  { name: 'br-painting-eye', q: 'autostart=1&seed=1337&at=34.4,19.5&yaw=1.5708&pitch=0&noflash=1' },
  { name: 'br-spawn-psx', q: 'autostart=1&seed=1337&psx=1' },
  { name: 'br-spawn-nopom', q: 'autostart=1&seed=1337&nopom=1' },
]
const FILTER = process.argv.slice(2)
const SHOTS = FILTER.length ? ALL.filter((s) => FILTER.includes(s.name)) : ALL

const executablePath = await chromium.executablePath()
const browser = await playwright.launch({
  executablePath,
  args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.type(), m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

for (const shot of SHOTS) {
  await page.goto(`http://localhost:5173/backrooms.html?${shot.q}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
  await page.waitForTimeout(shot.q === '' ? 2500 : 1600)
  await page.screenshot({ path: `${OUT}${shot.name}.jpg`, type: 'jpeg', quality: 90 })
  console.log('saved', `${OUT}${shot.name}.jpg`)
}
await browser.close()
