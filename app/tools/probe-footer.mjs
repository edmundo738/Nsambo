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
await page.waitForTimeout(1200)
const m = await page.evaluate(() => {
  const bar = document.getElementById('statusbar')
  const tgl = document.getElementById('json-toggle')
  const layout = document.getElementById('layout')
  const r = bar.getBoundingClientRect(), rt = tgl.getBoundingClientRect(), rl = layout.getBoundingClientRect()
  const cx = rt.x + rt.width / 2, cy = rt.y + rt.height / 2
  const at = document.elementFromPoint(cx, cy)
  return {
    viewport: { w: innerWidth, h: innerHeight },
    statusbar: { top: r.top, height: r.height, display: getComputedStyle(bar).display, position: getComputedStyle(bar).position },
    toggle: { top: rt.top, left: rt.left, width: rt.width, height: rt.height, position: getComputedStyle(tgl).position },
    layout: { top: rl.top, height: rl.height },
    elementAtToggleCenter: at ? (at.tagName + '.' + String(at.className).slice(0, 40)) : 'null',
    bodyH: getComputedStyle(document.body).height,
  }
})
console.log(JSON.stringify(m, null, 2))
await browser.close()
