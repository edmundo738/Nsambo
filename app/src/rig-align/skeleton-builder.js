// NSAMBO · rig-align — Skeleton Builder UI (schema nsambo-rig-align@2)
// Painel «Esqueleto v2»: templates (preservar jogo / humanoide expandido / vazio),
// importação v1→v2, edição de id/nome/pai/categoria, validação ao vivo, export bloqueado por erros.
import { JOINT_TEMPLATE } from '../backrooms/game/stalker-anchors.mjs'
import {
  SCHEMA_V2, JOINT_CATEGORIES,
  humanoidTemplate, emptySkeleton, fromGameJointTemplate, fromV1,
  toJSON, validateSkeleton, skeletonStats,
} from './skeleton-schema.mjs'

const STORAGE_KEY = 'rig-align:skeleton-v2'
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const $ = (s, r = document) => r.querySelector(s)

export function initSkeletonBuilder({ onStatus } = {}) {
  const tree = $('#sk-tree')
  if (!tree) return // a tab não existe nesta página
  const statsEl = $('#sk-stats'), validEl = $('#sk-validation')
  const templateSel = $('#sk-template')
  const status = (msg, isErr = false) => { try { onStatus?.(msg, isErr) } catch {} }

  const fresh = (kind) => {
    if (kind === 'humanoid') return humanoidTemplate()
    if (kind === 'empty') return emptySkeleton()
    return fromGameJointTemplate(JOINT_TEMPLATE)
  }
  let skeleton = fresh(templateSel?.value ?? 'humanoid')
  let selected = new Set()
  let idSeq = 1
  const uniqueNewId = () => {
    const ids = new Set(skeleton.joints.map(j => j.id))
    while (ids.has(`nova_junta_${idSeq}`)) idSeq++
    return `nova_junta_${idSeq++}`
  }

  const byId = () => new Map(skeleton.joints.map(j => [j.id, j]))
  const depthOf = (j) => {
    const m = byId(); let d = 0, cur = j
    const seen = new Set()
    while (cur?.parent != null && m.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); d++; cur = m.get(cur.parent) }
    return d
  }

  function render() {
    const st = skeletonStats(skeleton)
    statsEl.innerHTML = [
      `<span><b>${st.total}</b> juntas</span>`,
      `<span>profundidade <b>${st.maxDepth}</b></span>`,
      ...JOINT_CATEGORIES.map(c => `<span>${c}: <b>${st.byCategory[c] ?? 0}</b></span>`),
    ].join('')
    const v = validateSkeleton(skeleton)
    const L = []
    if (v.errors.length === 0 && v.warnings.length === 0) L.push('<div class="anal-row"><span class="anal-ok">✓</span><span>esqueleto válido — pode exportar</span></div>')
    for (const e of v.errors) L.push(`<div class="anal-row"><span class="anal-err">✗</span><span>${esc(e)}</span></div>`)
    for (const w of v.warnings) L.push(`<div class="anal-row"><span class="anal-warn">⚠</span><span>${esc(w)}</span></div>`)
    validEl.innerHTML = L.join('')
    $('#sk-export').disabled = v.errors.length > 0

    // árvore ordenada topologicamente (pais primeiro)
    const order = toEngineOrder(skeleton)
    const rows = []
    for (const j of order) {
      const d = depthOf(j)
      const pair = /_L$|_R$/.test(j.id) ? (pairOk(skeleton, j.id) ? '<span class="sk-pair-ok">⇄</span>' : '<span class="sk-pair-miss" title="sem par L/R">⇄?</span>') : ''
      rows.push(`<div class="sk-row sk-cat-${esc(j.category)}" data-id="${esc(j.id)}">
        <input type="checkbox" class="sk-check" ${selected.has(j.id) ? 'checked' : ''} aria-label="selecionar ${esc(j.id)}">
        <span class="sk-id-wrap"><span class="sk-indent" style="width:${d * 14}px"></span><input class="sk-id" value="${esc(j.id)}" spellcheck="false" title="identificador estável (renomeia em cascata)"></span>
        <input class="sk-name" value="${esc(j.name)}" spellcheck="false" aria-label="nome">
        <select class="sk-parent" aria-label="pai">${parentOptions(skeleton, j)}</select>
        <select class="sk-cat" aria-label="categoria">${JOINT_CATEGORIES.map(c => `<option value="${c}" ${c === j.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <span class="sk-pair">${pair}</span>
      </div>`)
    }
    tree.innerHTML = `<div class="sk-row sk-head"><span></span><span>id (estável)</span><span>nome</span><span>pai</span><span>categoria</span><span>par</span></div>` + rows.join('')
  }
  const toEngineOrder = (s) => {
    const byId = new Map(s.joints.map(j => [j.id, j]))
    const out = [], done = new Set()
    const visit = (j, guard) => {
      if (done.has(j.id)) return
      if (j.parent && byId.has(j.parent) && !guard.has(j.id)) { guard.add(j.id); visit(byId.get(j.parent), guard) }
      if (!done.has(j.id)) { done.add(j.id); out.push(j) }
    }
    const roots = s.joints.filter(j => j.parent == null || !byId.has(j.parent))
    for (const j of roots) visit(j, new Set())
    for (const j of s.joints) visit(j, new Set())
    return out
  }
  const parentOptions = (s, j) => {
    const opts = ['<option value="">— raíz —</option>']
    for (const k of s.joints) {
      if (k.id === j.id) continue
      opts.push(`<option value="${esc(k.id)}" ${k.id === j.parent ? 'selected' : ''}>${esc(k.id)}</option>`)
    }
    return opts.join('')
  }
  const pairOk = (s, id) => {
    const ids = new Set(s.joints.map(j => j.id))
    if (id.endsWith('_L')) return ids.has(id.slice(0, -2) + '_R')
    if (id.endsWith('_R')) return ids.has(id.slice(0, -2) + '_L')
    return false
  }

  tree.addEventListener('change', (ev) => {
    const row = ev.target.closest('.sk-row')
    if (!row) return
    const id = row.dataset.id
    const j = skeleton.joints.find(x => x.id === id)
    if (!j) return
    if (ev.target.classList.contains('sk-check')) {
      if (ev.target.checked) selected.add(id); else selected.delete(id)
      return
    }
    if (ev.target.classList.contains('sk-parent')) {
      j.parent = ev.target.value || null
    } else if (ev.target.classList.contains('sk-cat')) {
      j.category = ev.target.value
    } else if (ev.target.classList.contains('sk-name')) {
      j.name = ev.target.value
      render(); return
    } else if (ev.target.classList.contains('sk-id')) {
      const nid = ev.target.value.trim()
      if (!/^[a-z0-9_]+(_L|_R)?$/.test(nid)) { ev.target.classList.add('sk-id-invalid'); status(`id "${nid}" inválido — minúsculas, dígitos, _ e sufixo _L/_R`, true); return }
      if (skeleton.joints.some(x => x.id !== id && x.id === nid)) { ev.target.classList.add('sk-id-invalid'); status(`id "${nid}" já existe`, true); return }
      // renomeia em cascata os filhos que apontavam para este id
      for (const k of skeleton.joints) if (k.parent === id) k.parent = nid
      j.id = nid
      if (selected.delete(id)) selected.add(nid)
      status(`id renomeado: ${id} → ${nid} (filhos atualizados)`)
    }
    render()
  })

  $('#sk-add')?.addEventListener('click', () => {
    const id = uniqueNewId()
    const ids = new Set(skeleton.joints.map(j => j.id))
    const parent = ids.has('root') ? 'root' : (ids.has('pelvis') ? 'pelvis' : skeleton.joints[0]?.id ?? null)
    skeleton.joints.push({ id, name: 'Nova junta', parent, category: 'skeletal', pos: [0, 1, 0], note: null })
    selected = new Set([id])
    render()
    status(`junta "${id}" adicionada — edita o pai e a categoria`)
  })
  $('#sk-remove')?.addEventListener('click', () => {
    if (selected.size === 0) { status('nada selecionado', true); return }
    const m = byId()
    const toDelete = new Set(selected)
    for (const id of toDelete) {
      const j = m.get(id)
      if (!j) continue
      // filhos sobem para o pai do removido (nunca ficam órfãos)
      for (const k of skeleton.joints) if (k.parent === id) k.parent = j.parent ?? null
    }
    skeleton.joints = skeleton.joints.filter(j => !toDelete.has(j.id))
    status(`${toDelete.size} juntas removidas — filhos re-pendurados no pai`)
    selected = new Set()
    render()
  })
  $('#sk-template')?.addEventListener('change', () => {
    const kind = templateSel.value
    skeleton = fresh(kind)
    selected = new Set()
    status(kind === 'game' ? 'esqueleto do jogo preservado (21 juntas)' : kind === 'humanoid' ? 'humanoide expandido (99 juntas)' : 'esqueleto vazio — constrói de origem')
    render()
  })
  $('#sk-import')?.addEventListener('click', () => $('#sk-import-file')?.click())
  $('#sk-import-file')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const v2 = json?.schema === SCHEMA_V2 ? json : fromV1(json)
      const v = validateSkeleton(v2)
      if (v.errors.length) throw new Error('importação rejeitada: ' + v.errors.slice(0, 3).join('; '))
      skeleton = v2
      selected = new Set()
      status(`importado "${file.name}" — ${skeleton.joints.length} juntas`)
      render()
    } catch (err) {
      status(String(err?.message ?? err), true)
    } finally {
      ev.target.value = ''
    }
  })
  $('#sk-save')?.addEventListener('click', () => {
    try { localStorage.setItem(STORAGE_KEY, toJSON(skeleton)); status('skeleton v2 guardado neste browser') } catch (err) { status('falha a guardar: ' + err, true) }
  })
  $('#sk-load')?.addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) { status('nada guardado ainda', true); return }
      skeleton = JSON.parse(raw)
      selected = new Set()
      status('skeleton v2 carregado')
      render()
    } catch (err) { status('falha a carregar: ' + err, true) }
  })
  $('#sk-export')?.addEventListener('click', () => {
    const v = validateSkeleton(skeleton)
    if (v.errors.length) { status('exportação bloqueada — corrige os erros', true); return }
    const blob = new Blob([toJSON(skeleton)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${skeleton.name || 'skeleton'}.v2.json`
    a.click()
    URL.revokeObjectURL(a.href)
    status(`exportado ${a.download} (${skeleton.joints.length} juntas)`)
  })

  render()
}
