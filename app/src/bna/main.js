import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { makeBnaMaterials, loadingManager } from './materials.js'
import { buildBNA } from './model.js'

// ---------------- Renderer / cena / câmara ----------------
const container = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.02
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()

// ---------- Céus (dia / noite) ----------
function makeSky(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  for (const [t, col] of stops) g.addColorStop(t, col)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const skyDay = makeSky([[0, '#4f7396'], [0.42, '#87a9c0'], [0.75, '#b7cdd6'], [1, '#d4d7cc']])
const skyNight = makeSky([[0, '#04070e'], [0.45, '#0a1220'], [0.78, '#131f2e'], [1, '#233141']])
scene.background = skyDay
scene.fog = new THREE.Fog(0xb7cdd6, 85, 320)

// Estrelas (apenas à noite)
const starGeo = new THREE.BufferGeometry()
const starPos = []
let seed = 987654321
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
for (let i = 0; i < 420; i++) {
  const theta = rnd() * Math.PI * 2, phi = rnd() * Math.PI * 0.42
  const r = 380
  starPos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 10, r * Math.sin(phi) * Math.sin(theta))
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false }))
stars.visible = false
scene.add(stars)

const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 900)

// ---------------- Vistas de análise (dia/noite incluído) ----------------
const VIEWS = {
  hero:    { label: 'Vista geral',        pos: [64.0, 13.5, 88.0],  target: [0, 10.5, -3.0],
             desc: 'Frente de 123 m para a Av. 4 de Fevereiro: arcada contínua de 31 arcos, pavilhões de ordem gigante flanqueando a rotunda, cúpula ribada de 32 m. Proporção panorâmica de palácio.' },
  facade:  { label: 'Fachada (elevação)', pos: [0, 12.0, 78.0],    target: [0, 8.6, 0],
             desc: 'Leitura ortogonal: 31 arcos de 2,15 m com pedra calcária, friso corrido com o nome do banco, sacada central, 2 pisos de janelas com frontões alternados, cornija com dentículos, balaustrada ática e pináculos.' },
  arcade:  { label: 'Arcade / Ambulacro', pos: [3.2, 2.5, 6.4],    target: [-5.5, 2.3, -3.9],
             desc: 'Sob os arcos: abóbada de berço creme, lanternas sususpensas hexagonais, portas escuras a eixo. É o passeio coberto do Largo Saydi Mingas.' },
  side:    { label: 'Vista lateral',      pos: [-71, 13.0, 43.0],   target: [0, 9.0, -6.0],
             desc: 'Volumetria dos corpos laterais: embasamento de pedra, 2 pisos de reboco salmão, cornija e telhado de 4 águas em telha de canal. A rotunda coroa o conjunto.' },
  top:     { label: 'Topo — cobertura',   pos: [0.01, 96, 6],       target: [0, 0, -3],
             desc: 'Planta de coberturas: 2 telhados hipudos em telha de canal, tambor da rotunda com anel de balaustrada, cúpula ribada de 16 nervuras e lanterna.' },
  sign:    { label: 'Letreiro do friso',  pos: [1.2, 6.6, 8.6],     target: [0, 6.05, 0.05],
             desc: '“BANCO NACIONAL DE ANGOLA” em capitais de bronze sobre friso de pedra — a inscrição visível nas fotos noturnas, retroiluminada ao pôr-do-sol.' },
  windows: { label: 'Janelas do piso nobre', pos: [12.3, 10.3, 5.3], target: [11.9, 9.9, 0.1],
             desc: 'Janela 1,65 × 2,95 m com orla de calcário, 9 panos de caixilharia, peitoril com avental e frontão alternado (triangular / curvo). Referência ao resplendor noturno das fotos.' },
  dome:    { label: 'Cúpula e lanterna',  pos: [16.5, 27.0, 13.5],  target: [0, 24.3, -9.5],
             desc: 'Cúpula de cobre envelhecido com 16 nervuras, tambor com pilastras e 10 vãos em arco, anel de balaustrada, lanterna de 8 aberturas e espiga com cruz.' },
  balustrade: { label: 'Balaustrada ática', pos: [7.2, 17.6, 5.6],  target: [-1.5, 16.3, 0.1],
             desc: 'Coroamento: cornija com dentículos, balaustrada de bilros de pedra corrida (224 bilros) e 10 pináculos-urnas — o perfil do palácio contra o céu.' },
  ground:  { label: 'Zonas do solo',      pos: [33, 18, 26],        target: [-3, 0.2, 9],
             desc: 'Granite da plaza → bordo de pedra → asfalto da Av. 4 de Fevereiro; a arcada absorve o limite público/privado. Regras R1–R5 respeitadas.' }
}
const params = new URLSearchParams(window.location.search)
const initialView = VIEWS[params.get('view')] ? params.get('view') : 'hero'
const startNight = params.get('night') === '1'

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.maxPolarAngle = Math.PI / 2 - 0.02
controls.minDistance = 2
controls.maxDistance = 260

const camAnim = { active: false, t: 0, dur: 1.55, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTg: new THREE.Vector3(), toTg: new THREE.Vector3() }
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const clock = new THREE.Clock()

function flyTo(key, instant = false) {
  const v = VIEWS[key]
  if (!v) return
  camAnim.fromPos.copy(camera.position); camAnim.fromTg.copy(controls.target)
  camAnim.toPos.set(...v.pos); camAnim.toTg.set(...v.target)
  camAnim.t = 0; camAnim.active = !instant
  if (instant) { camera.position.copy(camAnim.toPos); controls.target.copy(camAnim.toTg); controls.update() }
  document.querySelectorAll('#panel button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === key))
  document.getElementById('info-title').textContent = v.label
  document.getElementById('info-desc').textContent = v.desc
  window.__VIEW = key
}

flyTo(initialView, true)

document.querySelectorAll('#panel button[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => flyTo(btn.dataset.view))
})
const KEYMAP = { '1': 'hero', '2': 'facade', '3': 'arcade', '4': 'side', '5': 'top', '6': 'sign', '7': 'windows', '8': 'dome', '9': 'balustrade', '0': 'ground' }
window.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') { toggleNight(); return }
  const v = KEYMAP[e.key]
  if (v) flyTo(v)
})

// ---------------- Luzes / ambiente ----------------
const hemi = new THREE.HemisphereLight(0xc4d8ea, 0x63594c, 0.62)
scene.add(hemi)

const sun = new THREE.DirectionalLight(0xffedd4, 2.6)
sun.position.set(52, 41, 46)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
sun.shadow.camera.left = -82; sun.shadow.camera.right = 82
sun.shadow.camera.top = 66; sun.shadow.camera.bottom = -30
sun.shadow.camera.near = 5; sun.shadow.camera.far = 190
sun.shadow.bias = -0.00035
sun.shadow.normalBias = 0.04
scene.add(sun)

// Refletores de fachada (só acesos à noite)
const spots = []
const spotTargets = []
const spotXs = [-46, -33, -19, -9, 9, 19, 33, 46]
spotXs.forEach((x) => {
  const s = new THREE.SpotLight(0xffd2a0, 0, 95, 0.36, 0.7, 1.5)
  s.position.set(x, 8.0, 13.5)
  s.target.position.set(x * 0.55, 11.5, 0)
  scene.add(s); scene.add(s.target); spots.push(s)
})
for (const sx of [-17, 17]) {
  const s = new THREE.SpotLight(0xffcf9a, 0, 95, 0.4, 0.7, 1.5)
  s.position.set(sx, 9.0, 15)
  s.target.position.set(0, 15.5, -9.5)
  scene.add(s); scene.add(s.target); spots.push(s)
}

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.56

// ---------------- Construção ----------------
const M = makeBnaMaterials(renderer.capabilities.getMaxAnisotropy())
const building = buildBNA(scene, M)

// ---------------- Modo dia / noite ----------------
let night = false
const nightBtn = document.getElementById('night-toggle')
function toggleNight() {
  night = !night
  if (night) {
    scene.background = skyNight
    scene.fog = new THREE.Fog(0x0c141d, 60, 300)
    sun.color.set(0x8fa9cc); sun.intensity = 0.22; sun.position.set(-38, 44, -30)
    hemi.color.set(0x2a3750); hemi.groundColor.set(0x14100c); hemi.intensity = 0.32
    scene.environmentIntensity = 0.18
    renderer.toneMappingExposure = 1.12
    spots.forEach((s) => { s.intensity = 430 })
    stars.visible = true
    M._signMat.emissiveIntensity = 1.7
    M.lampGlow.emissiveIntensity = 3.6
    building.userData.litWindows.forEach((glass) => { glass.material = M.glassLit })
    if (nightBtn) nightBtn.textContent = '☀ Modo diurno (N)'
  } else {
    scene.background = skyDay
    scene.fog = new THREE.Fog(0xb7cdd6, 85, 320)
    sun.color.set(0xffedd4); sun.intensity = 2.6; sun.position.set(52, 41, 46)
    hemi.color.set(0xc4d8ea); hemi.groundColor.set(0x63594c); hemi.intensity = 0.55
    scene.environmentIntensity = 0.5
    renderer.toneMappingExposure = 1.02
    spots.forEach((s) => { s.intensity = 0 })
    stars.visible = false
    M._signMat.emissiveIntensity = 0.12
    M.lampGlow.emissiveIntensity = 1.3
    building.userData.litWindows.forEach((glass) => { glass.material = glass.userData.dayMat })
    if (nightBtn) nightBtn.textContent = '☾ Modo noturno (N)'
  }
}
if (nightBtn) nightBtn.addEventListener('click', toggleNight)
if (startNight) toggleNight()

// ---------------- Pronto / resize / loop ----------------
window.__nsambo = { renderer, scene, camera }

loadingManager.onLoad = () => {
  renderer.render(scene, camera)
  const el = document.getElementById('loading')
  if (el) el.style.opacity = '0'
  window.__READY = true
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  if (camAnim.active) {
    camAnim.t += dt / camAnim.dur
    const k = easeInOutCubic(Math.min(camAnim.t, 1))
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, k)
    controls.target.lerpVectors(camAnim.fromTg, camAnim.toTg, k)
    if (camAnim.t >= 1) camAnim.active = false
  }
  controls.update()
  renderer.render(scene, camera)
})
