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
const page = await browser.newPage({ viewport: { width: 760, height: 800 } })
const errors = []
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
await page.goto('http://localhost:5177/rig-align.html', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1500)
const m = await page.evaluate(() => {
  const cv = document.querySelector('.canvas-wrap').getBoundingClientRect()
  const side = document.querySelector('.side').getBoundingClientRect()
  return {
    bodyScroll: getComputedStyle(document.body).overflow,
    canvas: { top: Math.round(cv.top), h: Math.round(cv.height) },
    side: { top: Math.round(side.top), w: Math.round(side.width) },
    canScrollPage: document.documentElement.scrollHeight > innerHeight,
  }
})
console.log('layout 760px:', JSON.stringify(m))
console.log('ERROS:', errors.join('\n') || '(nenhum)')
await page.screenshot({ path: '/tmp/ui-mobile.png' })
await browser.close()
