// NSAMBO · rig-align — editor de articulações 3D sobre modelo GLB
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SCHEMA_VERSION, JOINTS, CONNECTIONS, JOINT_MAP, MODELS, defaultPoints } from './joints.js'
import { createStalkerAnimator } from './animated-stalker.js'
import { loadGLB } from '../backrooms/engine/gltf.js'
import { analyzeWeights, normalizeWeights, validateAnchors, JOINT_NAMES } from '../backrooms/game/stalker-anchors.mjs'
import { inspectGLB, renderInspectorReport } from './glb-inspect.js'
import { initSkeletonBuilder } from './skeleton-builder.js'

const $ = (s) => document.querySelector(s)
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// ─────────────────────────── estado ───────────────────────────
const state = {
  tab: 'tab-3d',
  modelName: 'stalker',
  points: defaultPoints(),
  selected: 'B',
  snapMesh: false,
  showBones: true,
  showMesh: true,
  sphereSize: 0.034,
}

const draftKey = () => `rig-align:${state.modelName}`
function saveDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify({ points: state.points })) } catch {}
  // o preview escuta este evento e reconstrói o esqueleto animado em tempo real
  try { window.dispatchEvent(new CustomEvent('rig-align:anchors-changed')) } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) ?? 'null')
    if (d?.points) for (const id of Object.keys(state.points)) if (d.points[id]) state.points[id] = { ...state.points[id], ...d.points[id] }
  } catch {}
}

// ─────────────────────────── JSON ───────────────────────────
function buildJSON() {
  const out = {
    schema: SCHEMA_VERSION,
    name: state.modelName,
    mode: '3d',
    image: null,
    convention: 'nx: 0=esquerda..1=direita · ny: 0=topo..1=baixo (imagem) · nz: profundidade normalizada (só 3D)',
    points: {},
    connections: CONNECTIONS,
    updatedAt: new Date().toISOString(),
  }
  for (const j of JOINTS) {
    const p = state.points[j.id]
    const wp = anchorToModel(p)
    out.points[j.id] = {
      label: j.label, side: j.side, color: j.color,
      nx: +p.nx.toFixed(5), ny: +p.ny.toFixed(5), nz: +p.nz.toFixed(5),
      model: { x: +wp.x.toFixed(4), y: +wp.y.toFixed(4), z: +wp.z.toFixed(4) },
    }
  }
  return out
}
const jsonString = () => JSON.stringify(buildJSON(), null, 2)

function refreshJsonPreview() {
  const el = $('#json-preview')
  el.textContent = jsonString()
}
function copyJSON() {
  const text = jsonString()
  const done = () => setStatus('copiado ✓')
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
  else fallbackCopy(text, done)
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea')
  ta.value = text; document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy'); done() } catch { setStatus('falhou a cópia', true) }
  ta.remove()
}
function downloadJSON() {
  const blob = new Blob([jsonString()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${state.modelName || 'rig-anchors'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  setStatus('ficheiro exportado ✓')
}
async function saveToWorkspace() {
  const data = buildJSON()
  setStatus('a guardar…')
  try {
    const res = await fetch('/__rig/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: state.modelName, data }),
    })
    const out = await res.json()
    if (!res.ok || !out.ok) throw new Error(out.error || `HTTP ${res.status}`)
    setStatus(`guardado em ${out.path} ✓`)
  } catch (err) {
    setStatus(`erro ao guardar: ${err.message}`, true)
  }
}
function setStatus(msg, isErr = false) {
  const el = $('#save-status')
  el.textContent = msg
  el.classList.toggle('err', !!isErr)
  clearTimeout(setStatus._t)
  setStatus._t = setTimeout(() => { el.textContent = '' }, 5000)
}

// ═══════════════════════ listas laterais ═══════════════════════
function buildList(containerSel) {
  const box = $(containerSel)
  box.innerHTML = ''
  for (const j of JOINTS) {
    const row = document.createElement('div')
    row.className = 'joint-row'
    row.dataset.id = j.id
    row.style.setProperty('--jc', j.color)
    row.innerHTML = `
      <div class="joint-chip">${j.id}</div>
      <div class="joint-name">${j.label}${j.side ? ` <span class="mini">(${j.side === 'D' ? 'direito' : 'esquerdo'})</span>` : ''}</div>
      <label class="joint-field">x<input type="number" step="0.005" data-axis="x" /></label>
      <label class="joint-field">y<input type="number" step="0.005" data-axis="y" /></label>
      <label class="joint-field">z<input type="number" step="0.005" data-axis="z" /></label>
    `
    row.addEventListener('click', () => { state.selected = j.id; syncAll() })
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('focus', () => { state.selected = j.id; syncAll() })
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value)
        if (!Number.isFinite(v)) return
        const p = state.points[j.id]
        const wp = anchorToModel(p)
        wp[inp.dataset.axis] = v
        state.points[j.id] = modelToAnchor(wp)
        refresh3D(); refreshJsonPreview(); saveDraft()
      })
      inp.addEventListener('click', (e) => e.stopPropagation())
    })
    box.appendChild(row)
  }
}

function syncListInputs() {
  document.querySelectorAll('#joint-list-3d .joint-row').forEach((row) => {
    const id = row.dataset.id
    const wp = anchorToModel(state.points[id])
    row.classList.toggle('selected', id === state.selected)
    const x = row.querySelector('[data-axis="x"]'), y = row.querySelector('[data-axis="y"]'), z = row.querySelector('[data-axis="z"]')
    if (x) { x.value = wp.x.toFixed(3); y.value = wp.y.toFixed(3); z.value = wp.z.toFixed(3) }
  })
}
function syncAll() {
  refresh3D(); refreshJsonPreview(); syncListInputs(); saveDraft()
}

// ═══════════════════════ 3D — three.js ═══════════════════════
const cv3 = $('#cv-3d')
const renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050403)
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
camera.position.set(1.6, 1.4, 2.2)
const controls = new OrbitControls(camera, cv3)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.screenSpacePanning = true        // pan intuitivo (o alvo voa com o ecrã, não com o chão)
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
controls.minDistance = 0.35
controls.maxDistance = 6

scene.add(new THREE.HemisphereLight(0xffe6b8, 0x1a1410, 1.15))
const key = new THREE.DirectionalLight(0xfff2dd, 1.6); key.position.set(2, 3, 2.4); scene.add(key)
const fill = new THREE.DirectionalLight(0x88aaff, 0.5); fill.position.set(-2.4, 1.2, -1.8); scene.add(fill)
const grid = new THREE.GridHelper(6, 24, 0x3a2f24, 0x1d1813)
scene.add(grid)

const anchorGroup = new THREE.Group()
scene.add(anchorGroup)
const boneGroup = new THREE.Group()
scene.add(boneGroup)
let modelRoot = null, modelBox = null, sphereMeshes = new Map()

// mapeia nx/ny/nz (normalizado) ↔ coordenadas do modelo
function anchorToModel(p) {
  if (!modelBox) {
    return { x: (p.nx - 0.5) * 2, y: (0.5 - p.ny) * 2, z: p.nz }
  }
  const c = modelBox.getCenter(new THREE.Vector3())
  const size = modelBox.getSize(new THREE.Vector3())
  return {
    x: modelBox.min.x + p.nx * size.x,
    y: modelBox.max.y - p.ny * size.y,
    z: c.z + p.nz * size.z * 0.5,
  }
}
function modelToAnchor(wp) {
  if (!modelBox) {
    return { nx: clamp01(wp.x / 2 + 0.5), ny: clamp01(0.5 - wp.y / 2), nz: wp.z }
  }
  const c = modelBox.getCenter(new THREE.Vector3())
  const size = modelBox.getSize(new THREE.Vector3())
  return {
    nx: clamp01((wp.x - modelBox.min.x) / (size.x || 1e-6)),
    ny: clamp01((modelBox.max.y - wp.y) / (size.y || 1e-6)),
    nz: size.z > 1e-6 ? ((wp.z - c.z) / (size.z * 0.5)) : 0,
  }
}

function makeLabel(text) {
  const c = document.createElement('canvas')
  c.width = 96; c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 96, 96)
  g.font = '800 44px ui-monospace, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.lineWidth = 7; g.strokeStyle = 'rgba(5,4,3,0.9)'; g.strokeText(text, 48, 52)
  g.fillStyle = '#ffffff'; g.fillText(text, 48, 52)
  const tex = new THREE.CanvasTexture(c)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  const sp = new THREE.Sprite(mat)
  sp.scale.setScalar(0.16)
  return sp
}

function rebuildAnchors() {
  for (const m of sphereMeshes.values()) { anchorGroup.remove(m.sphere); anchorGroup.remove(m.label) }
  sphereMeshes.clear()
  while (boneGroup.children.length) boneGroup.remove(boneGroup.children[0])

  for (const j of JOINTS) {
    const wp = anchorToModel(state.points[j.id])
    const geo = new THREE.SphereGeometry(state.sphereSize, 20, 14)
    const mat = new THREE.MeshStandardMaterial({ color: j.color, emissive: j.color, emissiveIntensity: 0.55, roughness: 0.35 })
    const sphere = new THREE.Mesh(geo, mat)
    sphere.position.set(wp.x, wp.y, wp.z)
    sphere.userData.id = j.id
    const label = makeLabel(j.id)
    label.position.set(wp.x, wp.y, wp.z)
    anchorGroup.add(sphere); anchorGroup.add(label)
    sphereMeshes.set(j.id, { sphere, label })
  }
  if (state.showBones) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffd894, transparent: true, opacity: 0.5 })
    for (const [a, b] of CONNECTIONS) {
      const pa = sphereMeshes.get(a).sphere.position, pb = sphereMeshes.get(b).sphere.position
      const geo = new THREE.BufferGeometry().setFromPoints([pa, pb])
      boneGroup.add(new THREE.Line(geo, mat))
    }
  }
  markSelected3D()
}
function markSelected3D() {
  for (const [id, { sphere }] of sphereMeshes) {
    sphere.material.emissiveIntensity = id === state.selected ? 1.35 : 0.55
    sphere.scale.setScalar(id === state.selected ? 1.32 : 1)
  }
}
function refresh3D() {
  // reposiciona esferas sem recriar geometria
  for (const j of JOINTS) {
    const entry = sphereMeshes.get(j.id)
    if (!entry) continue
    const wp = anchorToModel(state.points[j.id])
    entry.sphere.position.set(wp.x, wp.y, wp.z)
    entry.label.position.set(wp.x, wp.y, wp.z)
  }
  // refaz linhas
  while (boneGroup.children.length) boneGroup.remove(boneGroup.children[0])
  if (state.showBones) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffd894, transparent: true, opacity: 0.5 })
    for (const [a, b] of CONNECTIONS) {
      const pa = sphereMeshes.get(a)?.sphere.position, pb = sphereMeshes.get(b)?.sphere.position
      if (!pa || !pb) continue
      boneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa, pb]), mat))
    }
  }
  markSelected3D()
}

const loader = new GLTFLoader()
function loadModel(url, nameForStatus) {
  $('#model-info').textContent = `a carregar ${nameForStatus}…`
  if (modelRoot) { scene.remove(modelRoot); modelRoot = null }
  loader.load(url, (gltf) => {
    modelRoot = gltf.scene
    scene.add(modelRoot)
    modelRoot.visible = state.showMesh
    modelBox = new THREE.Box3().setFromObject(modelRoot)
    const size = modelBox.getSize(new THREE.Vector3())
    const center = modelBox.getCenter(new THREE.Vector3())
    frameModel()
    grid.position.y = modelBox.min.y - 0.001
    $('#model-info').textContent = `${nameForStatus} — bbox ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`
    rebuildAnchors()
    syncListInputs(); refreshJsonPreview()
    scheduleAnalysis(120)
  }, undefined, (err) => {
    $('#model-info').textContent = `falha ao carregar ${nameForStatus}: ${err?.message ?? 'erro desconhecido'}`
  })
}

// enquadra o modelo inteiro na câmara (usado no load e no botão Recentrar)
function frameModel(dir = null) {
  if (!modelBox) return
  const size = modelBox.getSize(new THREE.Vector3())
  const center = modelBox.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z) || 1
  const d = dir ?? new THREE.Vector3(1.15, 0.35, 1.55).normalize()
  camera.position.set(center.x + d.x * radius * 1.9, center.y + d.y * radius * 1.9, center.z + d.z * radius * 1.9)
  camera.near = Math.max(0.01, radius / 100); camera.far = radius * 100; camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

// seleção/arraste de esferas
// animação do modelo GLB — ÚNICO esqueleto: o derivado exclusivamente das âncoras do utilizador
let animator = null, animating = false
const animClock = new THREE.Clock()
let anchorDebounce = 0
// converte o THREE.Box3 do editor para o formato plano {min,max,center,size} que o construtor partilhado usa
const plainBoxFromThree = (box) => {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  }
}
const isStalkerModel = () => ($('#model-select').value || 'stalker') === 'stalker'
function setAnimUI(on) {
  const btn = $('#btn-anim')
  btn.textContent = on ? '⏸ PARAR ANIMAÇÃO' : '▶ ANIMAÇÃO'
  btn.classList.toggle('on', on)
  $('#snap-mesh').disabled = on
  if (on) $('#snap-mesh').checked = (state.snapMesh = false)
}
async function startAnim() {
  const btn = $('#btn-anim')
  btn.disabled = true
  btn.textContent = 'a carregar…'
  setWeightView(false)   // pesos e animação não coexistem no ecrã
  try {
    animator = await createStalkerAnimator({
      scene,
      getAnchors: () => state.points,
      onStats: (() => {
        let tick = 0
        return ({ mean, over }) => {
          if (++tick % 20 !== 0) return
          $('#model-info').textContent = `ANIMAÇÃO — esqueleto = só as tuas âncoras · def. média ${mean.toFixed(1)} cm · ${over} verts >12 cm`
        }
      })(),
    })
    animating = true
    if (modelRoot) modelRoot.visible = false
    setAnimUI(true)
  } catch (e) {
    setStatus('falha ao iniciar ANIMAÇÃO: ' + (e?.message ?? e), true)
    btn.disabled = false
    btn.textContent = '▶ ANIMAÇÃO'
  }
}
function stopAnim() {
  animating = false
  if (animator) { animator.dispose(); animator = null }
  if (modelRoot) modelRoot.visible = state.showMesh
  setAnimUI(false)
  $('#model-info').textContent = 'animação parada — malha estática de volta'
}
// ── Inspetor GLB (read-only) ──
$('#btn-inspect').addEventListener('click', async () => {
  const report = $('#glb-report')
  const btn = $('#btn-inspect')
  const m = MODELS.find(x => x.id === ($('#model-select').value || 'stalker'))
  if (!m) return
  btn.disabled = true
  btn.textContent = 'a inspecionar…'
  report.hidden = false
  report.textContent = 'a ler ' + m.url + '…'
  try {
    const r = await inspectGLB(m.url)
    report.innerHTML = renderInspectorReport(r)
  } catch (err) {
    report.innerHTML = `<div class="anal-err">falha na inspeção: ${String(err?.message ?? err)}</div>`
  } finally {
    btn.disabled = false
    btn.textContent = '⌘ Inspecionar GLB'
  }
})

$('#btn-anim').addEventListener('click', () => {
  if (!isStalkerModel()) { setStatus('a ANIMAÇÃO existe só para o Stalker (stalker.glb)', true); return }
  if (animating) { stopAnim(); return }
  startAnim().finally(() => { $('#btn-anim').disabled = false })
})
// rebuild em tempo real quando o utilizador edita as âncoras durante a animação
window.addEventListener('rig-align:anchors-changed', () => {
  scheduleAnalysis(250)
  if (!animating || !animator) return
  clearTimeout(anchorDebounce)
  anchorDebounce = setTimeout(() => { try { animator?.applyAnchors() } catch (e) { setStatus('âncoras: ' + (e?.message ?? e), true) } }, 160)
})

const raycaster = new THREE.Raycaster()
const pointerNDC = new THREE.Vector2()
let dragSphere = null
const dragPlane = new THREE.Plane()
const dragOffset = new THREE.Vector3()
function setPointer(ev) {
  const r = cv3.getBoundingClientRect()
  pointerNDC.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
}
cv3.addEventListener('pointerdown', (ev) => {
  setPointer(ev)
  raycaster.setFromCamera(pointerNDC, camera)
  const hits = raycaster.intersectObjects([...sphereMeshes.values()].map(e => e.sphere), false)
  if (hits.length) {
    dragSphere = hits[0].object
    state.selected = dragSphere.userData.id
    controls.enabled = false
    cv3.setPointerCapture(ev.pointerId)
    // plano perpendicular à câmara passando pela esfera
    const n = new THREE.Vector3(); camera.getWorldDirection(n)
    dragPlane.setFromNormalAndCoplanarPoint(n, dragSphere.position)
    const hitP = new THREE.Vector3(); raycaster.ray.intersectPlane(dragPlane, hitP)
    dragOffset.copy(dragSphere.position).sub(hitP)
    syncAll()
  }
})
cv3.addEventListener('pointermove', (ev) => {
  setPointer(ev)
  raycaster.setFromCamera(pointerNDC, camera)
  if (dragSphere) {
    const id = dragSphere.userData.id
    let wp = null
    if (state.snapMesh && !animating && modelRoot) {
      const hits = raycaster.intersectObject(modelRoot, true)
      if (hits.length) wp = hits[0].point.clone()
    }
    if (!wp) {
      const hitP = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(dragPlane, hitP)) wp = hitP.add(dragOffset)
    }
    if (wp) {
      state.points[id] = modelToAnchor(wp)
      refresh3D(); syncListInputs(); refreshJsonPreview(); saveDraft()
    }
    return
  }
  // hover cursor
  const hits = raycaster.intersectObjects([...sphereMeshes.values()].map(e => e.sphere), false)
  cv3.style.cursor = hits.length ? 'grab' : 'default'
})
const endDrag = () => { dragSphere = null; controls.enabled = true }
cv3.addEventListener('pointerup', endDrag)
cv3.addEventListener('pointercancel', endDrag)

$('#model-select').innerHTML = MODELS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
$('#model-select').addEventListener('change', (ev) => {
  const m = MODELS.find(m => m.id === ev.target.value)
  if (animating) stopAnim()
  setWeightView(false)
  $('#model-name').value = state.modelName = m.id === 'stalker' ? 'stalker' : m.id
  loadDraft()
  loadModel(m.url, m.name)
  buildList('#joint-list-3d')
  syncListInputs(); refreshJsonPreview()
})
$('#snap-mesh').addEventListener('change', (ev) => { state.snapMesh = ev.target.checked })
$('#show-bones').addEventListener('change', (ev) => { state.showBones = ev.target.checked; refresh3D() })
$('#show-mesh').addEventListener('change', (ev) => { state.showMesh = ev.target.checked; if (animator) animator.mesh.visible = state.showMesh; if (modelRoot) modelRoot.visible = !animating && state.showMesh })
$('#sphere-size').addEventListener('input', (ev) => { state.sphereSize = parseFloat(ev.target.value); rebuildAnchors(); refresh3D() })

function resize3D() {
  const wrap = cv3.parentElement.getBoundingClientRect()
  renderer.setSize(Math.max(2, wrap.width), Math.max(2, wrap.height), false)
  camera.aspect = wrap.width / Math.max(1, wrap.height)
  camera.updateProjectionMatrix()
}

// render loop
function tick() {
  requestAnimationFrame(tick)
  const dt = Math.min(0.05, animClock.getDelta() || 0.016)
  if (animating && animator) animator.update(dt)
  controls.update()
  renderer.render(scene, camera)
}

// ═══════════════════════ legenda ═══════════════════════
function buildLegend() {
  const grid = $('#legend-grid')
  grid.innerHTML = JOINTS.map(j => `
    <div class="legend-item" style="--jc:${j.color}">
      <div class="joint-chip" style="background:${j.color}">${j.id}</div>
      <div><strong>${j.id}</strong> · ${j.label}${j.side ? ` <span class="mini">(${j.side === 'D' ? 'direito' : 'esquerdo'})</span>` : ''}<br><span class="mini">${j.color}</span></div>
    </div>`).join('')
  $('#legend-connections').innerHTML = CONNECTIONS.map(([a, b]) => `<span class="conn-pill">${a}→${b}</span>`).join('')
  $('#schema-example').textContent = JSON.stringify({
    schema: SCHEMA_VERSION, name: 'stalker', mode: '3d', image: null,
    points: { A: { label: 'Queixo', side: null, color: '#ffd60a', nx: 0.5, ny: 0.115, nz: 0, model: { x: 0, y: 0, z: 0 } }, '…': '…' },
    connections: CONNECTIONS, updatedAt: '…',
  }, null, 2)
}

// ═══════════════════════ navegação 3D (overlay) ═══════════════════════
const setView = (dir) => frameModel(new THREE.Vector3(...dir).normalize())
$('#view-reset')?.addEventListener('click', () => frameModel())
$('#view-front')?.addEventListener('click', () => setView([0, 0.08, 1]))
$('#view-side')?.addEventListener('click', () => setView([1, 0.08, 0]))
$('#view-top')?.addEventListener('click', () => setView([0.0001, 1, 0.0001]))
// atalhos de teclado: 1 frente · 3 lado · 7 cima · 0 recentrar (estilo DCC)
window.addEventListener('keydown', (ev) => {
  if (ev.target?.matches?.('input, select, textarea')) return
  if (ev.key === '1') setView([0, 0.08, 1])
  else if (ev.key === '3') setView([1, 0.08, 0])
  else if (ev.key === '7') setView([0.0001, 1, 0.0001])
  else if (ev.key === '0') frameModel()
})

// rodapé JSON recolhível — ganha espaço vertical no ecrã
$('#json-toggle')?.addEventListener('click', () => {
  const bar = $('#statusbar')
  bar.classList.toggle('collapsed')
  $('#json-toggle').textContent = bar.classList.contains('collapsed') ? 'JSON ▸' : 'JSON ▾'
})

// ═══════════════════════ tabs ═══════════════════════
document.querySelectorAll('#tabs button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    state.tab = btn.dataset.tab
    document.querySelectorAll('#tabs button[data-tab]').forEach(b => b.classList.toggle('active', b === btn))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === state.tab))
    if (state.tab === 'tab-3d') resize3D()
    refreshJsonPreview()
  })
})

// ═══════════════════════ header ═══════════════════════
$('#model-name').addEventListener('input', (ev) => {
  state.modelName = ev.target.value.trim() || 'stalker'
  saveDraft()
})
// aplica um JSON de âncoras carregado (do disco ou do workspace) ao editor 3D
function applyAnchorData(d) {
  if (!d || d.schema !== 'nsambo-rig-align@1' || !d.points || typeof d.points !== 'object') {
    setStatus('ficheiro inválido — não é um nsambo-rig-align@1', true)
    return false
  }
  const known = new Set(JOINTS.map(j => j.id))
  let applied = 0
  for (const id of known) {
    const p = d.points[id]
    if (!p) continue
    const nx = Number(p.nx), ny = Number(p.ny), nz = Number(p.nz)
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
      state.points[id] = { nx: clamp01(nx), ny: clamp01(ny), nz: Math.max(-2, Math.min(2, nz)) }
      applied++
    }
  }
  if (applied === 0) { setStatus('o ficheiro não traz pontos A…I2 válidos', true); return false }
  if (d.name && typeof d.name === 'string' && d.name.trim()) state.modelName = d.name.trim()
  const missing = JOINTS.filter(j => !d.points[j.id]).map(j => j.id)
  loadDraftFromPoints()
  syncAll()
  setStatus(`âncoras carregadas ✓ (${applied} pontos)${missing.length ? ` — faltam ${missing.join(', ')} (novos, com valores sintéticos — posiciona-os)` : ''}`)
  scheduleAnalysis(150)
  return true
}
function loadDraftFromPoints() {
  try { localStorage.setItem(draftKey(), JSON.stringify({ points: state.points })) } catch {}
  window.dispatchEvent(new CustomEvent('rig-align:anchors-changed'))
}
$('#btn-load').addEventListener('click', async () => {
  // carregar substitui o trabalho atual (o draft local é sobrescrito) — confirma antes
  if (!window.confirm('Carregar substitui as âncoras atuais. O que tens por guardar no 💾 perde-se. Continuar?')) return
  // 1) tenta o workspace (rig-data/<nome>.json via middleware do vite)
  try {
    const res = await fetch('/__rig/load?name=' + encodeURIComponent(state.modelName), { cache: 'no-store' })
    if (res.ok) { applyAnchorData(await res.json()); return }
  } catch {}
  // 2) fallback sempre-funciona: seletor de ficheiro
  $('#load-file').click()
})
$('#load-file').addEventListener('change', (ev) => {
  const f = ev.target.files?.[0]; if (!f) return
  const fr = new FileReader()
  fr.onload = () => { try { applyAnchorData(JSON.parse(String(fr.result))) } catch (e) { setStatus('JSON inválido: ' + e.message, true) } ev.target.value = '' }
  fr.readAsText(f)
})
$('#btn-save').addEventListener('click', saveToWorkspace)
$('#btn-copy').addEventListener('click', copyJSON)
$('#btn-download').addEventListener('click', downloadJSON)


// ═══════════════════════ análise do rig + vista de pesos ═══════════════════════
let weightMesh = null, weightViewOn = false
const weightBoneSel = $('#weight-bone')
if (weightBoneSel) weightBoneSel.innerHTML = JOINT_NAMES.map((n, i) => `<option value="${i}">${i} · ${n}</option>`).join('')
let rigPartsCache = null
const loadRigParts = () => {
  if (!rigPartsCache) {
    rigPartsCache = fetch('/models/stalker.rig.json', { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error('stalker.rig.json HTTP ' + r.status)
      const json = await r.json()
      const dec = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      return { json, wIdx: dec(json.w4), wVal: dec(json.v4) }
    })
  }
  return rigPartsCache
}
const row = (sev, key, val) => {
  const cls = sev === 'ok' ? 'anal-ok' : (sev === 'err' ? 'anal-err' : 'anal-warn')
  const mark = sev === 'ok' ? '✓' : '⚠'
  return `<div class="anal-row"><span class="${cls}">${mark}</span><span class="anal-key">${key}</span><span>${val}</span></div>`
}
let analysisTimer = 0
async function runAnalysis() {
  const box = $('#analysis-report')
  if (!box) return
  if (!isStalkerModel()) { box.innerHTML = '<div class="anal-row"><span class="anal-warn">⚠</span><span>a análise existe só para o Stalker</span></div>'; return }
  box.innerHTML = '<div class="anal-row"><span class="anal-warn">…</span><span>a medir pesos e segmentos…</span></div>'
  const lines = []
  try {
    const { json } = await loadRigParts()
    const w = analyzeWeights(json)
    lines.push(row(w.zero === 0 ? 'ok' : 'err', 'vértices sem influência', w.zero === 0 ? '0 — todos têm peso' : `${w.zero} vértices`))
    lines.push(row(w.off255 === 0 ? 'ok' : 'warn', 'pesos normalizados', w.off255 === 0 ? `soma=255 em todos os ${w.vcount}` : `${w.off255} verts ≠255 (min ${w.minSum} · máx ${w.maxSum})`))
    lines.push(row(w.invalidRefs === 0 ? 'ok' : 'err', 'índices de junta', w.invalidRefs === 0 ? '0 inválidos (0..20)' : `${w.invalidRefs} referências`))
    lines.push(row(w.armLeg / w.vcount < 0.05 ? 'ok' : 'warn', 'cruzados braço↔perna', `${w.armLeg} verts (${(100 * w.armLeg / w.vcount).toFixed(1)}%) — banda mão/coxa`))
    lines.push(row(w.headDom / w.vcount < 0.15 ? 'ok' : 'warn', 'cabeça dominante', `${w.headDom} verts (${(100 * w.headDom / w.vcount).toFixed(1)}%) — o reskin deu cabeça a 1/3 do corpo`))
    lines.push(row(w.neckDom > 0 ? 'ok' : 'warn', 'pescoço com pele própria', w.neckDom > 0 ? `${w.neckDom} verts dominantes` : '0 — o pescoço foi absorvido pela cabeça no reskin'))
  } catch (e) {
    lines.push(row('err', 'stalker.rig.json', String(e?.message ?? e)))
  }
  try {
    const problems = modelBox
      ? validateAnchors(state.points, plainBoxFromThree(modelBox))
      : ['modelo ainda não carregou']
    if (problems.length) for (const p of problems) lines.push(row('err', 'âncoras', p))
    else lines.push(row('ok', 'segmentos', 'todas as ligações ≥ 2 cm'))
  } catch (e) {
    lines.push(row('err', 'âncoras', String(e?.message ?? e)))
  }
  box.innerHTML = lines.join('')
}
const scheduleAnalysis = (ms = 250) => { clearTimeout(analysisTimer); analysisTimer = setTimeout(() => { runAnalysis().catch(() => {}) }, ms) }

// ramp 5-paragens (preto→azul→verde→amarelo→vermelho) para a vista de pesos
const blenderRamp = (t) => {
  const stops = [[0.0, [5, 6, 10]], [0.25, [0, 0, 200]], [0.5, [0, 200, 0]], [0.75, [255, 240, 0]], [1.0, [255, 0, 0]]]
  const x = Math.min(1, Math.max(0, t))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      const k = (x - t0) / (t1 - t0)
      return [0, 1, 2].map(c => (c0[c] + (c1[c] - c0[c]) * k) / 255)
    }
  }
  return [1, 0, 0]
}
const hideBodyForWeights = () => { if (modelRoot) modelRoot.visible = false; if (animator) animator.mesh.visible = false }
const showBodyAfterWeights = () => { if (animating) { if (animator) animator.mesh.visible = state.showMesh } else if (modelRoot) modelRoot.visible = state.showMesh }
async function setWeightView(on) {
  weightViewOn = !!on
  const btn = $('#btn-weights'), legend = $('#weight-legend')
  legend.hidden = !weightViewOn
  if (!on) {
    if (weightMesh) weightMesh.visible = false
    showBodyAfterWeights()
    btn.textContent = 'Ver pesos'
    return
  }
  if (animating) { setStatus('para a ANIMAÇÃO antes de ver os pesos', true); legend.hidden = true; weightViewOn = false; return }
  if (!isStalkerModel()) { setStatus('a vista de pesos existe só para o Stalker', true); legend.hidden = true; weightViewOn = false; return }
  btn.disabled = true
  try {
    if (!weightMesh) {
      const glbData = await loadGLB('/models/stalker.glb')
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(glbData.positions), 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(glbData.normals), 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(glbData.uvs), 2))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(glbData.verts * 3), 3).setUsage(THREE.DynamicDrawUsage))
      const idx = glbData.indices instanceof Uint32Array ? glbData.indices : new Uint32Array(glbData.indices)
      geometry.setIndex(new THREE.BufferAttribute(idx, 1))
      weightMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }))
      weightMesh.frustumCulled = false
      scene.add(weightMesh)
    }
    hideBodyForWeights()
    weightMesh.visible = true
    await paintWeights(parseInt(weightBoneSel.value, 10))
    btn.textContent = '✕ Pesos'
  } catch (e) {
    setStatus('vista de pesos falhou: ' + (e?.message ?? e), true)
    weightViewOn = false
  } finally {
    btn.disabled = false
  }
}
async function paintWeights(jointIdx) {
  if (!weightMesh) return
  const { wIdx, wVal, json } = await loadRigParts()
  const attr = weightMesh.geometry.getAttribute('color')
  for (let v = 0; v < json.vcount; v++) {
    let w = 0
    for (let k = 0; k < 4; k++) if (wIdx[v * 4 + k] === jointIdx) w += wVal[v * 4 + k]
    const [r, g, b] = blenderRamp(w / 255)
    attr.setXYZ(v, r, g, b)
  }
  attr.needsUpdate = true
}
$('#btn-weights')?.addEventListener('click', () => { setWeightView(!weightViewOn) })
weightBoneSel?.addEventListener('change', () => { if (weightViewOn) paintWeights(parseInt(weightBoneSel.value, 10)).catch(() => {}) })
// ── Exportar GLB skinned (âncoras correntes) ──
$('#btn-export-glb')?.addEventListener('click', async () => {
  const btn = $('#btn-export-glb')
  btn.disabled = true
  const prev = btn.textContent
  btn.textContent = 'a exportar…'
  try {
    const r = await fetch('/__rig/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points: state.points, normalize: true }),
    })
    if (!r.ok) {
      let msg = 'HTTP ' + r.status
      try { const j = await r.json(); msg = j.error ?? msg } catch {}
      throw new Error(msg)
    }
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'stalker.skinned.glb'
    a.click()
    URL.revokeObjectURL(a.href)
    btn.textContent = '✓ exportado'
    setTimeout(() => { btn.textContent = prev; btn.disabled = false }, 2000)
  } catch (err) {
    btn.textContent = prev
    btn.disabled = false
    setStatus('exportação falhou: ' + String(err?.message ?? err), true)
  }
})

$('#btn-recheck')?.addEventListener('click', () => { loadRigParts().then(() => runAnalysis()).catch(() => {}) })
$('#btn-normalize')?.addEventListener('click', async () => {
  try {
    const { json } = await loadRigParts()
    const out = normalizeWeights(json)
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'stalker.weights-normalized.json'
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus(`normalização: ${out.normalized} vértices corrigidos para soma=255 — descarregado (o jogo NÃO foi alterado; para aplicar, faz backup de assets/models/stalker.rig.json e substitui)`)
  } catch (e) {
    setStatus('normalização falhou: ' + (e?.message ?? e), true)
  }
})

// ═══════════════════════ boot ═══════════════════════
loadDraft()
buildList('#joint-list-3d')
buildLegend()
scheduleAnalysis(600)
window.addEventListener('resize', resize3D)
resize3D(); tick()
// modelo inicial 3D
const initial = MODELS[0]
initSkeletonBuilder({ onStatus: (m, isErr) => setStatus(m, isErr) })
loadModel(initial.url, initial.name)
syncListInputs(); refreshJsonPreview()
