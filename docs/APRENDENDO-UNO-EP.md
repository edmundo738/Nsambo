# APRENDENDO COM A UNO EP / "UNO COM ESCADA"

**Ficheiro-fonte:** `/tmp/arena-coding-uploads/index.html` — 8.182 linhas, ~617 KB, PT-BR, único ficheiro, WebGPU puro. Título na página: "Uno com escada — circuito · Fiat Uno Mille EP 1996".
**Data da análise:** 2026-11-25. **Método:** leitura direta do ficheiro (estrutura de 30 módulos concatenados, 47 módulos WGSL, laço principal e APIs), não um resumo.

**O que o ficheiro é:** um simulador de condução arcade-realista de ficheiro único, zero assets: circuito original com pit lane e arquibancada, física própria de 4 rodas (1/120 s), câmbio automático de 5 marchas, derrapagem/fumaça/marcas de pneu, clima de fim de tarde com sol baixo, céu volumétrico assado, câmeras de TV, piloto automático, benchmark roteirizado de 60 s, replay de comandos e síntese de som em tempo real — tudo gerado proceduralmente no arranque.

---

## 1. Escala real do projeto (métricas levantadas do ficheiro)

| Métrica | Valor |
|---|---|
| Linhas totais | 8.182 (PT-BR, comentários densos explicando *porquê*) |
| Módulos JS concatenados (`// ---- NN_nome.js`) | 30 |
| Módulos WGSL (`WGSL["nome"]`) | 47 |
| Seções maiores | `32_props.js` 849 · `30_car_*.js` 767 · `33_veg_*.js` 784 · `50_som.js` 270 · `45_game.js` 267 · `20_renderer.js` 363 |
| Tamanho do vértice | **36 bytes** interleaved: pos f32x3 · normal **snorm16x4** (w livre, ex.: balanço) · uv f32x2 · mat u8x4 · cor unorm8x4 |
| Índice | Uint32 com baseVertex-like chunking; buffers grandes (`1<<18` vértices em placeholders) |
| Céu | `SKY_W×SKY_H = 4096×1024` equirect assado; nuvens volumétricas raymarchadas; atmosfera Rayleigh+Mie+ozônio, 28 passos |
| Sombras | 3 cascatas dinâmicas 2048² + 1 mapa estático do mundo 4096² |
| Ambiente | Cubemap 512, 7 mips pré-filtrados à mão; irradiância de ambiente por SH calculada em 2 rodadas (rebote) |
| TAA | reprojeção + clipping por variância em YCoCg + histórico bicúbico; motion blur McGuire com 2 etapas por bloco |
| Bloom | downsample 13 taps com média de Karis → upsample tenda 3×3 (aditivo) |
| Exposição | log-average com adaptação temporal (watts) |
| Física | passo fixo **1/120 s**, zero alocação, transferência de carga, elipse de atrito, FWD, câmbio automático, freio de mão, curva de torque própria |
| Áudio | síntese **100% algorítmica** (sem amostra), 6 camadas mixáveis, 16 controles inteiros/quadro, AudioWorklet + fallback ScriptProcessor + render offline determinístico |
| E2E/QA | `window.__cap` com `frames/shot/pose/poses/tvView/state/reset/som*` — o jogo é dirigível por script |

**Layout do código (build por concatenação):** `00_math → 01_gpu → 02_mesh → 10_track → 11_worldmap → 20_renderer → 21_post → 22_sky → 23_forward → 30_car_a..d → 31_world → 32_props → 33_veg_a..d → 40_vehicle → 42_ai → 44_fx → 45_game → 46_replay_data → 47_perf → 48_poses → 50_som → 51_painel → 52_ui → 90_main`.

---

## 2. Como o ficheiro funciona, camada por camada

### 2.1 Matemática sem alocação (`00_math.js`)
- Tudo escreve em out-params: `m4mul(o,a,b)`, `m4inv`, `m4persp`, `m4lookAtV`. Zero objetos temporários no hot path (nem números em caixa entre funções grandes).
- **Projeção de Z invertido com plano distante no infinito** (`m4persp`: `o[11] = -1; o[14] = near;` profundidade = near/distância). Frustum sem plano far → mais precisão de profundidade onde importa.
- RNG determinístico (mulberry-like), `vnoise`/`fbm` em CPU (para geração no arranque), Halton para amostragem subpixel/temporal.
- `frustumPlanes` + teste esfera×planos como função global — o mesmo par usado para culling de cenas e cascatas de sombra.

### 2.2 GPU shell (`01_gpu.js`)
- `gpuInit()`: verifica `navigator.gpu`, pede `float32-filterable`, `rg11b10ufloat-renderable` e (se `?perf` ou UI aberta) **`timestamp-query`** — decisão por modo, não por palpite.
- `mkTex/mkBuf` helpers; `wgslPP()` — pré-processador mínimo (`#include/#define/#ifdef/#ifndef`), suficiente para 47 shaders num ficheiro só.
- `G` global: device, ctx, formato, `W/H` (com `?res=WxH`), flags.

### 2.3 Construtor de geometria (`02_mesh.js`)
- `MeshBuilder` acumula em `ArrayBuffer` interleaved (f32/i16/u8 viewports no mesmo buffer — evita cópia), com **pilha de transformação** (`push/pop` m4) e `det` para **virar a ordem de winding quando o determinante é negativo** (espelhamentos!). Primitivas prontas: `box`, `rbox` (esfericização por cantos), `cyl`, `lathe` (perfil de revolução), `sweep` (extrusão ao longo de caminho 3D, closed path/profile, normais duras/suaves), `tube`.
- Uso só na inicialização — no frame, nada de construção.

### 2.4 Mundo do circuito (`10_track.js`, `11_worldmap.js`)
- A pista é definida por **segmentos** `['S', L, Δelev]` / `['A', raio, ângulo°, Δelev, nome]` com **Lw e Ln resolvidos por álgebra linear** (o laço fecha exatamente), depois suavizada com **gaussiana periódica** (SG=14, KS=42) e reamostrada por comprimento de arco (~1 m). Ideal para autódromo e para qualquer layout sob medida.
- `trackPos(s, d)` devolve posição/tangente/curvatura/bank por amostra — a base de tudo (física, câmeras de TV, props, prewarm).
- `aiBuild()` — **o piloto automático que gravou a volta roteirizada**: minimização de curvatura por descida de gradiente (multi-resolução k=16/8/4, 9000/3000/800 iterações), perfil de velocidade por limite lateral (aLat=11.4) + passes de frenagem, então `aiKeys(t)` gera teclas. A volta do benchmark (`REPLAY_B64`, ~4 linhas de base64) é uma fita de comandos gravada deste piloto e tocada de forma determinística.

### 2.5 Renderizador diferido (`20_renderer.js`)
- **G-buffer** `gA` (srgb/albedo+AO), `gB` (rua material/normal packed), `gC` (máscaras), `gV` (velocidade), `depth32float`.
- **Frame é uma struct gerada** (`FRAME_FIELDS` → `WGSL.frame` + `FR.data` + offsets) — única fonte de verdade para CPU e GPU.
- **Bind group layouts refletidos do WGSL** (`reflectBGLs` faz regex em `@group/@binding`) → impossível dessincronizar binding e código; layouts explícitos equivalentes para os grupos globais.
- Passes com descritores reutilizáveis (`R.pd`), **ligações por família de material** (`mkFamily` → G-buffer deferido; `mkFwdFamily` → transparentes forward), `MeshSet.draw` faz **culling por esfera×planos + maxDist** por item e seta `setBindGroup(2, objBG, R.dyn2, 0, 1)` com **dynamic offsets** — um objeto = um slot de 256 B no buffer de objetos.
- **Cascatas de sombra** com encaixe em texel; `lightView()` por cascata; mapa estático 4096 para o mundo.

### 2.6 Pós-processamento e céu (`21_post.js`, `22_sky.js`)
- Cadeia: `gbuf → decal → half (AO+sol-vis half-res) → blurH/V (bilateral) → light (deferido) → trans (vidro, 2 draws/família) → taa → mbTile/mbNeigh/mblur → blDown*N → blUp*N (bloom) → expo → final (tonemap+sharpen+vinheta+grão+dither)`.
- `expo`: exposição adaptativa (média log, suavizada no tempo) com reset em corte.
- Céu: **assado** 4096×1024 (`skybake`) com atmosfera de fim de tarde + cúmulos volumétricos + cirros; `skyfn` só consulta.
- **Ambiente**: cubemap 512 com MIPS pré-filtrados por disco → SH de ambiente calculado (`computeSH`) com **duas iterações** para incluir rebote; passa para o deferido como luz indireta.

### 2.7 Materiais (WGSL: `gbuf`, `light`, `mat_car`, `mat_props`, `mat_track`, `mat_terrain`, `mat_ground`, `veg_*`, `world_*`)
- Famílias com override de `vert()/surf()/shade()`; entrada gerada por template (`entry`/`entry_fwd`).
- PBR GGX (`brdf`), `mat_track` com **vertex cores semânticos** (r=trajetória racing line, g=zona molhada, b=curvatura, a=zebra) — jogo lê a mesma textura para física de aderência (água) que o visual usa.
- **AO assada no vértice** (cor.a dos props; `bakeCarOcclusion` na build irmã: rasterização volumétrica + ~36 raios/vértice × ~15 stops → ângulo sólido ocluído).
- Vegetação: **impostores assadas** (ortográfica, 8 azimutes, albedo+AO / normal+máscara) + malhas instanciadas perto + **grama gerada na GPU em anéis à volta da câmera** (sem vertex buffer!) + vento por vértices.

### 2.8 Física e jogo (`40_vehicle.js`, `45_game.js`)
- Física **1/120 s** fixo, interpolação para render (`alpha`), zero alocação: transferência de carga, elipse de atrito, FWD, câmbio automático (5 marchas), freio de mão, relevo/inclinação, colisão com guard-rail **pela distância real do cenário** (`PROPS.railD`).
- **Warmup honesto** (`gameWarmup`): 9.000 passos de simulação com entradas variadas + todos os modos de câmera + ré + freio de mão + cascata de sombras nos dois lados do texel-snapping — tudo *antes* do carro aparecer; depois `gamePrewarm()` renderiza 36 vistas e **escolhe a cadência**: se a pior vista passar de **6,2 ms de GPU**, trava em 60 Hz em vez de oscilar. Decisão por medida, não por fé.
- **Loop**: acumulador + clamp 0,05 s; corte de cena seta `R.cam.first` (reinicia histórico TAA).
- **`?cap`**: API `window.__cap` para captura determinística (`frames(n)` com passo fixo, `shot()`, `pose(i)`, `tvView`) — o jogo inteiro vira E2E visual.

### 2.9 Som (`50_som.js`)
- Sintetizador 100% por código (4 tempos desiguais → "quatro cilindros", rede de ressonadores, canto de pneu L/R, vento, rodagem zebra/brita/grama, ambiente/mata/pássaros, público), **16 controles inteiros por bloco**, zero alocação, roda igual: em tempo real (AudioWorklet, taxa k), com fallback ScriptProcessor, e **offline** (`sndOffline`) renderizando a trilha da volta — mesma função, três caminhos.

### 2.10 UI e ferramentas (`51_painel.js`, `52_ui.js`, `90_main.js`)
- Menu/teclado/gamepad documentado no próprio ecrã; HUD por canvases 2D pré-desenhados; `?ui=0`/`?perf`/`?cap`/`?replay`/`?scene=test|placeholder|car` separam **modo humano × modo ferramenta**, com detecção de `navigator.webdriver`.
- `__cap.poses()` + `POSES` = golden frames nomeadas para regressão visual.

---

## 3. O que "aprender mesmo" significa aqui (as 12 lições transferíveis)

1. **Tudo o que não muda por frame é assado no arranque** (céu, ambiente SH, impostores, noise, AO, mapas de pista, linha de corrida). O frame só amostra.
2. **Determinismo total**: seeds explícitas, fitas de comando gravadas, piloto por descida de gradiente. Regressão visual impossível sem isso.
3. **Estrutura > elegância**: 30 módulos concatenados + 47 shaders num mapa + pré-processador próprio — feio, mas jogável, rápido e tudo no mesmo ficheiro.
4. **Uma única fonte de verdade para layouts**: struct Frame gerada; BGLs refletidos. Elimina uma classe inteira de bugs — a nossa classe de bug favorita.
5. **Zero alocação no hot path** como religião, não como otimização ocasional (nem números em caixa entre funções!).
6. **Medir para decidir**: `?perf` por passe, spike capture (>14 ms com o perfil por passe), escolha automática 120/60 Hz pela pior vista medida.
7. **Warmup duplo (JIT + GPU)** antes do primeiro frame visível — o stutter morreu antes de nascer.
8. **Baking assimétrico e semântico**: cores de vértice carregam significado (racing line, molhado, AO) — o visual e a física bebem do mesmo pixel.
9. **Autoria por código com pilha de transform e winding fixado por sinal do det** — modelar sem editor é viável (e o carro é a prova: 100% procedural).
10. **IA mínima e honesta ganha o jogo**: piloto de linha por otimização + fita determinística = benchmark reproduzível e vídeo de lançamento grátis.
11. **Som como síntese de estado, não de amostras**: 16 números descrevem o mundo sonoro; escala do Uno ao terror (drones por estado de ameaça).
12. **Modo ferramenta embutido** (`?cap`, poses, testes) desde cedo — QA visual deixa de ser manual.

## 4. O que NÃO copiar (limites honestos)

- **Escala de demo, não de jogo**: sem objetivo/conflito além da volta; NSAMBO só ganha com o **método**, não com a massa crítica.
- **TAA + motion blur + 3 cascatas + 4096² estático** pressupõe GPU forte; ele se defende com o fallback 60 Hz, mas um browser em iGPU/Android sofre.
- **Ficheiro único sem módulos**: impagável de manter em time; mantemos bundler (Vite) e módulos.
- **AO/SSAO sério e passe half→blur** custam passes de tela cheia — no PSX/WebGL do NSAMBO não cabe ainda.
- **Zero acessibilidade/dificuldade/save** — é vitrine, não produto.

## 5. Aplicação concreta no NSAMBO (mapa, por ordem de valor)

| Origem (Uno EP) | Alvo NSAMBO | Esforço | Nota |
|---|---|---|---|
| `gameWarmup`/`gamePrewarm` (JIT+GPU antes do ecrã) | Pré-compilar materiais PSX e aquecer o stalker skin + partículas durante o LOGO | S | Elimina stutter no primeiro contacto |
| `__cap` + `POSES` (golden frames por script) | Formalizar `?qa=1` com poses nomeadas (spawn, pedestal, porta, hunt) | S | Gate D automatizável |
| Vertex-AO por cor (bake estático do cenário) | AO pintado no load (canvas) nos assets estáticos do Backroom (paredes/tecto/chão) | M | "Mãos mortas" ganham peso |
| Struct Frame gerada / BGLs refletidos | Manter WGSL fora; nada a fazer | — | Filosofia já aplicada |
| Fallback 120→60 Hz por medida (>6,2 ms) | Medir pior frame no boot e travar quality | S | Já temos `targetFps` adaptativo |
| 16 controlos inteiros → síntese | `setStalkerBreath(dist, stage)` já existe; adicionar camada de **silêncio pré-hunt** + batida grave | S | Terror > música |
| Racing line por otimização | (P2) caminho do stalker por navegação em grafo de células, não por curvatura | M | Inspiração estrutural, não cópia |
| Skid/contact decals de G-buffer | (P2) pegadas/decalque de arrasto perto da chave | S | Só se barato no forward |
| Céu atmosférico assado | (P2 bioma 2 "fenda") — reutilizar `atmos/skybake` quase intacto | M | Só com ordem explícita |

## 6. Estado da análise
- Este documento foi escrito depois de leitura direta completa do ficheiro (estrutura de 30 módulos, 47 shaders, laço 90_main, APIs `__cap`, `PERF`, warmup).
- **Nenhuma linha do NSAMBO foi alterada** como resultado desta análise. Os itens da secção 5 são propostas, não trabalho feito — e seguem o princípio "5 salas excelentes > 50 corredores".
- O ficheiro-fonte vive em `/tmp/arena-coding-uploads/` (efémero entre sessões). Se for preciso manter, copiar para `assets/ref/` ou anexar ao repo com aviso de licença desconhecida — **decisão do utilizador**.

## 7. Fraseado que vale como lei (lido no código)

- "Para ferramentas… nada muda — sem menu, sem painel." — o modo ferramenta é cidadão de primeira classe.
- "Sem isso, a primeira troca de câmera desotimizaria funções do laço" — vácuo de JIT aquecido por construção.
- "Se a vista mais pesada não cabe com folga… o jogo roda estável a 60 quadros por segundo" — cadência por medida.
- "o visual e a física bebem do mesmo pixel" — dados semânticos no vertex color (racing line / molhado / zebra).
- "em GPUs de tile (Apple)… a soma [dos passes] dá o tempo do quadro" — métrica robusta mesmo em arquiteturas diferentes.
- "o laço fecha exatamente" (Lw/Ln por álgebra linear) — geometria com restrição resolvida, não ajustada à mão.
