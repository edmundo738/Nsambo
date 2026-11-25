// Diagnóstico ao vivo — estado do jogo, bounds das meshes, células e screenshot
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
  executablePath, args: [...chromium.args],
  env: { ...process.env, LD_LIBRARY_PATH: [libPath, ...(process.env.LD_LIBRARY_PATH?.split(':') ?? [])].join(':'), FONTCONFIG_PATH: join(tmpdir(), 'fonts'), HOME: tmpdir() },
  headless: true
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const url = process.argv[2] ?? 'http://localhost:5173/backrooms.html?autostart=1&seed=1337&at=76.5,55.6&yaw=0&noflash=1'
const out = process.argv[3] ?? '/home/user/Nsambo/app/docs/screenshots/br-door2.jpg'
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => window.__game !== undefined && window.__game.frameCount > 1, { timeout: 60000 })
await page.waitForTimeout(1200)
const info = await page.evaluate(() => {
  const g = window.__game
  const bounds = (arr) => {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
    for (let i = 0; i < arr.length; i += 3) {
      for (let k = 0; k < 3; k++) { if (arr[i + k] < mn[k]) mn[k] = arr[i + k]; if (arr[i + k] > mx[k]) mx[k] = arr[i + k] }
    }
    return { mn: mn.map(v => +v.toFixed(2)), mx: mx.map(v => +v.toFixed(2)), verts: arr.length / 3 }
  }
  const meshInfo = {}
  for (const nm of ['paintingMtn', 'paintingEye', 'frame', 'wall', 'door']) {
    const m = g.renderer.meshes.find((mm) => mm.material === nm) ?? g.renderer['mesh_' + nm]
    meshInfo[nm] = m ? bounds(m.positions) : 'AUSENTE'
  }
  return {
    url: location.href,
    playerPos: [+g.player.x.toFixed(2), +g.player.z.toFixed(2)],
    cell: g.player.currentCell(),
    camEye: g.player.camEye?.map(v => +v.toFixed(2)),
    meshInfo,
    paintings: g.built.paintings,
  }
})
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: out, type: 'jpeg', quality: 90 })
await browser.close()
