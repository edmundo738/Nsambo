// NSAMBO · rig-align — editor de articulações (2D + 3D)
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SCHEMA_VERSION, JOINTS, CONNECTIONS, JOINT_MAP, MODELS, defaultPoints } from './joints.js'

const $ = (s) => document.querySelector(s)
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// ─────────────────────────── estado ───────────────────────────
const state = {
  tab: 'tab-2d',
  modelName: 'stalker',
  points: defaultPoints(),
  selected: 'B',
  bg: 'grid',              // grid | silhouette | none | image
  image: null,             // HTMLImageElement
  imageSrc: null,          // url ou 'upload:nome'
  imageName: null,         // nome original do ficheiro
  snapMesh: false,
  showBones: true,
  showMesh: true,
  sphereSize: 0.034,
}

const draftKey = () => `rig-align:${state.modelName}`
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify({ points: state.points, bg: state.bg })) } catch {} }
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) ?? 'null')
    if (d?.points) for (const id of Object.keys(state.points)) if (d.points[id]) state.points[id] = { ...state.points[id], ...d.points[id] }
    if (d?.bg) state.bg = d.bg === 'image' ? 'grid' : d.bg
  } catch {}
}

// ─────────────────────────── JSON ───────────────────────────
function buildJSON(mode) {
  const img = state.image
  const out = {
    schema: SCHEMA_VERSION,
    name: state.modelName,
    mode,
    image: mode === '2d'
      ? { src: state.imageSrc, width: img?.naturalWidth ?? null, height: img?.naturalHeight ?? null }
      : null,
    convention: 'nx: 0=esquerda..1=direita · ny: 0=topo..1=baixo (imagem) · nz: profundidade normalizada (só 3D)',
    points: {},
    connections: CONNECTIONS,
    updatedAt: new Date().toISOString(),
  }
  for (const j of JOINTS) {
    const p = state.points[j.id]
    const wp = mode === '3d' ? anchorToModel(p) : null
    out.points[j.id] = {
      label: j.label, side: j.side, color: j.color,
      nx: +p.nx.toFixed(5), ny: +p.ny.toFixed(5), nz: +p.nz.toFixed(5),
      ...(mode === '2d' && img ? { imgX: +(p.nx * img.naturalWidth).toFixed(2), imgY: +(p.ny * img.naturalHeight).toFixed(2) } : {}),
      ...(wp ? { model: { x: +wp.x.toFixed(4), y: +wp.y.toFixed(4), z: +wp.z.toFixed(4) } } : {}),
    }
  }
  return out
}
const jsonString = () => JSON.stringify(buildJSON(state.tab === 'tab-3d' ? '3d' : '2d'), null, 2)

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
  const data = buildJSON(state.tab === 'tab-3d' ? '3d' : '2d')
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

// ═══════════════════════ 2D — canvas ═══════════════════════
const cv = $('#cv-2d')
const ctx = cv.getContext('2d')
let imgRect = { x: 0, y: 0, w: 0, h: 0 }
let hoverId = null
let dragId = null

function resize2D() {
  const wrap = cv.parentElement.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = Math.max(2, Math.round(wrap.width * dpr))
  cv.height = Math.max(2, Math.round(wrap.height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw2D()
}

function computeImgRect(vw, vh) {
  if (!state.image) return { x: 0, y: 0, w: vw, h: vh }
  const iw = state.image.naturalWidth, ih = state.image.naturalHeight
  const s = Math.min(vw / iw, vh / ih)
  const w = iw * s, h = ih * s
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}

function toCanvas(p) { return { x: imgRect.x + p.nx * imgRect.w, y: imgRect.y + p.ny * imgRect.h } }
function fromCanvas(x, y) {
  return { nx: clamp01((x - imgRect.x) / imgRect.w), ny: clamp01((y - imgRect.y) / imgRect.h) }
}

function drawSilhouette(vw, vh) {
  const cx = vw / 2, u = Math.min(vw, vh) / 100
  ctx.save()
  ctx.fillStyle = 'rgba(232, 224, 208, 0.10)'
  ctx.strokeStyle = 'rgba(232, 224, 208, 0.28)'
  ctx.lineWidth = 1.5
  const y = (f) => vh * f
  // silhueta humanoide genérica (proporções médias)
  ctx.beginPath(); ctx.ellipse(cx, y(0.115), 9 * u, 11 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()   // cabeça
  ctx.beginPath(); ctx.ellipse(cx, y(0.245), 24 * u, 6.4 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke() // ombros
  // tronco (trapézio com cintura)
  ctx.beginPath()
  ctx.moveTo(cx - 15 * u, y(0.19))
  ctx.quadraticCurveTo(cx - 17.5 * u, y(0.40), cx - 10.5 * u, y(0.56))
  ctx.lineTo(cx + 10.5 * u, y(0.56))
  ctx.quadraticCurveTo(cx + 17.5 * u, y(0.40), cx + 15 * u, y(0.19))
  ctx.closePath(); ctx.fill(); ctx.stroke()
  // braços
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(cx + s * 30 * u, y(0.40), 5.2 * u, 17 * u, s * -0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(cx + s * 40 * u, y(0.55), 4.6 * u, 15 * u, s * -0.10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  // pernas
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(cx + s * 8 * u, y(0.745), 6.4 * u, 18 * u, s * 0.03, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(cx + s * 9.5 * u, y(0.925), 5.2 * u, 14 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

function drawGrid(vw, vh) {
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255, 216, 148, 0.055)'
  for (let x = 0; x <= vw; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke() }
  for (let y = 0; y <= vh; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke() }
  ctx.strokeStyle = 'rgba(255, 216, 148, 0.14)'
  for (let x = 0; x <= vw; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke() }
  for (let y = 0; y <= vh; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke() }
  // eixos centrais
  ctx.strokeStyle = 'rgba(255, 216, 148, 0.30)'
  ctx.setLineDash([6, 6])
  ctx.beginPath(); ctx.moveTo(vw / 2, 0); ctx.lineTo(vw / 2, vh); ctx.stroke()
  ctx.restore()
}

function draw2D() {
  const vw = cv.clientWidth, vh = cv.clientHeight
  if (!vw || !vh) return
  ctx.clearRect(0, 0, vw, vh)
  // fundo
  ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, vw, vh)
  if (state.bg === 'image' && state.image) {
    imgRect = computeImgRect(vw, vh)
    ctx.fillStyle = '#000'; ctx.fillRect(imgRect.x, imgRect.y, imgRect.w, imgRect.h)
    ctx.drawImage(state.image, imgRect.x, imgRect.y, imgRect.w, imgRect.h)
  } else {
    imgRect = { x: 0, y: 0, w: vw, h: vh }
    if (state.bg === 'grid') drawGrid(vw, vh)
    if (state.bg === 'silhouette') drawSilhouette(vw, vh)
  }
  // moldura da área útil
  ctx.strokeStyle = 'rgba(255, 216, 148, 0.18)'; ctx.lineWidth = 1
  ctx.strokeRect(imgRect.x + 0.5, imgRect.y + 0.5, imgRect.w - 1, imgRect.h - 1)

  const P = Object.fromEntries(Object.entries(state.points).map(([id, p]) => [id, toCanvas(p)]))

  // linhas do esqueleto
  ctx.save()
  ctx.lineWidth = 2.4
  ctx.shadowBlur = 6
  for (const [a, b] of CONNECTIONS) {
    const pa = P[a], pb = P[b]
    ctx.strokeStyle = 'rgba(255, 216, 148, 0.36)'
    ctx.shadowColor = 'rgba(255,216,148,.35)'
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
  }
  ctx.restore()

  // pontos
  for (const j of JOINTS) {
    const p = P[j.id]
    const selected = j.id === state.selected
    const hovered = j.id === hoverId
    ctx.save()
    if (selected) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 16 } else { ctx.shadowColor = j.color; ctx.shadowBlur = hovered ? 12 : 6 }
    ctx.fillStyle = j.color
    ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 12.5 : 9.5, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = selected ? 2.4 : 1.4
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(10,8,5,0.85)'
    ctx.stroke()
    // letra
    ctx.fillStyle = '#0a0805'
    ctx.font = `800 ${j.id.length > 1 ? 9.5 : 11}px ui-monospace, monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(j.id, p.x, p.y + 0.5)
    // etiqueta externa
    ctx.fillStyle = selected ? '#ffd894' : 'rgba(232,224,208,0.75)'
    ctx.font = '10.5px "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${j.id} · ${j.label}`, p.x + 13, p.y - 8)
    ctx.restore()
  }
}

function hitTest(mx, my) {
  let best = null, bestD = 16
  for (const j of JOINTS) {
    const p = toCanvas(state.points[j.id])
    const d = Math.hypot(p.x - mx, p.y - my)
    if (d < bestD) { bestD = d; best = j.id }
  }
  return best
}
const evPos = (ev) => {
  const r = cv.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}
cv.addEventListener('pointerdown', (ev) => {
  const { x, y } = evPos(ev)
  const hit = hitTest(x, y)
  if (hit) { dragId = hit; state.selected = hit; cv.setPointerCapture(ev.pointerId) }
  else state.selected = hit ?? state.selected
  syncAll()
})
cv.addEventListener('pointermove', (ev) => {
  const { x, y } = evPos(ev)
  if (dragId) {
    state.points[dragId] = { ...state.points[dragId], ...fromCanvas(x, y) }
    draw2D(); refreshJsonPreview(); syncListInputs(); saveDraft()
  } else {
    const h = hitTest(x, y)
    if (h !== hoverId) { hoverId = h; cv.style.cursor = h ? 'grab' : 'crosshair'; draw2D() }
  }
})
cv.addEventListener('pointerup', () => { dragId = null })
cv.addEventListener('keydown', (ev) => {
  const step = ev.shiftKey ? 10 : 1
  const p = state.points[state.selected]
  const vw = cv.clientWidth || 1
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key]
  if (!d) return
  ev.preventDefault()
  state.points[state.selected] = { ...p, nx: clamp01(p.nx + d[0] / vw), ny: clamp01(p.ny + d[1] / (cv.clientHeight || 1)) }
  draw2D(); refreshJsonPreview(); syncListInputs(); saveDraft()
})
cv.tabIndex = 0

// fundo
$('#bg-file').addEventListener('change', (ev) => {
  const file = ev.target.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    state.image = img; state.imageSrc = `upload:${file.name}`; state.imageName = file.name; state.bg = 'image'
    $('#bg-info').textContent = `${file.name} — ${img.naturalWidth}×${img.naturalHeight}`
    setBgToggles(); draw2D(); refreshJsonPreview(); saveDraft()
  }
  img.src = url
})
$('#bg-grid').addEventListener('click', () => { state.bg = 'grid'; setBgToggles(); draw2D(); refreshJsonPreview(); saveDraft() })
$('#bg-silhouette').addEventListener('click', () => { state.bg = 'silhouette'; setBgToggles(); draw2D(); refreshJsonPreview(); saveDraft() })
$('#bg-none').addEventListener('click', () => { state.bg = 'none'; setBgToggles(); draw2D(); refreshJsonPreview(); saveDraft() })
function setBgToggles() {
  for (const [id, key] of [['#bg-grid', 'grid'], ['#bg-silhouette', 'silhouette'], ['#bg-none', 'none']]) {
    $(id).classList.toggle('on', state.bg === key)
  }
}
$('#bg-presets').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-preset]')
  if (!btn) return
  const img = new Image()
  img.onload = () => {
    state.image = img; state.imageSrc = btn.dataset.preset; state.imageName = btn.textContent.trim(); state.bg = 'image'
    $('#bg-info').textContent = `${state.imageName} — ${img.naturalWidth}×${img.naturalHeight}`
    setBgToggles(); draw2D(); refreshJsonPreview(); saveDraft()
  }
  img.onerror = () => setStatus('não foi possível carregar o preset', true)
  img.src = btn.dataset.preset
})

// ═══════════════════════ listas laterais ═══════════════════════
function buildList(containerSel, withZ) {
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
      ${withZ
        ? `<label class="joint-field">x<input type="number" step="0.005" data-axis="x" /></label>
           <label class="joint-field">y<input type="number" step="0.005" data-axis="y" /></label>
           <label class="joint-field">z<input type="number" step="0.005" data-axis="z" /></label>`
        : `<label class="joint-field">X<input type="number" step="0.5" data-axis="imgX" /></label>
           <label class="joint-field">Y<input type="number" step="0.5" data-axis="imgY" /></label>`}
    `
    row.addEventListener('click', () => { state.selected = j.id; syncAll() })
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('focus', () => { state.selected = j.id; syncAll() })
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value)
        if (!Number.isFinite(v)) return
        const p = state.points[j.id]
        if (withZ) {
          const wp = anchorToModel(p)
          wp[inp.dataset.axis] = v
          state.points[j.id] = modelToAnchor(wp)
        } else {
          const img = state.image
          if (!img) return
          if (inp.dataset.axis === 'imgX') state.points[j.id] = { ...p, nx: clamp01(v / img.naturalWidth) }
          else state.points[j.id] = { ...p, ny: clamp01(v / img.naturalHeight) }
        }
        draw2D(); refresh3D(); refreshJsonPreview(); saveDraft()
      })
      inp.addEventListener('click', (e) => e.stopPropagation())
    })
    box.appendChild(row)
  }
}

function syncListInputs() {
  // 2D
  document.querySelectorAll('#joint-list .joint-row').forEach((row) => {
    const id = row.dataset.id
    const p = state.points[id]
    row.classList.toggle('selected', id === state.selected)
    const img = state.image
    const xi = row.querySelector('[data-axis="imgX"]'), yi = row.querySelector('[data-axis="imgY"]')
    if (xi && img) xi.value = (p.nx * img.naturalWidth).toFixed(1)
    if (yi && img) yi.value = (p.ny * img.naturalHeight).toFixed(1)
    if (xi && !img) { xi.value = (p.nx * 100).toFixed(2) + '%'; xi.disabled = true } else if (xi) xi.disabled = false
    if (yi && !img) { yi.value = (p.ny * 100).toFixed(2) + '%'; yi.disabled = true } else if (yi) yi.disabled = false
  })
  // 3D
  document.querySelectorAll('#joint-list-3d .joint-row').forEach((row) => {
    const id = row.dataset.id
    const wp = anchorToModel(state.points[id])
    row.classList.toggle('selected', id === state.selected)
    const x = row.querySelector('[data-axis="x"]'), y = row.querySelector('[data-axis="y"]'), z = row.querySelector('[data-axis="z"]')
    if (x) { x.value = wp.x.toFixed(3); y.value = wp.y.toFixed(3); z.value = wp.z.toFixed(3) }
  })
}
function syncAll() {
  draw2D(); refresh3D(); refreshJsonPreview(); syncListInputs(); saveDraft()
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
    controls.target.copy(center)
    const radius = Math.max(size.x, size.y, size.z)
    camera.position.set(center.x + radius * 1.15, center.y + radius * 0.35, center.z + radius * 1.55)
    camera.near = Math.max(0.01, radius / 100); camera.far = radius * 100; camera.updateProjectionMatrix()
    grid.position.y = modelBox.min.y - 0.001
    $('#model-info').textContent = `${nameForStatus} — bbox ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`
    rebuildAnchors()
    syncListInputs(); refreshJsonPreview()
  }, undefined, (err) => {
    $('#model-info').textContent = `falha ao carregar ${nameForStatus}: ${err?.message ?? 'erro desconhecido'}`
  })
}

// seleção/arraste de esferas
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
    if (state.snapMesh && modelRoot) {
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
  $('#model-name').value = state.modelName = m.id === 'stalker' ? 'stalker' : m.id
  loadDraft()
  loadModel(m.url, m.name)
  buildList('#joint-list-3d', true)
  syncListInputs(); refreshJsonPreview()
})
$('#snap-mesh').addEventListener('change', (ev) => { state.snapMesh = ev.target.checked })
$('#show-bones').addEventListener('change', (ev) => { state.showBones = ev.target.checked; refresh3D() })
$('#show-mesh').addEventListener('change', (ev) => { state.showMesh = ev.target.checked; if (modelRoot) modelRoot.visible = state.showMesh })
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
    schema: SCHEMA_VERSION, name: 'stalker', mode: '2d',
    image: { src: '/rig-align/preset-frente.png', width: 872, height: 872 },
    points: { A: { label: 'Queixo', side: null, color: '#ffd60a', nx: 0.5, ny: 0.115, nz: 0, imgX: 436, imgY: 100 }, '…': '…' },
    connections: CONNECTIONS, updatedAt: '…',
  }, null, 2)
}

// ═══════════════════════ tabs ═══════════════════════
document.querySelectorAll('#tabs button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab
    document.querySelectorAll('#tabs button[data-tab]').forEach(b => b.classList.toggle('active', b === btn))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === state.tab))
    if (state.tab === 'tab-3d') { resize3D() } else if (state.tab === 'tab-2d') { resize2D() }
    refreshJsonPreview()
  })
})

// ═══════════════════════ header ═══════════════════════
$('#model-name').addEventListener('input', (ev) => {
  state.modelName = ev.target.value.trim() || 'stalker'
  saveDraft()
})
$('#btn-save').addEventListener('click', saveToWorkspace)
$('#btn-copy').addEventListener('click', copyJSON)
$('#btn-download').addEventListener('click', downloadJSON)

// ═══════════════════════ boot ═══════════════════════
loadDraft()
buildList('#joint-list', false)
buildList('#joint-list-3d', true)
buildLegend()
setBgToggles()
window.addEventListener('resize', () => { resize2D(); resize3D() })
resize2D(); resize3D(); tick()
// modelo inicial 3D
const initial = MODELS[0]
loadModel(initial.url, initial.name)
syncListInputs(); refreshJsonPreview()
