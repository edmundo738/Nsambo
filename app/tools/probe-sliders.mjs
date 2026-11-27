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
  executablePath: await chromium.executablePath(),
  args: [...chromium.args],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1440, height: 840 } })
await page.goto('http://localhost:5173/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.click('#tabs button[data-tab="tab-anim"]')
await page.waitForTimeout(3500)
const m = await page.evaluate(() => {
  const r = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { h: +b.height.toFixed(1), top: +b.top.toFixed(1), disp: getComputedStyle(el).display, flex: getComputedStyle(el).flex, minh: getComputedStyle(el).minHeight, ov: getComputedStyle(el).overflowY } }
  return { boxGrow: r('#tab-anim .box.grow'), sliders: r('#anim-sliders'), pMini: r('#tab-anim .box.grow p.mini'), rows: document.querySelectorAll('#anim-sliders .anim-slider').length, sideH: r('#tab-anim .side')?.h }
})
console.log(JSON.stringify(m, null, 1))
await browser.close()
