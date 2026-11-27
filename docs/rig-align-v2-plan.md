# NSAMBO Rig-Align v2.0 — Plano de Reconstrução (spec v2.0)

> Branch `arena/caa2461b-nsambo` · início 2026-11-27 · audite antes de reconstruir (spec, parte I)
> Este documento é o mapa de fases e o registo honesto do estado. Nenhuma fase se declara
> concluída sem teste executável ou inspeção medida.

## Decisões de arquitectura (spec parte I, aplicadas)

1. **Uma única autoridade**: o esqueleto definido pelo utilizador (âncoras) é a única fonte de
   deformação. O esqueleto derivado do GLB é *analisado e identificado*, nunca aplicado
   sobre a geometria junto com o esqueleto do utilizador. O estado original é copiado antes
   de qualquer alteração (`rig-data/` + backup do JSON antes de gravar).
2. **Schema**: `nsambo-rig-align@1` continua legível (compat). O formato novo ganha
   `schema: "nsambo-rig-align@2"` com identificadores estáveis, categorias e sufixos L/R.
3. **Anatomia**: hierarquia extensível (root/pelvis/spine_01..03/chest[+sternum]/clavículas/
   escápulas/braços/mãos com dedos multi-segmento/pernas/pés/cabeça[+maxilas/nariz/olhos/
   ouvidos/sobrancelhas/boca]). Categorias: `skeletal` | `anatomical-reference` |
   `facial-controller` | `deformation-region`. Extensível a não-humano (cauda/asas).
4. **glTF/Three.js**: Skinning por LBS com `JOINTS_0`/`WEIGHTS_0`/`inverseBindMatrices`
   (glTF 2.0 §armature, Blender manual §armatures/weight paint/IK — referências consultadas:
   khronos glTF 2.0 spec e docs.blender.org/manual/en/latest/modeling/meshes/armatures.html;
   three.js Skinning via `SkinnedMesh` + `Skeleton`).

## Fases (spec parte I) e estado real

| Fase | Entrega spec | Estado |
|------|--------------|--------|
| 1 | Auditoria da arquitectura (anchors→joints→weights→animação) | ✅ `docs/rig-audit-2026-11-27.md` + `app/tools/rig-audit2.mjs` (medido) |
| 2 | Inspetor GLB (report antes do rig) | ✅ CLI + painel «Inspetor GLB» no editor (medido, read-only, verificado headless) |
| 3 | Skeleton Builder (UI de construção/edição) | ✅ tab «Esqueleto v2»: templates preservar(21)/humanoide(99)/vazio, import v1→v2, id/nome/pai/categoria editáveis, validação ao vivo, export bloqueado por erros, localStorage — verificado headless |
| 4 | Skinning Engine (pesos reais: ver/editar/normalizar) | 🔶 vista de pesos + normalização sparsity-preserving + auto-paint de distância inversa (rascunho) + testes; **brush/pincel NÃO** |
| 5 | Animation Engine (rig real, IK/FK, limites, bateria de poses) | 🔶 ANIMAÇÃO no editor (rig real das âncoras) + bateria headless de isolamento/combinada/extrema em `test/stalker-anchors.test.mjs`; portão visual no editor NÃO |
| 6 | Deformation Validator (normalizado à malha; isolamento) | 🔶 matriz de isolamento por subárvore real (8 juntas × ±0.7 rad; limiar 0.1 mm) + invariantes de pose extrema — integrado em `npm test`; validador como UI/portão NÃO |
| 7 | Export GLB+JSON + reimport obrigatório | ✅ GLB skinned (geometria/índices/material byte-idênticos, skin 21 juntas, IBM=translate(−rest)) + 7 testes de round-trip + prova no renderer real (probe three.js GLTFLoader) + export v2 humanoide (99 juntas, pesos auto rascunho) |
| 8 | Auditor independente | ❌ NÃO há auditor independente neste ambiente (sem agente separado) — auto-auditoria em `docs/rig-auditor-2026-11-27.md`; aprovação Nível 1 **não emitida** |
| 9 | Aprovação por bateria completa (Nível 1) | ⬜ não iniciado |
| 10 | Verificação final + relatório | ⬜ não iniciado |

## Regras que se mantêm

- Jogo intocado até ordem explícita; só `vite.config.build.js`.
- Botão Normalizar pesos **só descarrega JSON corrigido** — não altera `assets/models/stalker.rig.json`.
- Ligar inconsistências → corrigir primeiro a fonte (`stalker-anchors.mjs`), não o sintoma.

## Estado dos testes

- `npm test` (app): **130/130 a 2026-11-27** — inclui `stalker-anchors` (18), `rig-export` (7, reimport obrigatório),
  `skeleton-schema` (9, v2/migração/cauda), `skin-transfer` (5, auto-paint draft).
- Regressão medida no audit: 8731 verts · somas 254–256 (8.95% ≠ 255) · headDom 2938 ·
  neckDom 0 · braço∩perna 469 verts.
