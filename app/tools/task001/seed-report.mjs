// TASK 001 — relatório de seeds: geração determinística + validação + métricas
// Uso: node tools/task001/seed-report.mjs [--seeds=N] [--size=26] [--out=ARQ]
// Saída: tabela no stdout (e JSON opcional) — exit 1 se alguma seed falhar.
import { generateLevel, validateLevel, mulberry32 } from '../../src/backrooms/engine/wfc.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const SEEDS = Number(opt('seeds', 64))
const SIZE = Number(opt('size', 26))
const OUT = opt('out', null)

const rows = []
let failures = []
for (let seed = 1; seed <= SEEDS; seed++) {
  const t0 = process.hrtime.bigint()
  const lvl = generateLevel({ seed, size: SIZE })
  const genMs = Number(process.hrtime.bigint() - t0) / 1e6
  if (!lvl) { failures.push({ seed, reason: 'generateLevel devolveu null' }); rows.push({ seed, ok: false, genMs }); continue }
  const v = validateLevel(lvl)
  const row = {
    seed: lvl.seed,          // seed interna efetiva (seed + tentativa*7919)
    requested: seed,
    ok: v.ok,
    errors: v.errors,
    openCount: lvl.openCount,
    maxDist: lvl.maxDist,
    pillars: lvl.pillars,
    sealedEdges: lvl.sealedEdges.length,
    key: lvl.key ? `${lvl.key.x},${lvl.key.z}` : null,
    genMs: Math.round(genMs * 10) / 10,
  }
  if (!v.ok) failures.push(row)
  rows.push(row)
}

const okRows = rows.filter(r => r.ok)
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
console.log(`seeds 1..${SEEDS} · size ${SIZE} · válidas ${okRows.length}/${rows.length}`)
if (okRows.length) {
  console.log(`openCount média ${avg(okRows.map(r => r.openCount)).toFixed(1)} · maxDist média ${avg(okRows.map(r => r.maxDist)).toFixed(1)} · pilares média ${avg(okRows.map(r => r.pillars)).toFixed(1)} · divisórias média ${avg(okRows.map(r => r.sealedEdges)).toFixed(1)}`)
  console.log(`tempo de geração (generateLevel) média ${avg(okRows.map(r => r.genMs)).toFixed(1)} ms · máx ${Math.max(...okRows.map(r => r.genMs)).toFixed(1)} ms`)
}
for (const r of rows) {
  console.log(`${r.ok ? 'OK ' : 'FALHA'} seed=${r.requested} iv=${r.seed ?? '-'} open=${r.openCount ?? '-'} maxDist=${r.maxDist ?? '-'} pilares=${r.pillars ?? '-'} divisórias=${r.sealedEdges ?? '-'} gen=${r.genMs?.toFixed(1)}ms${r.errors?.length ? ' · ' + r.errors.join('; ') : ''}`)
}
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ meta: { date: new Date().toISOString(), seeds: SEEDS, size: SIZE }, rows, failures }, null, 2))
  console.log('JSON →', OUT)
}
process.exit(failures.length ? 1 : 0)
