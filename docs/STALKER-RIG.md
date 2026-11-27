# STALKER — esqueleto próprio + IK + ragdoll (2026-11-27)

> «O stalker hoje só se arrasta.» → passou a andar, caçar, rosnar e morrer no chão.

## O que foi construído

O stalker definitivo (`white_mesh.glb`, 12 mil tris) passou a ter **um rig real**,
mas escrito à mão no motor — sem depender de Three.js, glTF skins ou bibliotecas
Externas. Tudo é dados + matemática (Quaternions próprios em `engine/math.js`).

| Peça | Ficheiro | Resumo |
|---|---|---|
| **Rig + IA de pose** | `app/src/backrooms/game/stalker-rig.mjs` | `Skeleton` (FK topológica), `StalkerRig` (pelve, espinha, cabeça, mandíbula, pernas IK, braços FK), `StalkerRagdoll` (verlet + constraints de osso) |
| **Entidade** | `app/src/backrooms/game/stalker-entity.js` | ciclo de vida: spawn/strike(pounce)/stagger/die; skinning por vértice para o `renderer.updateDynamic` |
| **Pesos** | `assets/models/stalker.rig.json` | 21 juntas, posições bind, pesos top-4 (uint8 ×4/vértice, base64) |
| **Malha** | `assets/models/stalker.glb` | reindexada via **xatlas** (8731 v / 12000 f) — atlas sem fragmentação |
| **Testes** | `app/test/stalker-rig.test.mjs` | 11 testes node:test (IK, FK, ragdoll, skinning) |

## Como funciona

1. **Bind = rest** — a bind pose É a pose autoral do white_mesh (zero rotações);
   `skinM = world · invBind` com `invBind = translate(−rest)`.
2. **FK** — juntas avaliadas em ordem topológica (`ORDER`), local→mundo por
   `worldQ = worldQ[pai] · lq`, `worldM = worldM[pai] · mat4FromTQ(local, lq)`.
3. **IK de dois ossos** (pernas e, opcionalmente, braços) — `solveTwoBone(hip,
   alvo, L1, L2, pólo)`: triângulo-cosenos resolve as duas articulações; o alvo
   do tornozelo é `rest + gait·(fwd, lift)` no **espaço do modelo** (os pés
   assentam no chão do modelo, y ≈ −0.95 — a origem NÃO está no chão).
   O pólo é a própria direção bind joelho←anca, pelo que o joelho nunca vira
   para trás.
4. **Passada calculada** — `phase = walkDist / 1.52 · 2π`; elevação do pé
   `max(0, cos)·0.165·gait`, avanço `sin·0.47·gait`; pés sempre plantados no
   contacto, passos opostos (π de desfasagem).
5. **Cabeça pot-latch** — olhar absoluto (yaw/pitch) limitado a ±0.62 rad com
   micro-saccades (`sin` de alta frequência amortecido) — nunca passa de um
   olhar de predador, não é livre.
6. **Mandíbula** — abre com o estado (hunt 0.85, stalk 0.30…) e em pounce/recuo,
   com wobble senoidal para não parecer mecânica.
7. **Ragdoll** — ao morrer, a pose final vira simulação verlet: partículas nas 21
   juntas, `constraints` de comprimento bind (iterações de relaxação), chão no
   `min(rest[footL], rest[footR]).y`, atrito, e reconstrução de orientação por
   `qFromTo` (osso a osso, propagando delta aos sub-árvores).
8. **Skinning** — LBS na CPU, 4 influências, normais/tangentes rotacionadas pelo
   3×3 (rígido — sem shear), `updateDynamic('stalker', …)` no renderer.
   Custo medido: **≈1.3 ms/frame** (8731 vértices) — acima disso, o stalker só
   anima pele quando está a ≤22 m (longe, a IA acumula ticks de 150 ms e a pose
   fica congelada).
9. **Adaptável** — o `Skeleton`/`StalkerRig` lê **só** um `rig.json`
   `{joints:[{n,p,pos}], w4, v4, vcount}`; qualquer malha com um rig destes
   (gerado por Blender ou à mão) anima sem mexer no motor.

## Estados e env

`state`: `dormant | roam | investigate | stalk | hunt | lost` · `speed`,
`walkDist`, `hunt01`, `pounce01`, `stagger01`, `lookYaw`, `lookPitch` (rad,
relativos ao corpo), `time`, `dt`.

## QA

- `cd app && npm test` — **91/91** (inclui `test/stalker-rig.test.mjs`: IK, FK, ragdoll, skinning)
- `node tools/shot-once.mjs out.jpg "autostart=1&gym=1&stalkerdemo=1&stalkerdist=3.0&pitch=0.03"` — screenshot headless
- `…&stalkerdie=0.35` — dispara o ragdoll 0.35 s após o load (visual da queda)
- `F3` → painel ACADEMIA · menu **build** → ação «killStalker» (ragdoll)
- deslocamento bind→dormância auditado vértice a vértice (cabeça/mãos ≤ ~0.2 m,
  dominado pelas constantes de pose intencionais; tronco < 2 cm)

## Auditoria 2026-11-27 — weight painting + limites de pose

**Problemas encontrados (medidos em `assets/models/stalker.rig.json` original):**

| # | Sintoma | Medida antes |
|---|---|---|
| 1 | Jaw domina o crânio inteiro (verts dominantes no crânio) | 1474 → **43** (v2) |
| 2 | Ossos dos braços com peso dentro do crânio (y > 0.46) | 897.1 u → **12.0 u** (massa) |
| 3 | Pélvis com 0 vértices dominantes; spine1 com 42; neck com 4 | → 327 / 123 / 0 (pescoço fino, de propósito) |
| 4 | Pés sem atribuição real (footR dominante em 8) | → footL 515 / footR 424 |
| 5 | Mãos dominadas pelo osso oposto / rádio-assimétricas | L 188 / R 345 (simetria bind) |

**Correção (`tools/reskin_stalker2.py`):**
pesos top-4 por vértice a partir de cápsulas (segmento+raio) com **suporte
compacto** (zero fora de d ≤ r·1.22) + **máscaras anatómicas por osso**
(faixa y, lado ±x, z à frente para a jaw; y ≥ 0.40 pertence **só** a
head/jaw/neck) + 4 iterações de difusão na malha soldada, gateadas pelas
máscaras. Nenhuma influência atravessa o crânio/braços desde 2026-11-27.

**Limites de rotação e anti explosão de ossos (`stalker-rig.mjs`):**
- `env` sanitizado na entrada (NaN/Infinity/±∞ → fallback; speed ≤ 8;
  hunt01/pounce01/stagger01 ∈ [0,1]; lookYaw ±0.62; lookPitch −0.34..+0.40)
- `lean` da espinha clampado a [−0.30, +0.30] rad (nunca retroflexa/hipertensa)
- pescoço segue parcialmente o olhar (yaw ≤ ±0.14, pitch ≤ [−0.12, +0.30]) —
  a cabeça nunca fica virada em cima de um pescoço estático
- jaw clampada a ≤ 0.56 rad; pés ≤ ±0.42 rad; braços (ombro) ≤ [−0.9, +1.95] rad
  e abdução ≤ 0.45 rad; cotovelo já clampado [0.08, 2.4] rad
- IK de dois ossos inalterado (alvo sempre clampado a reach min/max, pólo bind)

**Gimbal lock:** impossível neste rig — toda a composição é por quaternions
(`qMul/qX/qY/qZ`), sem ângulos de Euler em sítio nenhum; cada junta guarda só a
rotação local. O «bloqueio» visual de ombros/pescoço que se podia ver era a
cabeça absoluta a ignorar a espinha; corrigido com o pescoço a seguir
parcialmente o olhar (ver acima).

**Validação:** `node app/tools/pose-export.mjs <dir>` (poses OBJ pelo próprio
rig) + `render_stalker.py --poses` (fotos antes/depois) e `npm test` 91/91.
Animação em tempo real no rig-align (`/rig-align.html`): botão **«▶ ANIMAÇÃO»**
na própria aba «3D · Modelo GLB» — corre o mesmo código do jogo sobre o mesmo
GLB do editor, com o esqueleto derivado **exclusivamente das âncoras A…I2 do
utilizador** (pesos de `stalker.rig.json` intactos, posições do bind antigas
ignoradas; espinha/clavículas/ancas/cabeça derivadas por frações fixas e
documentadas em `app/src/rig-align/animated-stalker.js`). Sem coexistência de
dois esqueletos; as âncoras editadas durante a animação aplicam-se ao vivo.

