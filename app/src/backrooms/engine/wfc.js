// ============================================================================
// NSAMBO ENGINE — Wave Function Collapse (esqueleto de nível) + Validadores
// Puro JS, sem DOM — testável em node (node --test).
// Sockets: 4 portas (N,E,S,W), 1 = passagem aberta, 0 = parede.
// Módulos (todas as rotações/simetrias derivadas automaticamente):
//   corridor, corner, T-junction, cross, dead-end, bloco-sólido
// Pós-processo determinístico: merge de componentes por abertura de paredes,
// abertura de salas (carve 2×2), passe ESTRUTURAL (pilares + divisórias como
// arestas seladas entre células abertas — paredes finas com aberturas) e
// validação final por BFS. Selar arestas nunca parte o nível (revert-on-fail).
// ============================================================================

export const WALL = 0, OPEN = 1

export function mulberry32(seed) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let r = Math.imul(s ^ (s >>> 15), 1 | s)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// Módulos baseétricos: portas [N,E,S,W]
const BASE_MODULES = [
  { name: 'corridor', ports: [0, 1, 0, 1], weight: 4.0 },   // E–W
  { name: 'corner',   ports: [0, 1, 1, 0], weight: 3.0 },   // E–S
  { name: 'tee',      ports: [1, 1, 0, 1], weight: 1.0 },   // N,E,W
  { name: 'cross',    ports: [1, 1, 1, 1], weight: 0.8 },
  { name: 'deadend',  ports: [1, 0, 0, 0], weight: 1.1 },   // N apenas
  { name: 'block',     ports: [0, 0, 0, 0], weight: 60 },   // parede sólida (define a estrutura)
]

// Gera o conjunto completo rotacionando 90° incrementalmente
function buildModuleSet() {
  const seen = new Map()
  for (const base of BASE_MODULES) {
    let ports = [...base.ports]
    for (let r = 0; r < 4; r++) {
      const key = ports.join('')
      if (!seen.has(key)) seen.set(key, { name: base.name, rot: r, ports: [...ports], weight: base.weight })
      ports = [ports[3], ports[0], ports[1], ports[2]] // rotação CW
    }
  }
  return [...seen.values()]
}
export const MODULES = buildModuleSet()

// Índice portas→id do módulo
const MODULE_ID = new Map(MODULES.map((m, i) => [m.ports.join(''), i]))

// Para cada direção e cada módulo, pré-computa compatibilidade
// dir: 0=N,1=E,2=S,3=W ; a célula vizinha deve ter porta aberta sse esta também tiver
const COMPAT = (() => {
  const C = [[], [], [], []]
  for (let d = 0; d < 4; d++) {
    const opp = (d + 2) % 4
    const table = new Array(MODULES.length)
    for (let a = 0; a < MODULES.length; a++) {
      const set = new Set()
      for (let b = 0; b < MODULES.length; b++) {
        const pa = MODULES[a].ports[d], pb = MODULES[b].ports[opp]
        if (pa === pb) set.add(b)
      }
      table[a] = set
    }
    C[d] = table
  }
  return C
})()
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]

function runWFC(size, rand) {
  const N = size * size
  let domains = new Array(N)
  for (let i = 0; i < N; i++) domains[i] = new Set(MODULES.keys())
  // Força portas fechadas de fronteira: qualquer módulo com porta aberta para fora do mundo é proibido
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x
    const forbid = []
    if (y === 0) forbid.push(0)
    if (x === size - 1) forbid.push(1)
    if (y === size - 1) forbid.push(2)
    if (x === 0) forbid.push(3)
    if (forbid.length) {
      const allowed = new Set([...domains[i]].filter(id => forbid.every(d => MODULES[id].ports[d] === 0)))
      domains[i] = allowed
    }
  }
  const stack = []
  const propagate = (start) => {
    stack.push(...start)
    while (stack.length) {
      const idx = stack.pop()
      const [cy, cx] = [Math.floor(idx / size), idx % size]
      for (let d = 0; d < 4; d++) {
        const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
        if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
        const nIdx = ny * size + nx
        // Unir restrições possíveis vindas de i para o vizinho
        let allowed = new Set()
        for (const a of domains[idx]) for (const b of COMPAT[d][a]) allowed.add(b)
        const next = new Set([...domains[nIdx]].filter(b => allowed.has(b)))
        if (next.size === 0) return false          // contradição
        if (next.size < domains[nIdx].size) { domains[nIdx] = next; stack.push(nIdx) }
      }
    }
    return true
  }
  while (true) {
    // escolher célula com menor entropia (>1 opções)
    let best = -1, bestEntropy = Infinity
    for (let i = 0; i < N; i++) {
      const s = domains[i].size
      if (s > 1 && s < bestEntropy) { bestEntropy = s; best = i }
    }
    if (best === -1) break // tudo colapsado
    const domain = [...domains[best]]
    // colapso ponderado
    const total = domain.reduce((acc, id) => acc + MODULES[id].weight, 0)
    let r = rand() * total, chosen = domain[0]
    for (const id of domain) { r -= MODULES[id].weight; if (r <= 0) { chosen = id; break } }
    domains[best] = new Set([chosen])
    if (!propagate([best])) return null   // contradição — o caller tenta outra seed
  }
  return domains.map(s => [...s][0])
}

export function generateLevel({ seed = 1337, size = 26 } = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rand = mulberry32(seed + attempt * 7919)
    const ids = runWFC(size, rand)
    if (!ids) continue
    // Grelha aberta/parede a partir dos módulos
    const cells = new Uint8Array(size * size)
    for (let i = 0; i < ids.length; i++) {
      const anyOpen = MODULES[ids[i]].ports.some(p => p === 1)
      cells[i] = anyOpen ? OPEN : WALL
    }
    // Ligar componentes abrindo paredes (WFC pode gerar ilhas seladas — a rede final é ÚNICA)
    const forgedBridges = []
    for (let safety = 0; safety < 400; safety++) {
      const compId = new Int32Array(size * size).fill(-1)
      let nComp = 0
      const q = []
      for (let st = 0; st < cells.length; st++) {
        if (cells[st] !== OPEN || compId[st] !== -1) continue
        const id = nComp++; compId[st] = id; q.push(st)
        while (q.length) {
          const i = q.pop()
          const cy = Math.floor(i / size), cx = i % size
          for (let d = 0; d < 4; d++) {
            const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
            if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
            const n = ny * size + nx
            if (cells[n] !== OPEN || compId[n] !== -1) continue
            if (MODULES[ids[i]].ports[d] !== 1 || MODULES[ids[n]].ports[(d + 2) % 4] !== 1) continue
            compId[n] = id; q.push(n)
          }
        }
      }
      if (nComp <= 1) break
      const bridges = []
      for (let i = 0; i < cells.length; i++) {
        const cy = Math.floor(i / size), cx = i % size
        for (let d = 0; d < 4; d++) {
          const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
          if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
          const j = ny * size + nx
          if (compId[j] === compId[i]) continue
          if (MODULES[ids[i]].ports[d] === 1 && MODULES[ids[j]].ports[(d + 2) % 4] === 1) continue  // passagem já aberta
          bridges.push([i, j, d])
        }
      }
      if (bridges.length === 0) break
      const [bi, bj, bd] = bridges[Math.floor(rand() * bridges.length)]
      const np = [...MODULES[ids[bi]].ports]; np[bd] = 1
      if (MODULE_ID.has(np.join(''))) ids[bi] = MODULE_ID.get(np.join(''))
      const np2 = [...MODULES[ids[bj]].ports]; np2[(bd + 2) % 4] = 1
      if (MODULE_ID.has(np2.join(''))) ids[bj] = MODULE_ID.get(np2.join(''))
      forgedBridges.push([bi, bj])
    }
    // Recomputar abertura/parede após o merge
    for (let i = 0; i < cells.length; i++) cells[i] = MODULES[ids[i]].ports.some(p => p === 1) ? OPEN : WALL
    // Spawn = célula mais próxima do centro (a rede é única e totalmente conectada)
    const cC = size >> 1
    let center = 0, bestScore = Infinity
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== OPEN) continue
      const score = Math.abs((i % size) - cC) + Math.abs(Math.floor(i / size) - cC)
      if (score < bestScore) { bestScore = score; center = i }
    }
    const openCount = cells.reduce((a, c) => a + c, 0)
    if (openCount < 120) continue

    // Abrir salas 2×2 em células abertas (remove paredes internas — nunca divide regiões)
    const carvedCells = new Uint8Array(size * size)
    for (const [bi, bj] of forgedBridges) { carvedCells[bi] = 1; carvedCells[bj] = 1 }
    let carved = forgedBridges.length
    for (let t = 0; t < 400 && carved < 5; t++) {
      const cx = 2 + Math.floor(rand() * (size - 4)), cy = 2 + Math.floor(rand() * (size - 4))
      const i0 = cy * size + cx
      if (cells[i0] !== OPEN) continue
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const j = (cy + dy) * size + (cx + dx)
        if (cells[j] === WALL && rand() < 0.75) { cells[j] = OPEN; carvedCells[j] = 1 }
      }
      carved++
    }

    // --- Passe ESTRUTURAL: pilares e divisórias (típico dos Backrooms) ---
    // Cada célula fechada aqui é REVERTIDA se o validador falhar — o nível nunca parte.
    const spawn0 = center  // provisório; spawn/exit/key finais são protegidos
    const sealedPre = new Set()  // no momento do passe de estrutura ainda não há selos de aresta
    const passBfsOk = (exitIdx, keyIdx) => {
      const d = bfsDistances(cells, ids, size, spawn0, carvedCells, sealedPre)
      if (d[exitIdx] === -1) return false
      if (keyIdx >= 0 && d[keyIdx] === -1) return false
      for (let j = 0; j < cells.length; j++) if (cells[j] === OPEN && d[j] === -1) return false
      return true
    }
    const protect = new Set([spawn0])

    // Spawn = centro; saída = célula aberta mais distante (BFS provisório para a estrutura)
    let dist = bfsDistances(cells, ids, size, spawn0, carvedCells)
    let exit0 = spawn0, maxD0 = 0
    for (let i = 0; i < dist.length; i++) if (dist[i] > maxD0) { maxD0 = dist[i]; exit0 = i }
    protect.add(exit0)
    // Chave provisória (mesma regra final)
    let key0 = -1
    for (let i = 0; i < dist.length; i++) {
      if (cells[i] === OPEN && dist[i] > maxD0 * 0.45 && dist[i] < maxD0 * 0.7) { key0 = i; break }
    }
    if (key0 === -1) { for (let i = 0; i < dist.length; i++) if (cells[i] === OPEN && dist[i] < maxD0 && i !== exit0) { key0 = i; break } }
    if (key0 >= 0) protect.add(key0)

    const tryWall = (i) => {
      if (cells[i] !== OPEN || protect.has(i)) return false
      cells[i] = WALL
      if (!passBfsOk(exit0, key0)) { cells[i] = OPEN; return false }
      return true
    }
    // Pilares: célula aberta totalmente rodeada por abertas recebe uma COLUNA FINA.
    // A célula CONTINUA ABERTA — a coluna é geometria (obstáculo físico), não parede do grid.
    let pillars = 0
    const pillarCells = []
    for (let t = 0; t < 600 && pillars < 18; t++) {
      const x = 2 + Math.floor(rand() * (size - 4)), z = 2 + Math.floor(rand() * (size - 4))
      const i = z * size + x
      if (cells[i] !== OPEN || protect.has(i)) continue
      let surrounded = true
      for (let dz = -1; dz <= 1 && surrounded; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        if (cells[(z + dz) * size + x + dx] !== OPEN) { surrounded = false; break }
      }
      if (!surrounded) continue
      if (pillarCells.includes(i)) continue
      pillarCells.push(i); pillars++
    }
    // Divisórias: selar ARESTAS entre células abertas → paredes finas.
    // Crescem em LINHAS RETAS (salas, não ruído). Revert-on-fail no BFS.
    const sealed = new Set()
    const sealList = []
    const trySeal = (a, b) => {
      const k = EDGE_KEY(a, b)
      if (sealed.has(k)) return false
      sealed.add(k)
      const d = bfsDistances(cells, ids, size, spawn0, carvedCells, sealed)
      let okv = d[exit0] !== -1 && (key0 < 0 || d[key0] !== -1)
      if (okv) for (let j = 0; j < cells.length; j++) if (cells[j] === OPEN && d[j] === -1) { okv = false; break }
      if (!okv) { sealed.delete(k); return false }
      sealList.push([a, b])
      return true
    }
    const isOpenPair = (i, j) => cells[i] === OPEN && cells[j] === OPEN
    let seals = 0
    // Representação por linha: { axis:'v', fixed (boundaryX 1..size-1), idx (célula z) }
    //   'v' ⇒ aresta (idx*size + fixed-1, idx*size + fixed) — parede vertical no eixo z
    //   'h' ⇒ aresta (fixed-1)*size+idx, fixed*size+idx      — parede horizontal no eixo x
    const lines = []   // cada { axis, fixed, idx, dir } representa uma ponta de linha a crescer
    const edgeFor = (axis, fixed, idx) =>
      axis === 'v'
        ? [idx * size + fixed - 1, idx * size + fixed]
        : [(fixed - 1) * size + idx, fixed * size + idx]
    const addSealLine = (axis, fixed, idx) => {
      const [a, b] = edgeFor(axis, fixed, idx)
      if (trySeal(a, b)) { seals++; lines.push({ axis, fixed, idx, dir: 1 }); lines.push({ axis, fixed, idx, dir: -1 }); return true }
      return false
    }
    // Fase A — sementes de linha espalhadas
    const seedsList = []
    for (let i = 0; i < cells.length; i++) {
      const z = Math.floor(i / size), x = i % size
      if (cells[i] !== OPEN) continue
      if (x + 1 < size && cells[i + 1] === OPEN) seedsList.push({ axis: 'v', fixed: x + 1, idx: z })
      if (z + 1 < size && cells[i + size] === OPEN) seedsList.push({ axis: 'h', fixed: z + 1, idx: x })
    }
    for (let t = seedsList.length - 1; t > 0; t--) {
      const j = Math.floor(rand() * (t + 1)); const tmp = seedsList[t]; seedsList[t] = seedsList[j]; seedsList[j] = tmp
    }
    for (const sd of seedsList) {
      if (seals >= 6) break
      addSealLine(sd.axis, sd.fixed, sd.idx)
    }
    // Fase B — crescer cada ponta de linha em frente; senão, semente nova
    const canGrow = (axis, fixed, idx) => {
      if (idx < 0 || idx >= size) return false
      const [a, b] = edgeFor(axis, fixed, idx)
      return isOpenPair(a, b) && !sealed.has(EDGE_KEY(a, b))
    }
    let guard = 0
    while (seals < 40 && guard++ < 300) {
      // 70%: esticar uma linha existente; 30%: semente nova
      let grew = false
      if (lines.length) {
        const shuffled = [...lines]
        for (let t = shuffled.length - 1; t > 0; t--) { const j = Math.floor(rand() * (t + 1)); const tmp = shuffled[t]; shuffled[t] = shuffled[j]; shuffled[j] = tmp }
        const dead = new Set()
        for (const L of shuffled) {
          const nIdx = L.idx + L.dir
          if (!canGrow(L.axis, L.fixed, nIdx)) { dead.add(L); continue }
          const [a, b] = edgeFor(L.axis, L.fixed, nIdx)
          if (trySeal(a, b)) { seals++; L.idx = nIdx; grew = true; break }
          dead.add(L)
        }
        if (dead.size) for (let i = lines.length - 1; i >= 0; i--) if (dead.has(lines[i])) lines.splice(i, 1)
      }
      if (grew) continue
      // semente nova
      const sd = seedsList[Math.floor(rand() * seedsList.length)]
      if (sd) addSealLine(sd.axis, sd.fixed, sd.idx)
      else break
    }
    // Recomputar abertura final e BFS definitivo (com as arestas seladas)
    dist = bfsDistances(cells, ids, size, spawn0, carvedCells, sealed)
    let exit = center, maxD = 0
    for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) { maxD = dist[i]; exit = i }
    if (maxD < 14) continue
    // Chave: célula aberta a ~45–65% da distância máxima
    let key = -1
    for (let i = 0; i < dist.length; i++) {
      if (cells[i] === OPEN && dist[i] > maxD * 0.45 && dist[i] < maxD * 0.7) { key = i; break }
    }
    if (key === -1) { for (let i = 0; i < dist.length; i++) if (cells[i] === OPEN && dist[i] < maxD && i !== exit) { key = i; break } }
    const spawn = { x: center % size, z: Math.floor(center / size) }
    const lvl = {
      seed: seed + attempt * 7919, size, cells, ids,
      spawn,
      exit: { x: exit % size, z: Math.floor(exit / size) },
      key: key >= 0 ? { x: key % size, z: Math.floor(key / size) } : null,
      openCount,
      maxDist: maxD,
      carved: carvedCells,
      pillars,
      pillarCells,
      sealedEdges: sealList
    }
    const v = validateLevel(lvl)
    if (v.ok) return lvl
  }
  return null // fallback — o caller deve usar seed conhecido
}

const EDGE_KEY = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a)

function bfsDistances(cells, ids, size, from, carved, sealed) {
  const dist = new Int16Array(size * size).fill(-1)
  const q = [from]; dist[from] = 0
  while (q.length) {
    const i = q.shift()
    const cy = Math.floor(i / size), cx = i % size
    for (let d = 0; d < 4; d++) {
      const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
      if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
      const n = ny * size + nx
      if (cells[n] !== OPEN || dist[n] !== -1) continue
      if (sealed && sealed.has(EDGE_KEY(i, n))) continue
      const free = carved && (carved[i] || carved[n])
      if (!free && MODULES[ids[i]] && MODULES[ids[n]]) {
        if (MODULES[ids[i]].ports[d] !== 1 || MODULES[ids[n]].ports[(d + 2) % 4] !== 1) continue
      }
      dist[n] = dist[i] + 1; q.push(n)
    }
  }
  return dist
}

// Validador de nível — falha ⇒ nível rejeitado
// Caminho spawn→saída (BFS com parent tracking) — para posicionar a porta NO percurso
export function findPath(lvl) {
  const { cells, size, ids, carved, spawn, exit } = lvl
  const si = spawn.z * size + spawn.x, ei = exit.z * size + exit.x
  const sealed = lvl.sealedEdges ? new Set(lvl.sealedEdges.map(([a, b]) => EDGE_KEY(a, b))) : undefined
  const parent = new Int32Array(size * size).fill(-1)
  const dist = new Int16Array(size * size).fill(-1)
  dist[si] = 0
  const q = [si]
  while (q.length) {
    const i = q.shift()
    const cy = Math.floor(i / size), cx = i % size
    for (let d = 0; d < 4; d++) {
      const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
      if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
      const n = ny * size + nx
      if (cells[n] !== OPEN || dist[n] !== -1) continue
      if (sealed && sealed.has(EDGE_KEY(i, n))) continue
      const free = carved && (carved[i] || carved[n])
      if (!free && MODULES[ids[i]] && MODULES[ids[n]]) {
        if (MODULES[ids[i]].ports[d] !== 1 || MODULES[ids[n]].ports[(d + 2) % 4] !== 1) continue
      }
      dist[n] = dist[i] + 1
      parent[n] = i
      q.push(n)
    }
  }
  if (dist[ei] === -1) return null
  const path = [ei]
  let cur = ei
  while (cur !== si) { cur = parent[cur]; path.push(cur) }
  return path.reverse()
}

export function validateLevel(lvl) {
  const errors = []
  const { cells, size, ids, spawn, exit, key, carved } = lvl
  const si = spawn.z * size + spawn.x, ei = exit.z * size + exit.x
  if (cells[si] !== OPEN) errors.push('spawn em parede')
  if (cells[ei] !== OPEN) errors.push('saída em parede')
  const sealed = lvl.sealedEdges ? new Set(lvl.sealedEdges.map(([a, b]) => EDGE_KEY(a, b))) : undefined
  const dist = bfsDistances(cells, ids, size, si, carved, sealed)
  if (dist[ei] === -1) errors.push('saída inalcançável a partir do spawn')
  if (key) {
    const ki = key.z * size + key.x
    if (cells[ki] !== OPEN) errors.push('chave em parede')
    else if (dist[ki] === -1) errors.push('chave inalcançável')
  }
  // Sem células abertas isoladas (toda célula aberta deve ser alcançável)
  for (let i = 0; i < cells.length; i++) if (cells[i] === OPEN && dist[i] === -1) { errors.push('célula isolada'); break }
  return { ok: errors.length === 0, errors }
}
