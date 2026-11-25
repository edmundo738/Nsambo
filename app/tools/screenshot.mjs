// Screenshots headless (chromium + swiftshader) — captura direta do canvas WebGL.
// Uso: node tools/screenshot.mjs [view ...]   (default: todas)
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')

const OUT = new URL('../../docs/screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const ALL = ['hero', 'street', 'lobby', 'side', 'top']
const argv = process.argv.slice(2)
const prefixIdx = argv.indexOf('--prefix')
const prefix = prefixIdx >= 0 ? argv.splice(prefixIdx, 2)[1] : 'bna'
const views = argv.length ? argv : ALL

const executablePath = await chromium.executablePath()
const browser = await playwright.launch({
  executablePath,
  args: [...chromium.args, '--hide-scrollbars'],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'),
    FONTCONFIG_PATH: join(tmpdir(), 'fonts'),
    HOME: tmpdir()
  },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

for (const v of views) {
  const extra = process.env.SHOT_QUERY ? `&${process.env.SHOT_QUERY}` : ''
  await page.goto(`http://localhost:5173/?view=${v}${extra}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.__READY === true, { timeout: 60000 })
  await page.waitForTimeout(500)
  const dataUrl = await page.evaluate(() => {
    const { renderer, scene, camera } = window.__nsambo
    renderer.render(scene, camera)          // render síncrono → buffer válido
    return renderer.domElement.toDataURL('image/jpeg', 0.92)
  })
  const file = `${OUT}${prefix}-${v}.jpg`
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('saved', file)
}
await browser.close()
