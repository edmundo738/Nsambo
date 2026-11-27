# NSAMBO — Stalker · Auditoria visual e relatório de bugs

**Data:** 27 novembro 2026 · **Branch:** `arena/caa2461b-nsambo` · **Commit base do rig:** `282b91a` (esqueleto próprio de 21 juntas + IK por passada + ragdoll)
**Contexto:** beta `backrooms-v0.1.0-beta` · Mapa de teste: ACADEMIA (`sémente 27153`) · Modo: headless Chromium (Playwright, viewport 1280×750) e Blender 4.x (Cycles CPU, 2 núcleos)
**Âmbito:** capturar e documentar. **Nenhuma correção de jogo foi feita neste trabalho.** Todas as observações são reproduzíveis com as ferramentas listadas em §8.

---

## 1. Resumo executivo

| # | Achado | Severidade | Onde |
|---|--------|-----------|------|
| A1 | O corpo do stalker **nunca afunda nem se desfaz** após a morte — `sinkT` permanece `-1` e `sinkY` permanece `0` para sempre | **Alta** | `stalker-entity.js` / jogo |
| A2 | Ecrã de loading «THE BACKROOMS · A ESTICAR O PAPEL DE PAREDE…» **persiste ~20 s** após a sala já estar jogável | **Alta** | jogo (headless) |
| A3 | HUD residual **«STALKER AINDA NÃO CARREGOU»** visível com o stalker já em cena | **Média** | jogo |
| A4 | Painel F3 alterna entre **«STALKER ausente»** e distância a saltar — mostra `ausente` virado de frente para o monstro (com ele visível) | **Média** | jogo |
| A5 | Painel F3 fica **«STALKER … m · stalk» para sempre** — nunca reflete a morte (o monstro cai e o painel continua «stalk») | **Média** | jogo |
| A6 | QA `stalkerdie` **acumula a ~¼ da velocidade real** no headless (dt clamp 0.05) | **Baixa** (ferramenta/QA) | jogo |
| A7 | 9 triângulos com **área zero no espaço UV** | **Baixa** | `stalker.glb` |
| A8 | Junta **`pelvis` sem um único vértice atribuído** (0 referências de peso) | **Média** | `stalker.rig.json` |
| A9 | **46.8% do espaço UV por preencher** (cobertura 53.2%) | **Baixa** | `stalker.glb` |
| A10 | `skin.ao.jpg` é **quase todo branco** (p95=p99=255) — o AO não escurece praticamente nada | **Baixa** | textura |
| A11 | FPS cai de **56 → 47** com o stalker na sala | **Média** (perf) | jogo |
| A12 | `page.screenshot` do Playwright **expira** ("waiting for fonts") no headless — usado `recordVideo` + ffmpeg como alternativa | n/a (tooling) | ferramentas |

Nota de honestidade: vários números "de primeira leitura" da sessão anterior (ex.: «triângulos degenerados», «emissive vazia») foram **re-medidos e corrigidos** nesta auditoria — ver §4 e §5. Só entra neste relatório o que foi verificado por medição direta.

---

## 2. O que está nesta pasta (`fotos/`)

```
fotos/
├── RELATORIO.md                     ← este documento
├── stalker/
│   ├── hero/hero-3q.png             ← hero shot ¾ (Blender Cycles, 1280×800)
│   ├── vistas/vista-01-frente.png   ← ortográficas 6 vistas (frente/costas/esq/dir/cima/baixo)
│   ├── vistas/… (vista-02-costas … vista-06-baixo)
│   └── poses/01-idle.png … 12-mandibula-aberta.png   ← 12 poses do rig real (idle→morte)
└── video/
    ├── stalker-acoes.mp4            ← VÍDEO 1 · ações do rig (idle/stalk/hunt/pounce/stagger/die) c/ legendas
    ├── stalker-in-game-headless.mp4 ← VÍDEO 2 · gameplay real headless (44.0 s, falhas documentadas)
    └── stalker-in-game-legendado.mp4← VÍDEO 3 · o mesmo, com legendas explicativas
```

**Nenhuma destas imagens/vídeos foi fabricada por IA generativa** — são renders do asset real (`assets/models/stalker.glb` + `stalker.rig.json`) e gravações/capturas reais do jogo em execução.

---

## 3. A criatura (medições diretas)

| Propriedade | Valor |
|---|---|
| Vértices | 8 731 |
| Triângulos | 12 000 |
| Juntas (esqueleto próprio) | 21 (`pelvis`, `spine1..3`, `neck`, `head`, `jaw`, `clavL/R`, `upperArmL/R`, `foreArmL/R`, `handL/R`, `upperLegL/R`, `lowerLegL/R`, `footL/R`) |
| Bounding box | y ∈ [−1.000, 0.956] → altura ≈ 1.96 m |
| Pesos por vértice | 4 (u8, soma por vértice 254–256/255) |
| `stalker.glb` | posições + normais + UV; **sem tangentes** (calculados/estimados no runtime) |
| Índice | 36000 índices (u16/u32) — 2 128 grupos de posição duplicada (+2 732 vértices), consistente com seams de UV/flat-shading |

---

## 4. Geometria, UVs, texturas e rig

### 4.1 Triângulos com área zero no espaço UV — **A7 (Baixa)**

9 de 12 000 triângulos têm **área UV = 0** (colapsados no espaço UV; no espaço de objeto têm área — não são slivers de posição). O pior caso de "sliver" em espaço de objeto é 1 triângulo com razão `minEdge²/área < 0.001`. Nenhum triângulo tem área de objeto exatamente 0 (2 têm área < 1e-8).

**Impacto:** esses 9 tris não mapeiam qualquer texel — amostras de textura ali são arbitrárias; em shaders que dependem de derivados UV (normal mapping) pode gerar shimmering localizado.

### 4.2 UVs todos-zero e cobertura — **A9 (Baixa)**

- 14 vértices (de 8 731, 0.16%) têm UV exatamente (0,0) — coincide parcialmente com zona morta do atlas.
- Cobertura rasterizada do atlas (512², preenchimento por triângulos): **53.2% preenchido → 46.8% por preencher**.
- UVs 100% dentro de [0,1] — sem wrap/fracionamento exótico.
- **Observação:** o atlas desperdiça ~metade da área — resolução efetiva da pele é metade do que o 2048² sugere.

### 4.3 Junta `pelvis` sem pesos — **A8 (Média)**

Distribuição de referências de peso por junta (soma dos 4 índices de pele por vértice):

```
 0 pelvis       refs=    0
 1 spine1       refs= 1239
 2 spine2       refs=  983
 3 spine3       refs= 1198
 4 neck         refs= 2525
 5 head         refs= 2853
 6 jaw          refs= 2102
 … (todas as restantes ≥ 983)
```

**Impacto:** o `pelvis` (raiz do esqueleto) não deforma vértice algum — toda a deformação do tronco está nas juntas `spine1..3`. A raiz continua a existir na hierarquia (propaga transformações), mas qualquer animação que espere volume controlado pela pelvis (ex.: colapso pélvico no ragdoll) não se manifesta na malha. Confirmado também no render: ver pose `11-morto-chao.png`.

### 4.4 Normais, slivers, duplicatas

- Normais válidas: 0 comprimentos anormais, 0 NaN.
- 2 128 posições duplicadas (seams de UV / hard edges) — **não é necessariamente defeito**, mas infla o buffer de vértices em ~31%.

### 4.5 Texturas (medições RGB, 8-bit)

| Textura | Dimensão | Média RGB | Notas |
|---|---|---|---|
| `skin.jpg` | 2048² | 174.5 / 167.5 / 150.3 | albedo claro, sem pixels saturados de vermelho (máx. R−max(G,B)=34) |
| `skin.normal.jpg` | 2048² | 127 / 127 / 253 | range nominal de normal map ✓ |
| `skin.roughness.jpg` | 2048² | 161.8 | rugosidade média-alta, pouca variação |
| `skin.ao.jpg` | 2048² | 187.1 · **p95 = p99 = 255** | **quase todo branco** → AO não escurece (A10) |
| `stalker.emissive.jpg` | 1024² | **99.8% de pixels a zero**; 2 046 px não-nulos (bbox x 28–351, y 168–1008); valor máx. **186**; média dos px não-nulos ≈ (27, 8, 2) | emissivo só nos olhos, por design |

**Emissive em jogo (verificado no código):** `renderer.js` → material `modelStalker` liga `stalker.emissive.jpg` como `tEmissive` com `uEmissiveMap=1` e `uEmissive = pulse`, onde `pulse = 2.75 + 0.55·sin(t·1.65+0.8)` (2.2–3.3). Ou seja, o emissivo **funciona** (olhos em brasa) — o mapa é apenas muito esparso e escuro; a consigna "emissive vazia" de leituras anteriores está **incorreta** e foi descartada.

**AO em jogo:** `stalker_pbr` usa multiply 0.88 entre albedo e AO (mesma convenção no Blender desta auditoria). Com o AO ≈ branco, o efeito é um lift quase nulo — não estraga, mas **não acrescenta profundidade**.

---

## 5. Comportamento em jogo (headless, ACADEMIA)

Evidência principal: **`fotos/video/stalker-in-game-headless.mp4`** / **`-legendado.mp4`** (44.04 s, h264, 1280×750, 25 fps, sessão com `stalkerdie=0.05` para forçar a morte QA) e as sondas de `tools/diag-stalker.mjs`.

### 5.1 Ecrã de loading persiste ~20 s — **A2 (Alta)**

- t ≈ 0–19 s: ecrã escuro com «THE BACKROOMS» e o subtítulo «A ESTICAR O PAPEL DE PAREDE…».
- t = 20 s (frame `full-20.png`): a sala **já está renderizada e jogável** (barras VIDA/FÔLEGO/LANTERNA visíveis) e **o overlay de loading continua por cima** («THE BACKROOMS · A ESTICAR O PAPEL DE PAREDE…» ao centro, «STALKER AINDA NÃO CARREGOU» sob a barra de topo, ACADEMIA visível).
- O jogo só fica limpo visualmente ~21–22 s.

### 5.2 HUD residual «STALKER AINDA NÃO CARREGOU» — **A3 (Média)**

O texto permanece no topo-centro enquanto o stalker já está **na sala, a poucos metros** (ver frames t = 21–33 s; caption «HUD residual»). O stalker está visível e ativo muito antes de o aviso desaparecer.

### 5.3 Painel F3: «ausente» com o monstro à frente — **A4 (Média)**

- t = 21–28 s: painel mostra `QUADRO POR RESTAURAR · STALKER ausente` com o stalker **encostado à cara do jogador** (flashlight on, olhos visíveis).
- Após o stalker recuar/estabilizar: `STALKER 3.3 m · stalk`.
- Em execução headless anterior, os primeiros ~3.5 s após a sala abrir exibiam **999.0 m** antes do valor real — provavelmente o placeholder/valor por defeito nunca substituído.
- Ou seja, o campo de distância/estado do painel **pisca entre ausente/999/valor real** na mesma janela de segundos.

### 5.4 Painel F3 fica «stalk» para sempre — **A5 (Média)**

- t = 30 s: `STALKER 3.3 m · stalk` · t = 33–44 s: o monstro **cai e fica no chão**; o painel nunca sai de `· stalk` (3.3 m → 3.7 m de distância stale) e nunca indica `hunt`, `die` ou `morto`.
- O campo não é atualizado quando o estado real muda (ou é alimentado por um cache que nunca invalida).

### 5.5 Morte — o corpo nunca afunda nem se desfaz — **A1 (Alta) · bug central**

O fluxo esperado (código): ragdoll assenta → `rig.ragdoll.settled === true` → `stalker-entity.js` faz `sinkT = 0` → `sinkY = −depth·k²` até `sinkT ≥ fade` (1.6 s) → `sinkT = −2` (desaparecido).

Observado (sondas `diag-stalker.mjs`, múltiplas execuções, incl. chamada manual `__game.stalker.die(0.55,-0.85,4.6)`):

- `rig.ragdoll === 'sim'` persiste indefinidamente.
- `ragdoll.settled` **nunca** vira `true` (movimento médio por junta nunca desce abaixo do limiar `0.0045` durante 0.7 s contínuos).
- Consequentemente `sinkT` fica **`-1`** e `sinkY` **`0`** para sempre — o corpo estira-se no chão e **fica lá, para sempre**, sem afundar/desfazer-se.
- O mesmo se observa no gameplay: t ≈ 33–44 s o monstro no chão não se mexe e não afunda.

**Impacto de design:** a sequência "morte → afunda/desfaz-se" (e a limpeza da entidade) nunca acontece. Em jogo, após a morte o stalker fica como um boneco inerte permanente na sala.

### 5.6 QA `stalkerdie` — lento no headless — **A6 (Baixa)**

- O dt do jogo é limitado (`Math.min(dt, 0.05)`) e o headless corre a FPS baixo (~40–56), pelo que o cronómetro QA `stalkerdie` **acumula ≈ ¼ do tempo real**.
- `stalkerdie=0.05` dispara a morte rapidamente (validado; foi o usado na gravação).
- `stalkerdie=2..5` **não dispara em 12 s** de parede (exigiria ~30–80 s+ de gravação). Não está partido — apenas não é comparável 1:1 com tempo real.
- Sondas anteriores que "não viam a morte acontecer" estavam corretas: simplesmente não esperaram tempo suficiente.

### 5.7 Desempenho — **A11 (Média)**

- FPS 56 (frame time 17.8 ms) na sala vazia → **47 (21.2 ms)** com o stalker muito próximo. Queda consistente nas amostras t = 30–44 s.

### 5.8 HUD topo: «ACADEMIA — TESTA TUDO · F3 PAINEL»

Header de debug sempre visível na build de teste — informativo, mas expõe o painel de debug a jogadores da beta. (Observação; não é defeito funcional.)

---

## 6. Renders Blender — notas de produção

- Cycles CPU (2 núcleos), denoise OpenImageDenoise, 640×360 @ 18 samples (vídeo), 880² @ 96 (vistas, após re-enquadramento), 1280×800 hero @ 128.
- A câmara e a luz foram afinadas para **fundo void escuro com spotlight no chão**; um defeito real foi encontrado e contornado no **script de render** (não no jogo): `primitive_circle_add` sem `fill_type='NGON'` criava um círculo **sem faces** (chão invisível / sombra projectada no vazio) — corrigido para renders.
- As vistas ortográficas usaram inicialmente **frente/costas e esquerda/direita trocadas** no script — corrigido (a criatura encara −Y; a sua esquerda é +X). Os PNGs antigos foram descartados e re-renderizados.
- O **track de animação** do vídeo de ações foi exportado do rig real em runtime (`tools/pose-export.mjs track`, 24 fps, 216 frames, 8731 vértices, posições+normais scikit) e inclui: IDLE (f 0–35) · STALK (36–83) · HUNT (84–131) · POUNCE (132–147) · STAGGER/recuo pela lâmina (148–161) · DIE/ragdoll (162–215).
- **Atenção:** o Blender não mostra a transição "afundar/desfazer-se" porque ela **não existe** (A1) — o vídeo de ações documenta o comportamento real do rig, não o design-alvo.
- As 12 stills de pose (`poses/`) partilham o mesmo void de estúdio e as mesmas luzes — coerentes entre si.

---

## 7. Limitações do método (importante para não sobre-ler o relatório)

1. **Headless ≠ GPU real.** FPS, frame time e até o "tempo até à morte" diferem de uma máquina com GPU/WebGL completo. Os bugs A1–A5 são de **lógica**, não de desempenho, e replicaram-se em múltiplas execuções — mas não foram validados num browser com GPU.
2. **Sem input real de jogador.** A gravação é em modo observação (a personagem não anda); "stalker aproximou-se do jogador parado" é o comportamento esperado do AI, não uma confirmação de pathfinding completo.
3. **`page.screenshot()` do Playwright nesta build expira** ("waiting for fonts") — a evidência visual vem de `recordVideo` + frames extraídos com ffmpeg (pasta `/tmp/observe` no ambiente de trabalho, não versionada).
4. **Blender Cycles em 2 CPU** é demasiado lento para re-renderizações iterativas grandes; o vídeo de ações foi renderizado a baixa resolução (640×360) por esse motivo.
5. **A contagem de triângulos/UV foi medida no GLB**, não na malha após skinning (a deformação não altera a topologia).
6. **Não foram auditados**: shader GLSL passo a passo, colisões físicas do ragdoll contra a geometria da sala, áudio, nem outras salas/mapas.
7. Nenhum bug foi corrigido neste trabalho, por instrução explícita.

---

## 8. Como reproduzir a auditoria

```bash
# 1. Auditoria de geometria/UV/pesos (Python + numpy + PIL)
python3 - <<'EOF'  # (ver comandos na secção 4 — leitores GLB/B64 inline)
EOF

# 2. Skin weights por junta
python3 -c "import json,base64,numpy as np; \
rig=json.load(open('assets/models/stalker.rig.json')); vc=rig['vcount']; \
idx=np.frombuffer(base64.b64decode(rig['w4']),dtype=np.uint8).reshape(vc,4); \
print(np.bincount(idx.reshape(-1), minlength=21))"
# → [0, 1239, 983, 1198, 2525, 2853, 2102, 1473, 1774, 1995, 1983, 1583, 1918,
#     1605, 1703, 1786, 1630, 1945, 1759, 1558, 1312]   (índice 0 = pelvis → 0)

# 3. Poses + track do rig real
node app/tools/pose-export.mjs /tmp/poses          # poses OBJ
node app/tools/pose-export.mjs /tmp/track track    # 216 frames .bin + track.json

# 4. Renders headless (Blender)
LD_LIBRARY_PATH=/tmp/stublibs python3 app/tools/render_stalker.py --hero /tmp/out
LD_LIBRARY_PATH=/tmp/stublibs python3 app/tools/render_stalker.py --views /tmp/out2
LD_LIBRARY_PATH=/tmp/stublibs python3 app/tools/render_stalker.py --poses /tmp/poses /tmp/out3
LD_LIBRARY_PATH=/tmp/stublibs python3 app/tools/render_stalker.py --video /tmp/track /tmp/frames

# 5. Jogo headless + gravação
node app/tools/record-game.mjs      # requer dev server + Playwright + ffmpeg (ver script)
node app/tools/diag-stalker.mjs     # sonda __game.stalker (sinkT, ragdoll, painel F3…)
```

Ficheiros de apoio criados para esta auditoria (versionados neste commit): `app/tools/render_stalker.py`, `app/tools/pose-export.mjs`, `app/tools/record-game.mjs`, `app/tools/diag-stalker.mjs`.

---

## 9. Evidência visual rápida (mapa de ficheiros)

| Ficheiro | Mostra |
|---|---|
| `stalker/hero/hero-3q.png` | Forma geral, postura "presa alta", olhos vermelhos |
| `stalker/vistas/vista-01..06-*.png` | Geometria ortográfica 6 lados (proporções, costas, baixo) |
| `stalker/poses/01-idle.png` … `12-mandibula-aberta.png` | Ciclo idle→caçada→bote→recuo→queda→morto no chão→mandíbula aberta |
| `video/stalker-acoes.mp4` | Ação completa com legendas por segmento (IDLE/STALK/HUNT/POUNCE/STAGGER/DIE) |
| `video/stalker-in-game-headless.mp4` | Gameplay real: loading 20 s, stalker aparece, painel ausente/stalk, monstro no chão no fim |
| `video/stalker-in-game-legendado.mp4` | O mesmo, com legendas explicativas PT |

---

## 10. Não corrigido (intencional)

Por instrução, **zero correções no jogo**. O que ficaria para um pedido de correção (não implementado):

1. `stalker-entity.js`: garantir que `ragdoll.settled` dispara (rever limiar `0.0045`/tempo `0.7 s` no headless, ou forçar `sinkT=0` após N segundos de ragdoll), para que `sinkT`/`sinkY` avancem e a entidade desapareça de facto.
2. Loading overlay: esconder/remover o `#loading` quando a sala termina de carregar (listener de `load`/primeira frame), eliminando a persistência de ~20 s e o residual «STALKER AINDA NÃO CARREGOU».
3. Painel F3: alimentar distância/estado diretamente de `stalker-entity` a cada frame (sem cache), tratando `ragdoll` como `die`.
4. `stalker.rig.json`: re-pintar pesos do `pelvis` (bordas de `spine1`/pernas) ou remover a junta se for deliberado.
5. Atlas UV: re-pack para recuperar os 46.8% vazios (metade da resolução efetiva desperdiçada).
6. `stalker.glb`: soldar as 2 128 posições duplicadas onde não forem seams; eliminar os 9 tris de área UV zero.
7. `skin.ao.jpg`: regerar com oclusão real (ou descartar o multiply).
8. QA: cronómetro `stalkerdie` em segundos de jogo, não em acumulador com dt clamped.

---

*Documento gerado como parte da auditoria visual do stalker (27-11-2026). Nenhum ficheiro de jogo foi alterado neste trabalho; as ferramentas em `app/tools/` são apenas de leitura/auditoria.*
