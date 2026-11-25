// Smoke test do build estático via file:// — o que o duplo-clique no Windows faz
import chromium, { inflate } from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))), '..')
await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'))
await inflate(join(pkgRoot, 'bin', 'fonts.tar.br'))
const libPath = join(tmpdir(), 'al2023', 'lib')

const distUrl = pathToFileURL('/home/user/Nsambo/app/dist/backrooms.html').href
const url = distUrl + '?autostart=1&seed=1337&noflash=1'

const executablePath = await chromium.executablePath()
const browser = await playwright.launch({
  executablePath,
  args: [...chromium.args],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => { errors.push(e.message); console.error('[pageerror]', e.message) })
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.error('[console]', m.text()) } })
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 })
await page.waitForTimeout(3000)
const state = await page.evaluate(() => {
  const g = window.__game
  return { ready: !!g, pos: g.player?.position ? [g.player.position.x, g.player.position.z] : null, textures: g.textures ? Object.keys(g.textures) : null }
})
await page.screenshot({ path: '/home/user/Nsambo/app/docs/screenshots/br-dist-smoke.jpg', type: 'jpeg', quality: 90 })
console.log('ESTADO:', JSON.stringify(state))
console.log('ERROS:', errors.length === 0 ? 'nenhum' : errors.join(' | '))
await browser.close()
process.exit(errors.length === 0 && state.ready ? 0 : 1)
