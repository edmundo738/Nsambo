// NSAMBO · rig-align — Esqueleto v2 (schema "nsambo-rig-align@2")
// Spec v2.0 §Anatomia expandida: identificadores estáveis, sufixos L/R, categorias,
// extensibilidade não-humana (cauda/asas entram pelo mesmo mecanismo de juntas com categoria).
// Categorias:
//   skeletal             — osso que DEFORMA a malha (pesos)
//   anatomical-reference — marco anatómico sem pesos (joelho máximo, naso, omoplata)
//   facial-controller    — controlador facial (sobrancelha, boca); nunca deforma sozinho
//   deformation-region   — região auxiliar de deformação (ex.: peito/esterno) — para paint zones
// O schema v1 ("nsambo-rig-align@1") CONTINUA VÁLIDO: fromV1 migra preservando nomes e índices.

export const SCHEMA_V2 = 'nsambo-rig-align@2'
export const SCHEMA_V1 = 'nsambo-rig-align@1'
export const JOINT_CATEGORIES = Object.freeze([
  'skeletal', 'anatomical-reference', 'facial-controller', 'deformation-region',
])

const J = (id, name, parent, category, pos, note) => ({ id, name, parent, category, pos, note: note ?? null })

// ───────────────── template humanoide expandido (substituição) ─────────────────
// Posições iniciais em metros (personagem ~1.8 m, pés em y=0, simétrico em x).
// São PONTO DE PARTIDA — o utilizador arrasta no 3D ou edita os valores; nada disto é aplicado ao jogo.
export function humanoidTemplate() {
  const joints = [
    J('root', 'Root', null, 'skeletal', [0, 0, 0], 'origem do mundo/personagem'),
    J('pelvis', 'Pelvis (Hips)', 'root', 'skeletal', [0, 0.98, 0], 'centro de massa do tronco'),
    J('spine_01', 'Spine 01', 'pelvis', 'skeletal', [0, 1.08, 0]),
    J('spine_02', 'Spine 02', 'spine_01', 'skeletal', [0, 1.18, 0.005]),
    J('spine_03', 'Spine 03', 'spine_02', 'skeletal', [0, 1.28, 0.01]),
    J('chest', 'Chest', 'spine_03', 'skeletal', [0, 1.38, 0.02]),
    J('sternum', 'Sternum', 'chest', 'anatomical-reference', [0, 1.45, 0.045], 'marco do esterno'),
    J('chest_L', 'Chest L', 'chest', 'deformation-region', [-0.095, 1.41, 0.03]),
    J('chest_R', 'Chest R', 'chest', 'deformation-region', [0.095, 1.41, 0.03]),
    // clavículas + hombros (referência) + omoplatas (referência)
    J('clavicle_L', 'Clavicle L', 'chest', 'skeletal', [-0.07, 1.50, 0.02]),
    J('clavicle_R', 'Clavicle R', 'chest', 'skeletal', [0.07, 1.50, 0.02]),
    J('shoulder_L', 'Shoulder L', 'clavicle_L', 'anatomical-reference', [-0.145, 1.50, 0.0], 'glenóide — não deforma'),
    J('shoulder_R', 'Shoulder R', 'clavicle_R', 'anatomical-reference', [0.145, 1.50, 0.0]),
    J('scapula_L', 'Scapula L', 'chest', 'anatomical-reference', [-0.13, 1.46, 0.085]),
    J('scapula_R', 'Scapula R', 'chest', 'anatomical-reference', [0.13, 1.46, 0.085]),
    // pescoço + cabeça + face
    J('neck', 'Neck', 'chest', 'skeletal', [0, 1.57, 0]),
    J('head', 'Head', 'neck', 'skeletal', [0, 1.71, 0.01]),
    J('jaw', 'Jaw', 'head', 'skeletal', [0, 1.645, 0.075], 'deforma o maxilar'),
    J('chin', 'Chin', 'head', 'anatomical-reference', [0, 1.615, 0.098]),
    J('nose', 'Nose', 'head', 'anatomical-reference', [0, 1.705, 0.108]),
    J('eye_L', 'Eye L', 'head', 'anatomical-reference', [-0.034, 1.72, 0.088]),
    J('eye_R', 'Eye R', 'head', 'anatomical-reference', [0.034, 1.72, 0.088]),
    J('brow_L', 'Brow L', 'head', 'facial-controller', [-0.036, 1.745, 0.092]),
    J('brow_R', 'Brow R', 'head', 'facial-controller', [0.036, 1.745, 0.092]),
    J('mouth', 'Mouth', 'jaw', 'facial-controller', [0, 1.652, 0.102]),
    J('ear_L', 'Ear L', 'head', 'anatomical-reference', [-0.082, 1.705, -0.01]),
    J('ear_R', 'Ear R', 'head', 'anatomical-reference', [0.082, 1.705, -0.01]),
  ]
  const mkArm = (side) => {
    const s = side === 'L' ? -1 : 1
    const suf = '_' + side
    joints.push(
      J('upper_arm' + suf, 'Upper Arm ' + side, 'clavicle' + suf, 'skeletal', [s * 0.19, 1.49, 0]),
      J('fore_arm' + suf, 'Forearm ' + side, 'upper_arm' + suf, 'skeletal', [s * 0.38, 1.42, 0.02]),
      J('hand' + suf, 'Hand ' + side, 'fore_arm' + suf, 'skeletal', [s * 0.48, 1.33, 0.04]),
    )
    // dedos: polegar ×3 (metacarpal+proximal+distal), outros quatro ×3
    const hand = [s * 0.48, 1.33, 0.04]
    const spread = { thumb: [0.055, -0.02, 0.035, 0.055], index: [0.035, -0.065, 0, 0.055], middle: [0.012, -0.072, 0.005, 0.058], ring: [-0.012, -0.068, 0, 0.055], pinky: [-0.034, -0.058, -0.005, 0.048] }
    for (const [finger, offs] of Object.entries(spread)) {
      let px = hand[0] + s * offs[0], py = hand[1] + offs[1], pz = hand[2] + offs[2]
      for (let seg = 1; seg <= 3; seg++) {
        const len = offs[3]
        joints.push(J(`${finger}_${seg.toString().padStart(2, '0')}${suf}`, `${finger[0].toUpperCase() + finger.slice(1)} ${seg} ${side}`, seg === 1 ? `hand${suf}` : `${finger}_${(seg - 1).toString().padStart(2, '0')}${suf}`, 'skeletal', [px, py, pz]))
        pz += len * 0.82; py -= len * 0.35
      }
    }
  }
  mkArm('L'); mkArm('R')
  const mkLeg = (side) => {
    const s = side === 'L' ? -1 : 1
    const suf = '_' + side
    joints.push(
      J('upper_leg' + suf, 'Upper Leg ' + side, 'pelvis', 'skeletal', [s * 0.10, 0.94, 0.02]),
      J('lower_leg' + suf, 'Lower Leg ' + side, 'upper_leg' + suf, 'skeletal', [s * 0.11, 0.52, 0.01]),
      J('foot_heel' + suf, 'Foot Heel ' + side, 'lower_leg' + suf, 'skeletal', [s * 0.115, 0.055, -0.075], 'calcanhar'),
      J('foot_ball' + suf, 'Foot Ball ' + side, 'foot_heel' + suf, 'skeletal', [s * 0.115, 0.028, 0.075], 'bola do pé'),
      J('toe_big_01' + suf, 'Big Toe 1 ' + side, 'foot_ball' + suf, 'skeletal', [s * 0.075, 0.02, 0.135]),
      J('toe_big_02' + suf, 'Big Toe 2 ' + side, 'toe_big_01' + suf, 'skeletal', [s * 0.072, 0.016, 0.175]),
    )
    for (let t = 2; t <= 5; t++) {
      const tx = s * (0.075 + (t - 2) * 0.028) * (side === 'L' ? 1 : 1)
      const splay = (t - 3.5) * 0.012
      joints.push(J(`toe_0${t}_01${suf}`, `Toe ${t} · 1 ${side}`, 'foot_ball' + suf, 'skeletal', [tx + s * splay, 0.02, 0.135]))
      joints.push(J(`toe_0${t}_02${suf}`, `Toe ${t} · 2 ${side}`, `toe_0${t}_01${suf}`, 'skeletal', [tx + s * splay, 0.015, 0.165]))
      joints.push(J(`toe_0${t}_03${suf}`, `Toe ${t} · 3 ${side}`, `toe_0${t}_02${suf}`, 'skeletal', [tx + s * splay, 0.012, 0.19]))
    }
  }
  mkLeg('L'); mkLeg('R')
  return { schema: SCHEMA_V2, name: 'humanoide-expandido', units: 'm', joints }
}

// ───────────────── esqueleto vazio (fase nula — o utilizador constrói tudo) ─────────────────
export function emptySkeleton() {
  return { schema: SCHEMA_V2, name: 'personalizado', units: 'm', joints: [
    J('root', 'Root', null, 'skeletal', [0, 0, 0]),
  ] }
}

// ───────────────── preservação: esqueleto do jogo (21 juntas) como v2 ─────────────────
export function fromGameJointTemplate(JOINT_TEMPLATE, nameMap) {
  const joints = JOINT_TEMPLATE.map(([n, parent], i) => ({
    id: n.replace(/([A-Z])/g, (m) => m.toLowerCase()),
    name: (nameMap && nameMap[i]) ?? n,
    parent: parent >= 0 ? JOINT_TEMPLATE[parent][0].replace(/([A-Z])/g, (m) => m.toLowerCase()) : null,
    category: 'skeletal',
    pos: null,
    note: 'do esqueleto de 21 juntas do jogo',
  }))
  return { schema: SCHEMA_V2, name: 'stalker-21-preservado', units: 'm', joints }
}

// ───────────────── migração v1 → v2 ─────────────────
export function fromV1(v1) {
  if (v1?.schema === SCHEMA_V2) return v1
  const list = v1?.joints ?? []
  const idOf = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const ids = list.map((j) => idOf(j.n))
  const joints = list.map((j, i) => ({
    id: ids[i], name: j.n,
    parent: j.p >= 0 ? ids[j.p] : null,
    category: 'skeletal',
    pos: Array.isArray(j.pos) ? [...j.pos] : null,
    note: null,
  }))
  return { schema: SCHEMA_V2, name: v1?.format ? 'migrado-v1' : 'migrado', units: v1?.units ?? 'm', joints }
}

export function toJSON(skeleton) {
  return JSON.stringify(skeleton, null, 2)
}

// ───────────────── validação estrutural (o auditor da builder) ─────────────────
export function validateSkeleton(s) {
  const errors = [], warnings = []
  if (s?.schema !== SCHEMA_V2) errors.push(`schema inválido: ${s?.schema ?? '(ausente)'} — esperado ${SCHEMA_V2}`)
  const joints = s?.joints
  if (!Array.isArray(joints) || joints.length === 0) { errors.push('esqueleto sem juntas'); return { errors, warnings } }
  const ids = new Set(), names = new Set()
  const byId = new Map()
  for (const j of joints) {
    if (!/^[a-z0-9_]+(_L|_R)?$/.test(j.id)) errors.push(`${j.id}: id inválido (minúsculas, dígitos, _, com sufixo anatómico opcional _L/_R)`)
    if (ids.has(j.id)) errors.push(`${j.id}: id duplicado — identificadores têm de ser estáveis e únicos`)
    ids.add(j.id)
    const nm = String(j.name ?? '').trim().toLowerCase()
    if (!nm) errors.push(`${j.id}: nome vazio`)
    if (names.has(nm)) warnings.push(`${j.id}: nome "${j.name}" repetido (considere distinguir L/R)`)
    names.add(nm)
    if (!JOINT_CATEGORIES.includes(j.category)) errors.push(`${j.id}: categoria "${j.category}" desconhecida`)
    byId.set(j.id, j)
  }
  // parentesco + ciclos
  for (const j of joints) {
    if (j.parent != null && !byId.has(j.parent)) errors.push(`${j.id}: pai "${j.parent}" não existe`)
    const seen = new Set([j.id])
    let cur = j
    while (cur.parent != null) {
      if (seen.has(cur.parent)) { errors.push(`${j.id}: ciclo de parentesco em "${cur.parent}"`); break }
      seen.add(cur.parent)
      cur = byId.get(cur.parent)
      if (!cur) break
    }
  }
  if (joints.filter((j) => j.parent == null).length === 0) errors.push('nenhuma raíz (junta sem pai)')
  // simetria L/R
  const base = (id) => id.replace(/_L$|_R$/, '')
  const left = new Set(joints.map(j => j.id).filter(id => id.endsWith('_L')))
  const right = new Set(joints.map(j => j.id).filter(id => id.endsWith('_R')))
  for (const id of left) if (!right.has(base(id) + '_R')) warnings.push(`${id}: junta _L sem par _R "${base(id)}_R"`)
  for (const id of right) if (!left.has(base(id) + '_L')) warnings.push(`${id}: junta _R sem par _L "${base(id)}_L"`)
  // facial-controller nunca é pai de skeletal
  for (const j of joints) {
    if (j.category !== 'facial-controller') continue
    for (const k of joints) {
      if (k.parent === j.id && k.category === 'skeletal') {
        errors.push(`${k.id} (skeletal) é filho de ${j.id} (facial-controller) — controladores não carregam ossos`)
      }
    }
  }
  // deformation-region nunca é pai de skeletal
  for (const j of joints) {
    if (j.category !== 'deformation-region') continue
    for (const k of joints) {
      if (k.parent === j.id && k.category === 'skeletal') {
        warnings.push(`${k.id} é filho de ${j.id} (deformation-region) — regiões são auxiliares, não suporte`)
      }
    }
  }
  return { errors, warnings }
}

export function skeletonStats(s) {
  const byCat = Object.fromEntries(JOINT_CATEGORIES.map(c => [c, 0]))
  for (const j of s?.joints ?? []) byCat[j.category] = (byCat[j.category] ?? 0) + 1
  const depth = (() => {
    const byId = new Map((s?.joints ?? []).map(j => [j.id, j]))
    let max = 0
    for (const j of s?.joints ?? []) {
      let d = 0, cur = j
      const seen = new Set()
      while (cur.parent != null && byId.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); d++; cur = byId.get(cur.parent) }
      if (d > max) max = d
    }
    return max
  })()
  return { total: (s?.joints ?? []).length, byCategory: byCat, maxDepth: depth }
}

// adaptador para o motor de skinning (índices topológicos); falha se houver ciclos
export function toEngineJoints(s) {
  const joints = s.joints
  const order = [], indexOf = new Map()
  const byId = new Map(joints.map(j => [j.id, j]))
  const visit = (j) => {
    if (indexOf.has(j.id)) return
    if (j.parent) visit(byId.get(j.parent))
    indexOf.set(j.id, order.length)
    order.push(j)
  }
  for (const j of joints) visit(j)
  return order.map((j) => ({
    n: j.id,
    p: j.parent ? indexOf.get(j.parent) : -1,
    pos: Array.isArray(j.pos) ? [...j.pos] : [0, 0, 0],
  }))
}
