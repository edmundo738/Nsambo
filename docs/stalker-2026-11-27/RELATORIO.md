# Stalker — auditoria de rig + weight painting (2026-11-27)

> «corrija o monstro… procure todos os defeitos… corrija todos problemas de
> Artefactos de Morfologia e Erro de Weight Painting»

## Fotos

| Ficheiro | O que mostra |
|---|---|
| `stalker-before-after.jpg` | 12 poses × antes/depois (grelha completa) |
| `stalker-compare.jpg` + `cmp-1..3.jpg` | antes/depois em detalhe (6 poses-chave) |
| `cmp-heads.jpg` | zoom na cabeça (jaw/crânio/braços) |
| `poses-antes/` `poses-depois/` | os 24 renders individuais (CYCLES, 64 spp) |
| `game-new-1.png` `game-new-3.png` | o jogo com o novo build em `:4180` (stalk + hunt) |
| `preview-tab.png` | nova aba **«▶ Preview · Animação»** no rig-align |
| `preview-heatmap.png` | mapa de deformação por vértice (deslocamento) |

## O que estava mal (medido em `assets/models/stalker.rig.json` original)

1. **Jaw no crânio** — 1474 vértices dominantes pela mandíbula no topo do crânio
   (y ∈ [0.47, 0.96]); a soma de pesos de jaw na zona do crânio era **854**
   contra 811 do osso `head`.
2. **Braços no crânio** — 897 unidades de peso dos ossos dos braços em y > 0.46
   (deltoide → testa).
3. **Pélvis sem donos** — 0 vértices dominantes (deformava só com `spine2/3`);
   `spine1` com 42; `neck` com 4.
4. **Pés abandonados** — `footR` dominante em apenas **8** vértices.
5. **Mãos assimétricas** ao bind (L 188 / R 345 no v2, L 419 / R 565 no original)
   e bind pose ≠ pose de repouso do rig (hands curl constante 0.28 rad) —
   deslocamento bind→idle até 28 cm (esperado: não é bug, é design do rig).

## O que foi feito

### 1) Weights repintados (`tools/reskin_stalker2.py`)
- Cápsulas (segmento+raio) por osso com **suporte compacto** — zero fora de
  `d ≤ r·1.22` (o v1 usava queda relativa e sangrava nos braços).
- **Máscaras anatómicas por osso**: crânio só aceita head/jaw/neck
  (y ≥ 0.40); jaw só à frente (z ≥ 0.055); braços/pernas confinados ao lado
  ±x e à faixa y; pés na faixa y ∈ [−1.02, −0.70].
- 4 iterações de difusão laplaciana na malha soldada (5995 posições únicas),
  gateadas pelas máscaras → costuras suaves sem vazamentos.
- Top-4 → uint8, soma 254–256 ✓
- **Resultado**: jaw→crânio 854→**12.0**; braços→crânio 897→**12.0**;
  jaw dominante 1474→**43**; pelvis 0→**327**; spine1 42→**123**;
  footL/R dominantes **515/424**; zero vazamentos entre lados (checked).

### 2) Bone explosion / gimbal / limites (`stalker-rig.mjs`)
- `env` sanitizado na entrada (NaN/Infinity → fallback; speed ≤ 8;
  hunt01/pounce01/stagger01 ∈ [0,1]; lookYaw ±0.62; lookPitch −0.34..0.40).
- `lean` clampado [−0.30, +0.30] rad; pescoço segue parcialmente o olhar
  (yaw ≤ ±0.14 rad) — a cabeça nunca fica «destacada» 90° sobre o pescoço;
  jaw ≤ 0.56 rad; ombro ≤ [−0.9, 1.95] rad e abdução ≤ 0.45 rad; pés ≤ ±0.42;
  cotovelo já estava [0.08, 2.40] rad.
- **Gimbal lock não existe neste rig** (tudo quaternions; zero Euler) — o
  «bloqueio» de ombros/pescoço era a cabeça absoluta ignorando a espinha.

### 3) Preview animado em tempo real («▶ Preview · Animação» no rig-align)
- Corre o **mesmo `stalker-rig.mjs` do jogo** com os pesos atuais de
  `/models/stalker.rig.json`, ao vivo no browser (PBR + skinning CPU).
- Cenários (Parado/Espreita/Caça/Bote/Recuo/Mandíbula), sliders dos mesmos
  parâmetros que o jogo manda, slider de velocidade com walkDist automático,
  Morte (ragdoll), **↻ Rig.json** para recarregar os pesos sem reload da página.
- **Mapa de deformação** (hue azul→vermelho por vértice deslocado) + HUD com
  fps, desvio máx/médio e nº de vértices > 12 cm — a olho nu vês onde o modelo
  estica depois dos teus ajustes.
- Mostrar juntas (21) e linhas dos ossos; wireframe; órbita livre.

### 4) Medições antes→depois (stress test `app/tools/stress-test.mjs`)

| Região | p50 antes | p50 depois | arestas >30% antes | depois |
|---|---|---|---|---|
| crânio | 35.1 cm | **27.4 cm** | | |
| torso | 24.3 cm | **18.2 cm** | | |
| braço Esq | 46.8 cm | **36.1 cm** | | |
| perna Esq | 43.6 cm | **40.2 cm** | | |
| médio total | 24.2 cm | **21.2 cm** | ~4119/fr | **~2840/fr** (−31 %) |

Nota honesta: deslocamento médio ≠ qualidade por si (um braço rígido a 120°
desloca muito) — o sinal mais limpo é o edge-stretch: **−31 %** de arestas
rasgadas sem morte, e melhoria também com o ragdoll.

## Verificação

- `npm test` (app) — **91/91** ✓
- Poses OBJ (`app/tools/pose-export.mjs`) renderizadas no Blender (CYCLES) —
  corpo coerente em todas; sem bone explosion; sem esparguete.
- Jogo ao vivo em `:4180` — stalk a 3.8 m e hunt a 4.2 m coerentes,
  48 fps (headless CPU).

## Notas honestas / limitações

- As fotos «depois» foram renderizadas com o **novo re-skin mas com o rig
  anterior** aos clamps de ROM (os clamps raramente entram em ação fora dos
  extremos) — o build em `:4180` inclui tudo.
- O heatmap mede |out−rest| — útil para detetar explosões, não mede
  qualidade artística; usa-o para apanhar picos (>30 cm) e verts quentes.
- `pose-export` consome o rig.json diretamente; o jogo em `:4180` também.
  O rig-align (5173) tem a aba de Preview — depois de qualquer ajuste a
  pesos/rig, o botão **↻ Rig.json** reflete o novo estado na hora.
- Mudanças locais, por commitar/push — à tua espera para decidir.
