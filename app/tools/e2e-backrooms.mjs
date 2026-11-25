// E2E headless — joga o Lobby 0 do início à vitória (teclas E reais, polling para swiftshader lento)
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
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const fail = (msg) => { console.error('FALHA E2E:', msg); process.exitCode = 1 }

const poll = async (fn, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn)) return true
    await page.waitForTimeout(200)
  }
  return false
}
// segurar E até a condição cumprir (swiftshader: frames esparsos)
// garantir N frames renderizados entre passos (swiftshader: frames esparsos;
// sem um frame com E solto o edge-detection do jogo nunca re-arma)
const nextFrames = async (n = 2, timeout = 10000) => {
  const f = await page.evaluate(() => window.__game.frameCount)
  await page.waitForFunction(`window.__game.frameCount >= ${f + n}`, { timeout })
}

const pressUntil = async (fn, ms = 20000) => {
  await page.keyboard.down('KeyE')
  const ok = await poll(fn, ms)
  await page.keyboard.up('KeyE')
  return ok
}

await page.goto('http://localhost:5173/backrooms.html?autostart=1&seed=1337', { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined && window.__game.frameCount > 2, { timeout: 60000 })
console.log('boot ok — estado:', await page.evaluate(() => window.__game.state))

// 1) teleportar para a chave e apanhá-la (segurar E + polling)
await page.evaluate(() => { const g = window.__game; g.player.x = g.built.keyPos.x; g.player.z = g.built.keyPos.z; g.player.yaw = 0 })
const gotKey = await pressUntil(() => window.__game.puzzle.keyTaken === true, 20000)
console.log(gotKey ? '✓ chave apanhada' : '✗ chave NÃO apanhada')
if (!gotKey) fail('chave não foi apanhada')
await nextFrames(2)

// 2) ir à porta e abri-la
await page.evaluate(() => {
  const g = window.__game
  const d = g.built.door
  g.player.x = d.x + d.normal[0] * 1.6; g.player.z = d.z + d.normal[2] * 1.6
  g.player.yaw = Math.atan2(d.x - g.player.x, -(d.z - g.player.z)); g.player.pitch = 0
})
const opened = await pressUntil(() => window.__game.puzzle.doorOpen === true, 20000)
console.log(opened ? '✓ porta aberta' : '✗ porta NÃO abriu')
if (!opened) fail('porta não abriu')

// 3) pisar a célula de saída → vitória
await page.evaluate(() => {
  const g = window.__game
  g.player.x = g.lvl.exit.x * 3 + 1.5; g.player.z = g.lvl.exit.z * 3 + 1.5
})
const won = await poll(() => window.__game.state === 'finished', 15000)
const endShown = await page.evaluate(() => document.getElementById('screen-end')?.classList.contains('show'))
const stats = await page.evaluate(() => document.getElementById('end-stats')?.textContent)
console.log(won && endShown ? `✓ vitória — ${stats}` : '✗ vitória NÃO disparou', '| screen-end visível:', endShown)
if (!won || !endShown) fail('vitória não disparou')

if (process.exitCode !== 1) console.log('E2E COMPLETO — o Lobby 0 é vencível do início ao fim (teclas reais, sem truques)')
await browser.close()
