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
// espera o stalker existir e estar presente (senão gravamos 20 s de ecrã de loading)
try {
  await page.waitForFunction(() => window.__game?.stalker?.present === true, { timeout: 90000, polling: 250 })
  console.log('stalker presente — a gravar', seconds, 's')
} catch {
  console.warn('⚠️ stalker não ficou present em 90 s — a gravar mesmo assim')
}
// mais 2 s para o primeiro frame com pele estabilizada
await page.waitForTimeout(2000)
await page.waitForTimeout(seconds * 1000)
const final = await page.evaluate(() => { const g = window.__game; const st = g?.stalker; return st ? { state: st.brain?.state, x: +st.brain?.x?.toFixed(1), z: +st.brain?.z?.toFixed(1), present: st.present, dist: g.player ? +Math.hypot(st.brain.x - g.player.x, st.brain.z - g.player.z).toFixed(1) : null, fps: g.renderer?.fps } : { stalker: 'ausente' } }).catch(e => ({ err: String(e) }))
console.log('estado final do stalker:', JSON.stringify(final))
await context.close()   // descarrega o vídeo para o disco
// playwright nomeia o ficheiro com hash — renomeia para o nome pedido
import { readdirSync, statSync, renameSync } from 'node:fs'
const dir = dirname(outPath)
const webms = readdirSync(dir).filter(f => f.endsWith('.webm')).map(f => [f, statSync(join(dir, f)).mtimeMs]).sort((a, b) => b[1] - a[1])
if (webms.length && webms[0][0] !== outPath.split('/').pop()) {
  renameSync(join(dir, webms[0][0]), outPath)
  console.log('vídeo renomeado:', webms[0][0], '→', outPath)
}
await browser.close()
console.log('gravado em', outPath)
