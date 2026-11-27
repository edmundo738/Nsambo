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
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
const url = process.argv[2] || 'http://localhost:5177/rig-align.html'
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1800)
const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
await page.click('#btn-export-glb')
const download = await downloadPromise
const path = await download.path()
const { readFileSync } = await import('node:fs')
const buf = readFileSync(path)
const magic = buf.readUInt32LE(0)
console.log('download:', download.suggestedFilename(), '| bytes:', buf.length, '| GLB magic ok:', magic === 0x46546c67, '| v', buf.readUInt32LE(4))
// verifica que é o GLB skinned: procura "stalker-skin" no JSON chunk
const clen = buf.readUInt32LE(12)
const json = buf.subarray(20, 20 + clen).toString('utf8')
console.log('contém skin stalker-skin:', json.includes('stalker-skin'), '| contém JOINTS_0:', json.includes('JOINTS_0'))
console.log('ERROS:', errors.join('\n') || '(nenhum)')
await browser.close()
