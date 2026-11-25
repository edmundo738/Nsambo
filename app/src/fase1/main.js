import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { makeMaterials, loadingManager } from './materials.js'
import { buildGround } from './ground.js'
import { buildBuilding } from './building.js'

// ---------------- Renderer / cena / câmara ----------------
const container = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()

// Céu gradiente (zênite → horizonte) — ambiente, não textura de material
const skyCanvas = document.createElement('canvas')
skyCanvas.width = 4; skyCanvas.height = 512
const sctx = skyCanvas.getContext('2d')
const grad = sctx.createLinearGradient(0, 0, 0, 512)
grad.addColorStop(0.0, '#54749a')
grad.addColorStop(0.42, '#88a9c0')
grad.addColorStop(0.75, '#b8ccd5')
grad.addColorStop(1.0, '#d3d6cb')
sctx.fillStyle = grad; sctx.fillRect(0, 0, 4, 512)
const skyTex = new THREE.CanvasTexture(skyCanvas)
skyTex.colorSpace = THREE.SRGBColorSpace
scene.background = skyTex
scene.fog = new THREE.Fog(0xb8ccd5, 70, 230)

const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 500)

// ---------------- Vistas + detalhes (navegação de análise) ----------------
const VIEWS = {
  hero:     { label: 'Vista geral',           pos: [46.0, 10.5, 63.0], target: [0, 25.0, -2.5],
              desc: 'Silhueta completa: pódio + torre + coroamento. Betão aparente com vocabulário tonal unificado ao terreno — o edifício nasce do sítio, não pousa nele.' },
  street:   { label: 'Rua — escala humana',   pos: [6.4, 1.75, 15.4],  target: [-2.0, 11.5, -0.5],
              desc: 'Vista desde a faixa de rodagem, à altura dos olhos (1,75 m). É a distância a que o pedestre lê o pódio, a montra, o bordo e a lâmina da entrada.' },
  lobby:    { label: 'Entrada / Lobby',       pos: [1.2, 1.85, 9.8],   target: [0, 2.7, 1.9],
              desc: 'Montra recuada 0,6 m com interior aquecido, lâmina fina de cobertura sobre colunas esbeltas e letreiro NSAMBO retroiluminado. Eixo simétrico marcado pelos pilares.' },
  side:     { label: 'Lateral / Tardoz',      pos: [-33, 6.0, 17.0],   target: [0, 19, -4.0],
              desc: 'Fachada quase cega em betão com vãos ritmados 1,5 × 1,6 m, dois por piso. Lado de serviço: a torre mostra o osso, não a festa.' },
  top:      { label: 'Topo — cobertura',      pos: [0.01, 96, 5],      target: [0, 0, -2],
              desc: 'Planta de cobertura: peitoril de bordo, casa de máquinas, 2 cisternas de água sobre estruturas e antena com balizamento. Sombra projectada para N.O.' },
  fins:     { label: 'Fins da torre + vidro', pos: [3.4, 26.5, 8.6],   target: [-0.6, 29.5, 0.45],
              desc: 'Fins de betão projectados 0,36 m com cadência de 2,4 m: sombreamento próprio, ritmo vertical, leitura estrutural. Entre eles, vidro com montantes a 1,16 m.' },
  spandrel: { label: 'Fiada de betão',        pos: [2.1, 10.9, 4.4],   target: [-0.3, 9.35, 0.45],
              desc: 'Fiada de betão aparente com furos de tirante (tie holes) alinhados ao eixo de cada fin — memória do sistema de cofragem, aceitação deliberada da marca do molde.' },
  terrace:  { label: 'Terraço + guarda-corpo',pos: [13.5, 11.2, 9.5],  target: [-2.0, 8.55, 0.6],
              desc: 'Terraço do pódio pavimentado com os mesmos pavers do passeio — extensão exterior da cidade para dentro do lote. Guarda-corpo de aço com duplo travessão.' },
  roof:     { label: 'Coroamento',            pos: [16.5, 56.0, 9.0],  target: [0.5, 49.2, -5.0],
              desc: 'Máquina no topo: casa de máquinas com venezianas, cisternas sobre estruturas (tipologia local), antena com luz vermelha de balizamento noturno.' },
  ground:   { label: 'Zonas do solo',         pos: [26, 15, 34],       target: [-2, 0.3, 6.5],
              desc: 'Regras R1–R5: asfalto só na via, pavers só no passeio, bordo de betão a separar os dois, e o edifício a assentar na plaza — nunca na via. Cada material no seu sítio, todos a conversar.' }
}
const params = new URLSearchParams(window.location.search)
const initialView = VIEWS[params.get('view')] ? params.get('view') : 'hero'

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.maxPolarAngle = Math.PI / 2 - 0.02
controls.minDistance = 2
controls.maxDistance = 140

// ---------- Voo de câmara com easing (navegação) ----------
export {} // módulo sem exports públicos
const camAnim = { active: false, t: 0, dur: 1.55, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTg: new THREE.Vector3(), toTg: new THREE.Vector3() }
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const clock = new THREE.Clock()

function flyTo(key, instant = false) {
  const v = VIEWS[key]
  if (!v) return
  camAnim.fromPos.copy(camera.position)
  camAnim.fromTg.copy(controls.target)
  camAnim.toPos.set(...v.pos)
  camAnim.toTg.set(...v.target)
  camAnim.t = 0
  camAnim.active = !instant
  if (instant) {
    camera.position.copy(camAnim.toPos)
    controls.target.copy(camAnim.toTg)
    controls.update()
  }
  // Painel + cartão de informação
  document.querySelectorAll('#panel button').forEach((b) => b.classList.toggle('active', b.dataset.view === key))
  document.getElementById('info-title').textContent = v.label
  document.getElementById('info-desc').textContent = v.desc
  window.__VIEW = key
}

flyTo(initialView, true)

document.querySelectorAll('#panel button').forEach((btn) => {
  btn.addEventListener('click', () => flyTo(btn.dataset.view))
})
const KEYMAP = { '1': 'hero', '2': 'street', '3': 'lobby', '4': 'side', '5': 'top', '6': 'fins', '7': 'spandrel', '8': 'terrace', '9': 'roof', '0': 'ground' }
window.addEventListener('keydown', (e) => {
  const v = KEYMAP[e.key]
  if (v) flyTo(v)
})

// ---------------- Luzes / ambiente ----------------
const hemi = new THREE.HemisphereLight(0xc4d8ea, 0x635c50, 0.35)
scene.add(hemi)

const sun = new THREE.DirectionalLight(0xffe9cd, 2.8)
sun.position.set(44, 18, 19)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42
sun.shadow.camera.top = 62; sun.shadow.camera.bottom = -28
sun.shadow.camera.near = 5; sun.shadow.camera.far = 140
sun.shadow.bias = -0.00035
sun.shadow.normalBias = 0.03
scene.add(sun)

// Ambiente PMREM (reflexos físicos no vidro/metal) — procedural, sem HDRI externo
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.5

// ---------------- Construção ----------------
const M = makeMaterials(renderer.capabilities.getMaxAnisotropy())
buildGround(scene, M)
buildBuilding(scene, M)

// ---------------- Pronto / resize / loop ----------------
// Gancho para screenshots headless (captura do canvas sem depender do compositor)
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
