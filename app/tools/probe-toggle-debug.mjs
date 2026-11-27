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
await page.goto('http://localhost:5177/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1500)
const dump = async (label) => {
  const m = await page.evaluate(() => {
    const t = document.getElementById('json-toggle').getBoundingClientRect()
    const s = document.querySelector('.side').getBoundingClientRect()
    const fl = document.getElementById('statusbar').getBoundingClientRect()
    const el = document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2)
    return { toggle: { y: t.y, h: t.height }, sideBottom: s.bottom, footerTop: fl.top, footerH: fl.height, hit: el ? el.className : 'null' }
  })
  console.log(label, JSON.stringify(m))
}
await dump('início            ')
await page.click('#view-front'); await dump('após Frente      ')
await page.click('#view-top');   await dump('após Cima        ')
await page.click('#view-side');  await dump('após Lado        ')
await page.click('#view-reset'); await dump('após Recentrar   ')
await browser.close()
