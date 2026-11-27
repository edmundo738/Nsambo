// QA da nova build 0.2.0: verifica A1/A2/A3/A4/A5 no artefacto dist/ (headless)
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
const page = await browser.newPage({ viewport: { width: 1280, height: 750 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
await page.goto('http://localhost:4180/backrooms.html?autostart=1&gym=1&stalkerdist=3&stalkerdie=0.3&debug=1', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__READY === true, { timeout: 60000 })
// A2 — overlay de loading saiu do DOM
await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 10000 }).catch(() => errs.push('A2: #loading AINDA no DOM após 10 s'))
const loadingState = await page.evaluate(() => {
  const el = document.getElementById('loading')
  return el ? { present: true, cls: el.className, vis: getComputedStyle(el).visibility } : { present: false }
})
console.log('A2 loading:', JSON.stringify(loadingState))
// distância do stalker no painel antes da morte
await page.waitForTimeout(1200)
const panel = () => page.evaluate(() => document.getElementById('debug-panel')?.textContent ?? '(painel vazio)')
console.log('F3 antes da morte:\n' + (await panel()))
// aguardar a morte (stalkerdie usa segundos de relógio agora)
let phase = null
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(500)
  const s = await page.evaluate(() => {
    const st = window.__game?.stalker
    if (!st) return { present: false }
    return { present: st.present, sinkT: st.sinkT, sinkY: st.sinkY, ragdoll: !!st.rig?.ragdoll, settled: !!st.rig?.ragdoll?.settled, state: st.brain?.state }
  })
  process.stdout.write(`\r  t+${(i * 0.5).toFixed(1)}s ragdoll=${s.ragdoll} settled=${s.settled} sinkT=${s.sinkT?.toFixed?.(2) ?? s.sinkT} present=${s.present}   `)
  if (s.present === false && s.sinkT === -2) { phase = 'desfeito e removido'; break }
  if (s.ragdoll && s.settled && s.sinkT >= 0) phase = 'a afundar'
  if (i === 119) phase = 'TIMEOUT-sem-remover'
}
console.log('\nA1 morte→afundar→remover:', phase)
console.log('F3 depois da morte:\n' + (await panel()))
// A4 — distância coerente (nunca 999 no painel)
const p = await panel()
if (/999\.0/.test(p)) errs.push('A4: painel mostra 999.0 m')
if (/ausente/.test(p) && phase !== 'desfeito e removido') errs.push('A4/A3: painel ausente com stalker presente')
console.log('errors:', errs.length ? '\n' + errs.join('\n') : '(nenhum)')
await browser.close()
