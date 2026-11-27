// sonda: estado do cérebro do stalker ao longo do tempo (headless)
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
page.on('console', msg => { const t = msg.text(); if (t.includes('stalker') || t.includes('stalkerdemo')) console.log('[console]', t) })
page.on('pageerror', e => console.error('[pageerror]', e.message))
const baseUrl = process.env.SHOT_URL || 'http://localhost:4180/backrooms.html'
await page.goto(`${baseUrl}?autostart=1&gym=1&stalkerdemo=1&stalkerdist=13.5&pitch=0.03`, { waitUntil: 'load', timeout: 60000 })
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(2000)
  const s = await page.evaluate(() => {
    const g = window.__game
    if (!g) return { err: 'no game' }
    const st = g.stalker
    if (!st) return { err: 'no stalker entity', state: g.state }
    const b = st.brain
    const p = g.player
    let los = null
    try { los = p?.hasLineOfSight ? p.hasLineOfSight(b.x, b.z, p.x, p.z) : 'n/a' } catch (e) { los = 'err:' + e.message }
    return { state: g.state, present: st.present, brain: b?.state, x: +b?.x?.toFixed(1), z: +b?.z?.toFixed(1), memAge: +b?.memAge?.toFixed?.(1), speed: +b?.speed?.toFixed(2), dist: p ? +Math.hypot(b.x - p.x, b.z - p.z).toFixed(2) : null, los, huntFocus: +b?.huntFocus?.toFixed?.(2) }
  }).catch(e => ({ err: String(e) }))
  console.log(`t+${(i + 1) * 2}s`, JSON.stringify(s))
}
await browser.close()
