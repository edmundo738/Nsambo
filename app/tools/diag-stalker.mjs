import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--hide-scrollbars'],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1280, height: 750 } })
page.on('console', (m) => console.log('[console:' + m.type() + ']', m.text()))
await page.goto('http://localhost:5173/backrooms.html?autostart=1&gym=1&stalkerdemo=1&stalkerdist=3.4&pitch=0.05&stalkerdie=0.05', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
const pre = await page.evaluate(() => ({
  qaDie: window.__game?._qaDieT, hasDie: typeof window.__game?.stalker?.die,
  rig: !!window.__game?.stalker?.rig, param: new URLSearchParams(location.search).get('stalkerdie'),
  state: window.__game?.state,
}))
console.log('PRE', JSON.stringify(pre))
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1000)
  const info = await page.evaluate(() => {
    const st = window.__game?.stalker
    const panel = document.getElementById('debug-panel')?.textContent?.split('\n').pop()
    const qaN = window.__game._qaDieT; return st ? { qa: qaN === undefined ? 'undef' : +(qaN).toFixed(2), d: st.brain.distance?.toFixed?.(2), state: st.brain.state, panel, rag: st.rig?.ragdoll ? (st.rig.ragdoll.settled ? 'settled' : 'sim') : null, sinkT: +(st.sinkT ?? -1).toFixed?.(2), sinkY: +(st.sinkY ?? 0).toFixed(3) } : { qa: qaN === undefined ? 'undef' : +(qaN).toFixed(2), st: null }
  })
  console.log('t+' + (i + 1) + 's', JSON.stringify(info))
}
try { await page.screenshot({ path: '/tmp/diag-panel.png', timeout: 20000 }) } catch (e) { console.log('screenshot falhou:', e.message) }
await browser.close()
