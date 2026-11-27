// captura vídeo real do jogo (headless) para auditoria: node tools/record-game.mjs out.webm "autostart=1&..." segundos
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
const outPath = process.argv[2] ?? '/tmp/gameplay.webm'
const query = process.argv[3] ?? 'autostart=1&gym=1&stalkerdemo=1&stalkerdist=4.0'
const seconds = Number(process.argv[4] ?? 15)
const browser = await playwright.launch({
  executablePath, args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 750 },
  recordVideo: { dir: dirname(outPath), size: { width: 1280, height: 750 } }
})
const page = await context.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const baseUrl = process.env.SHOT_URL || 'http://localhost:5173/backrooms.html'
await page.goto(`${baseUrl}?${query}`, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
console.log('game carregado — a gravar', seconds, 's')
await page.waitForTimeout(seconds * 1000)
await context.close()   // descarrega o vídeo para o disco
await browser.close()
console.log('gravado em', dirname(outPath))
