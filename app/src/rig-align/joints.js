// Esquema dos pontos de articulação — ferramenta de rigging NSAMBO
// Convenção: D = lado DIREITO da criatura · E = lado ESQUERDO.
// Numa vista de frente (criatura a olhar para a câmara), o lado D aparece à ESQUERDA do ecrã.
// Ligações (esqueleto) desenhadas em tempo real sobre o modelo 3D.

export const SCHEMA_VERSION = 'nsambo-rig-align@1'

export const JOINTS = [
  { id: 'A',  label: 'Queixo',       side: null, color: '#ffd60a', nx: 0.50, ny: 0.115 },
  { id: 'B',  label: 'Pescoço',      side: null, color: '#ff9e00', nx: 0.50, ny: 0.185 },
  { id: 'C1', label: 'Ombro D',      side: 'D',  color: '#ff5d5d', nx: 0.335, ny: 0.245 },
  { id: 'C2', label: 'Ombro E',      side: 'E',  color: '#4dabf7', nx: 0.665, ny: 0.245 },
  { id: 'D1', label: 'Cotovelo D',   side: 'D',  color: '#fa5252', nx: 0.225, ny: 0.405 },
  { id: 'D2', label: 'Cotovelo E',   side: 'E',  color: '#339af0', nx: 0.775, ny: 0.405 },
  { id: 'E1', label: 'Pulso D',      side: 'D',  color: '#e03131', nx: 0.160, ny: 0.550 },
  { id: 'E2', label: 'Pulso E',      side: 'E',  color: '#1971c2', nx: 0.840, ny: 0.550 },
  { id: 'F',  label: 'Pélvis',       side: null, color: '#f8f9fa', nx: 0.50, ny: 0.560 },
  { id: 'G1', label: 'Joelho D',     side: 'D',  color: '#ffa94d', nx: 0.440, ny: 0.745 },
  { id: 'G2', label: 'Joelho E',     side: 'E',  color: '#63e6be', nx: 0.560, ny: 0.745 },
  { id: 'H1', label: 'Tornozelo D',  side: 'D',  color: '#fd7e14', nx: 0.420, ny: 0.925 },
  { id: 'H2', label: 'Tornozelo E',  side: 'E',  color: '#20c997', nx: 0.580, ny: 0.925 },
  { id: 'I1', label: 'Calcanhar D',  side: 'D',  color: '#d9480f', nx: 0.440, ny: 0.972 },
  { id: 'I2', label: 'Calcanhar E',  side: 'E',  color: '#087f5b', nx: 0.560, ny: 0.972 },
  // v2 — zona pélvica/peito: as juntas que faltavam para NÃO derivar das pernas/âncoras erradas
  { id: 'J',  label: 'Anca D',       side: 'D',  color: '#e599f7', nx: 0.415, ny: 0.565 },
  { id: 'K',  label: 'Anca E',       side: 'E',  color: '#9775fa', nx: 0.585, ny: 0.565 },
  { id: 'M',  label: 'Peito',        side: null, color: '#da77f2', nx: 0.50,  ny: 0.275 },
]

export const CONNECTIONS = [
  ['A', 'B'],
  ['B', 'C1'], ['C1', 'D1'], ['D1', 'E1'],
  ['B', 'C2'], ['C2', 'D2'], ['D2', 'E2'],
  ['B', 'M'], ['M', 'F'],
  ['F', 'J'], ['J', 'G1'], ['G1', 'H1'], ['H1', 'I1'],
  ['F', 'K'], ['K', 'G2'], ['G2', 'H2'], ['H2', 'I2'],
]

export const JOINT_MAP = Object.fromEntries(JOINTS.map(j => [j.id, j]))

// modelos GLB servíveis via /models/* (publicDir = ../assets)
export const MODELS = [
  { id: 'stalker',  name: 'Stalker (stalker.glb)', url: '/models/stalker.glb' },
  { id: 'arms',     name: 'Braços (arms_rig.glb)', url: '/models/arms_rig.glb' },
  { id: 'knife',    name: 'Faca (knife.glb)',      url: '/models/knife.glb' },
  { id: 'crowbar',  name: 'Pé de cabra (psx_crowbar.glb)', url: '/models/psx_crowbar.glb' },
  { id: 'flashlight', name: 'Lanterna (psx_flashlight.glb)', url: '/models/psx_flashlight.glb' },
]

// defaults v2: as ancas nascem ligeiramente laterais à pélvis e o peito na linha F→B —
// sintéticos por definição (ajusta-os); a cadeia real assenta nas tuas âncoras.
export const defaultPoints = () => {
  const p = Object.fromEntries(JOINTS.map(j => [j.id, { nx: j.nx, ny: j.ny, nz: 0 }]))
  p.J = { ...p.J, nx: p.F.nx - 0.085, ny: p.F.ny + 0.005 }
  p.K = { ...p.K, nx: p.F.nx + 0.085, ny: p.F.ny + 0.005 }
  p.M = { nx: (p.F.nx * 0.4) + (p.B.nx * 0.6), ny: (p.F.ny * 0.4) + (p.B.ny * 0.6), nz: (p.F.nz * 0.4) + (p.B.nz * 0.6) }
  return p
}
