# NSAMBO Rig-Align v2 — PASSAGEM DE AUDITORIA (auto-auditoria, 2026-11-27)

> **Aviso de independência**: isto NÃO é a aprovação independente que a spec exige. Não tenho
> neste ambiente um agente auditor separado — é uma auto-auditoria executada pelo mesmo autor
> do código, contraposta à spec v2.0 item a item, sem benefícios da dúvida. A aprovação final
> (Nível 1) continua **em aberto**.

## Método
Cada item da spec v2.0 → estado verificável (teste/probe/contagem) → veredito.

## Parte I — decisões de arquitetura

| # | Requisito | Evidência | Veredito |
|---|-----------|-----------|----------|
| 1 | Uma única hierarquia de deformação; nunca dois esqueletos ativos | O ANIMAÇÃO/rig do jogo deriva **só** das âncoras; GLB tinha 0 skins; vista de pesos usa o mesmo StalkerRig | ✅ cumprido no caminho atual |
| 2 | GLB pode ser identificado/analisado; utilizador escolhe preserve/edit/replace | «Inspetor GLB» no editor + relatório completo (meshes/nós/skins/anims/materiais) — 0 skins identificado e declarado | ✅ (fluxo existe; a escolha preserve/replace é manual mas informada) |
| 3 | Estado original copiado antes de alterações | `stalker.rig.json`/`stalker.glb` nunca escritos pelos botões; «Normalizar pesos» só descarrega JSON; backup em git | ✅ |
| 4 | Identidade do rig + versão de schema; `nsambo-rig-align@1` legível | `nsambo-rig-align@2` definido; `fromV1()` migra; testes provam | ✅ |
| 5 | IDs estáveis + sufixos L/R anatómicos | `skeleton-schema.mjs`: regex `_L|_R`, pares validados, renomeia em cascata | ✅ testado |

## Parte II — anatomia expandida e categorias

| # | Requisito | Evidência | Veredito |
|---|-----------|-----------|----------|
| 6 | root/pelvis/spine_01..03/chest(+L/R/sternum)/clavícula/shoulder/scapula | template humanoide: 99 juntas inclui tudo | ✅ |
| 7 | Braços completos + mãos (polegar + 4 dedos × multi-segmento, configurável) | thumb_01..03, index/middle/ring/pinky ×3 ×2 lados — configurável via edição na Builder | ✅ (segmentos fixos em 3; "configurável" = adicionar/remover na UI, não nº arbitrário) |
| 8 | Pernas + pés (calcanhar/bola/big-toe) + heel/ball | foot_heel/foot_ball/toe_big×2 + toe_02..05×3 | ✅ |
| 9 | Cabeça: jaw/chin/nose/eyes/ears/brows/mouth | presentes; jaw=skeletal, brow/mouth=facial-controller, resto=anatomical-reference | ✅ |
| 10 | Categorias skeletal/anatomical-reference/facial-controller/deformation-region | JOINT_CATEGORIES + validação (facial-controller não deforma; deformation-region não suporta skeletal pertinencia regras) | ✅ |
| 11 | Extensibilidade não-humana (cauda/asas) | teste executável `skeleton-schema.test.mjs`: cauda de 4 juntas (skeletal) valida e atravessa `toEngineJoints` | ✅ (exemplo provado por teste; cauda/asas reais são conteúdo do jogo) |
| 12 | Suffixo L/R + identificadores estáveis | ver #5 | ✅ |

## Parte III/IV — GLB inspector / Skinning Engine

| # | Requisito | Evidência | Veredito |
|---|-----------|-----------|----------|
| 13 | Inspetor GLB com relatório (antes do rig) | editor + `glb-inspect.mjs`: contagens, atributos, bbox, somas de pesos, materiais | ✅ testado headless |
| 14 | Pesos reais: normalização (esparsidade preservada) | `normalizeWeights` v3: zeros ficam zeros, soma exata 255 | ✅ testado (idempotência incluída) |
| 15 | Visualização de influência por junta | vista «Ver pesos» (ramp blender) com legenda | ✅ testado headless |
| 16 | **Edição** de pesos (brush/paint) no editor | não existe — só ver/normalizar | ❌ **em falta** |
| 17 | Deteção cross-region (braço↔perna) com limiar | análise reporta 469 verts (5.4%); teste de isolamento protege zeros | ✅ deteção · ⚠️ correção exige pintura manual |

## Parte V — Animation Engine

| # | Requisito | Evidência | Veredito |
|---|-----------|-----------|----------|
| 18 | Animação aciona o rig REAL (o mesmo que o jogo usa) | editor ANIMAÇÃO via `animated-stalker.js` → `StalkerRig` (CPU skinning real) | ✅ |
| 19 | IK/FK, limites | o StalkerRig usa TwoBone IK (`solveTwoBone`) nas pernas; FK nos outros | ✅ (FK+IK no jogo/editor) |
| 20 | Bateria: cabeça/pescoço, ombro, braço, mão, pélvis/coluna, perna, pé + combinadas + extremas | testes de isolamento 8 subárvores (±0.7 rad) + combinada/extrema (±1.2 rad, sem NaN) | ✅ headless · ⚠️ ainda não há portão visual por pose no editor |

## Parte VI/VII — Deformation Validator / Export

| # | Requisito | Evidência | Veredito |
|---|-----------|-----------|----------|
| 21 | Tolerâncias normalizadas pela malha (≤ 0.1 mm = invisível a ~2 m) | limiar 1e-4 m nos testes de isolamento | ✅ |
| 22 | Testes de isolamento cross-member | 8 juntas × 2 sinais; exige zero-peso = zero deslocamento | ✅ |
| 23 | Export GLB preservando geometria/materials/skins/weights | `glb-export.js`: POSITION/NORMAL/UV/índices **byte-idênticos**; material copiado; skin 21 juntas; IBM = translate(−rest) | ✅ testado (reimport "nível de dados") |
| 24 | Reimport obrigatório | `test/rig-export.test.mjs` (7 provas) **+** `probe-skinned-reimport.mjs`: three.js GLTFLoader real carrega o GLB, SkinnedMesh, 21 bones, 8731 verts, 36000 índices | ✅ |
| 25 | Export JSON | `Normalizar pesos ↓` + `Exportar skeleton v2 ↓` (schema 2) + rig-data mantido | ✅ |
| 26 | Esqueleto v2 → GLB (exportar os 99) | `tools/rig-export-v2.mjs` + `skin-transfer.mjs`: pesos auto por distância inversa (k=4, somas exatas 255), GLB skinned round-trip **verificado em teste** (99 juntas, 100 nós, bind pose reconstruída). Pesos = RASCUNHO — aprovação exige a pintura manual (item 16) | ⚠️ export funcional, qualidade de pesos não-aprovada |

## Parte VIII/IX/X — processo

| # | Requisito | Veredito |
|---|-----------|----------|
| 27 | 10 fases contínuas | 🔶 fases 1–7 em curso/construídas; 8 = esta auto-auditoria; 9 (aprovação bateria completa) e 10 (relatório final) **não** |
| 28 | Zero «parece bom» — aprovação só com bateria | ✅ nenhuma aprovação emitida; estado documentado como EM ABERTO |
| 29 | Independência do auditor | ❌ não há auditor independente neste ambiente — a spec pede-o explicitamente |
| 30 | Nível 1 «Extremamente reduzido» em todos os testes obrigatórios | ❌ **não atingido** (faltam itens 16, 26, auditoria independente, portão visual) |

## O que bloqueia a aprovação final (ordem)
1. **Edição de pesos** no editor (brush + escrita no rig-data com backup) — Parte IV completa.
2. **Export v2 → GLB** ✅ (rascunho, round-trip provado) — **falta** qualidade de pesos (item 16).
3. ~~Exemplo de extensibilidade não-humana~~ ✅ cauda provada em teste.
4. **Auditor independente real** (segunda pessoa/agente) com acesso a este documento e aos testes.
5. **Portão visual no editor por pose da bateria** (head/neck… combined/extreme) com critérios objetivos.

## Estado dos testes ao fechar esta auditoria
`npm test` (app): **130/130** — inclui `stalker-anchors` (18: skinning identidade, isolamento, combinada/extrema), `rig-export` (7: reimport), `skeleton-schema` (8: v2/migração/hierarquia).
