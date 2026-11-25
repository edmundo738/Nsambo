# AUDITORIA — "Uno com escada" (commit `e9528bd`, `game-assets/uno-com-escada-main.zip`)

**Data:** 2026-11-25 · **Fonte da verdade:** leitura direta do ZIP extraído em `/tmp/uno-study/uno-com-escada-main/` (8,6 MB de fonte) · **Nada do NSAMBO foi alterado por esta auditoria.**

---

## 1. O que este commit é, cientificamente

Um **experimento controlado de geração de código por IA**: o mesmo pedido (incluído no ZIP em `pedidos/01-circuito.txt`, mais dois pedidos subsequentes) foi entregue a **três modelos diferentes** — "Claude Fable 5.2", "Claude Opus 5.5" e "GPT-6.2 Astra" — em ambiente idêntico (MacBook Pro M4 Max, Chrome 157, Playwright, ffmpeg, `trabalho/` para scripts), e os três entregaram **o mesmo jogo**: *Uno com escada*, um Fiat Uno Mille EP 1996 com escada de alumínio no teto num circuito original, em WebGPU puro, sem engines, sem assets externos, num `index.html` autocontido.

Medições oficiais (README.md do projeto):

| | Fable 5.2 | Opus 5.5 | GPT-6.2 Astra |
|---|---|---|---|
| Circuito | Serra da Mata | Circuito da Serra | Serra do Lume |
| Esforço solicitado | Alto | Alto | Ultra |
| Tempo de trabalho do agente | 7 h 12 min | 5 h | 6 h 49 min |
| Rodadas do crítico visual | 8 (interrompido) | 11 (auto-parada, avisando que não estava pronto) | 19 (encerramento após parecer 0 graves) |
| Defeitos graves na última rodada | 4 | 5 | 0 (+3 médios) |
| Custo de API | US$ 347,64 | US$ 87,81 | US$ 371,02 |
| Tamanho do `index.html` jogável | 603 KB | 341 KB | 467 KB |

Interpretação honesta: **mesmo prompt, três arquiteturas diferentes, resultados de qualidade diferentes** — evidência forte de que (a) o prompt carrega o resultado tanto quanto o modelo; (b) verificação por crítico separado é o principal instrumento de qualidade; (c) custo/tempo não correlacionam com rigor de processo (o Opus, o mais barato e o único a auto-parar por honestidade, custou US$ 87).

## 2. O prompt como «programa» — o que `pedidos/01-circuito.txt` ensina

Estrutura digna de estudo (transcrevendo os mecanismos, não o texto):

1. **Prioridades ordenadas** quando há conflito: 1) qualidade visual → 2) *parecer o carro das fotos* → 3) frame time na máquina-alvo → 4) tamanho da entrega. Quer dizer: a lista de prioridades **resolve deadlocks de decisão** antes de eles aparecerem.
2. **Restrições negativas e duras**: sem three.js/Babylon/…; nada de textura/modelo/HDRI/áudio; entrega = um único `index.html`; **zero alocação JS por quadro**; circuito original (não copiar outro jogo).
3. **Alvo explícito**: M4 Max, 2560×1440, 120 Hz, **11 ms de GPU em média e nenhum quadro > 16,7 ms** numa volta roteirizada de 60 s — números objetivos, não "ficá muito bem".
4. **Cena concreta** (nome exato do carro, pintura azul-claro metálica das fotos de estúdio, escada com cintas, pista com zebras/brita/boxes/arquibancada, fim de tarde com sol baixo, três câmeras, mundo limitado sem limite visível).
5. **VERIFICAÇÃO tripla e independente de gosto**:
   - **Crítico visual**: subagente **novo a cada rodada**, vê **só os renders e as referências**, **nunca o código nem o raciocínio do autor**. Seis poses fixas 2560×1440 + volta roteirizada ao passo fixo 1/60 s; recebe "quadro a cada meio segundo + 3 rajadas de 8" (para pegar flicker/shimmer/objetos surgindo do nada), compara lado a lado, e devolve defeitos **concretos, em ordem de prioridade**, com severidade **grave/médio/menor**. Itera até nenhum "acima de menor".
   - **Desempenho**: timestamp-query + log de tempo de quadro na volta de 60 s; reportar média, **p99** e máximo.
   - **Controles**: teste automatizado por tecla e por comando de controle; a volta roteirizada completa sem sair do asfalto.
6. **Definição de pronto explícita** ("PRONTO QUANDO: as três verificações passarem" + lista de entregáveis, incluindo o vídeo `volta.mp4`).

O segundo pedido (`02-som-e-menu.txt`) aplicou o mesmo padrão incremental: "Não quebrar o que existe" em primeiro lugar, só depois features — regressão antes de feature. O terceiro (`03-ajustes.txt`) é calibração fina com valores objetivos (som −60%, ambiente −80%) e exigência de **refazer os entregáveis afetados**.

**Isto não é um prompt — é um processo de engenharia de software executável.** O "MODO-OPERANTE" do nosso repo é exatamente isto com outras palavras; aqui ele está provado num artefacto de 460 KB tridimensional de 2026.

## 3. Anatomia comparada das três implementações

| Aspecto | Fable 5.2 (`Serra da Mata`) | Opus 5.5 (`Circuito da Serra`) | GPT-6.2 Astra (`Serra do Lume`) |
|---|---|---|---|
| **Build** | Node `build.mjs`: concatena `js/*.js` ordenados + `wgsl/*.wgsl` em `WGSL` + `shell.html`; `--min` opt-in | Node `build.mjs`: lista explícita de módulos, **stripper ciente de strings/templates/comentários**, `vm.Script` confere sintaxe **antes** de gravar; fita da volta em `data/lap.txt` | Python `build.py`: concatena 14 `.js` por ordem fixa dentro de `page.html` (`/*__GAME__*/`) |
| **Vértice** | 36 B interleaved (pos f32·3, normal **snorm16x4** w=peso, uv f32·2, mat u8x4, cor u8x4) | packed normals/quantized igualmente | 13 f32 stream interleaved + templates com instâncias de 8 f32 |
| **Culling/draws** | Frustum por esfera×planos + `maxDist`, `drawIndexed` por família | **compute culling** (`grass_cull.wgsl`, `veg_cull.wgsl`) | **visibleScene**: dedup FNV-1a + open addressing, compactação + `drawIndexedIndirect`; sombras e probes reusam as instâncias imutáveis |
| **Renderer** | **Diferido**: G-buffer 4 alvos + HDR + SH ambiente (2 iterações) + cubemap ambiente 512 (7 mips pré-filtrados à mão); shadow cascades 3×2048 + 4096 estático; TAA (clip por variância YCoCg, histórico bicúbico); motion blur McGuire 2 etapas; bloom Karis; exposição adaptativa log | Diferido equivalente, mais leve (338 KB): SDF car (`car_sdf/car_shape.wgsl`), AO dedicado (`ao.wgsl`, `bake_tex.wgsl`) | Direto + **16 reflection probes cube-array 320 px** com parallax; deferred-like por flag de material; nearest-GPU (6,87–7,02 ms medidos, 2 medições) |
| **Céu/ambiente** | Atmosfera Rayleigh+Mie+ozono raymarchada e **assada** 4096×1024 + cúmulos 3D noise + cirros; IBL real | `sky_bake.wgsl` + `volumetric.wgsl` | Raymarch atmosférico + nuvens volumétricas + forest irradiance 384² |
| **Vegetação** | Impostores assadas (8 azimutes), grama na GPU em anéis à volta da câmera, canopy AO assada | Impostores + grass cull compute | **crown sprays** com bakeSprayLight; folhas individuais de perto |
| **Público** | Atlas de figuras em cartões billboard (`world_crowd`) | idem (textatlas) | **40 sentados + 18 de pé gerados por anatomia** (rosto zonado por cúbicas, olhos com córnea/íris, 7 penteados, 24 camisas…) + **assignment guloso por custo de similaridade** (matriz 7×640 juntas, espelhamento L↔R) |
| **Pista/carro** | Lathe/sweep próprio; racing line por descida de gradiente → piloto AI grava a volta (`REPLAY_B64`) | Build mais contido; assegura lap por reconstrução | Mundo por knots+Catmull-Rom + `trackSample` arc-length; `pavementMap` 512×8192 com desgaste por curvatura + hidrology (film d'água = mesma fonte da física de aquaplanagem!) |
| **Som** | Síntese pura WebAudio: motor 4 cilindros desiguais + ressonadores; pneus; vento; mata; público; **16 controles inteiros/bloco**; AudioWorklet + fallback ScriptProcessor + **render offline determinístico** | Idem (`som.js`) | Não sintetizado (vídeo com trilha externa) |
| **QA/ferramenta** | `window.__cap` com poses nomeadas, frames ao passo fixo, shot(), TV views, state(); auto-seleção 120/60 Hz por pior-frame medido (>6,2 ms ⇒ 60) | Lógica idêntica (fits), check `vm.Script` no build | `?verify` + `window.lab` headless; `makeRecording()` com busca binária de velocidade máxima do laço |
| **Pós-entrega** | — | — | Dois bugs reais pós-publicação: **WebKit rejeitou a passada de sombra** (pista preta; corrigido) e **Naga→HLSL não compilava dígitos de placa** (corrigido com constantes explícitas) |

**Convergências (apareceram nas 3, independentemente)** — evidência científica forte de que são as decisões certas sob estas restrições:
1. Um único ficheiro + build por concatenação (com check de sintaxe — Opus e Fable).
2. Física em passo fixo 1/120 s com interpolação para render; zero alocação.
3. Volta roteirizada de 60 s **gravada** (fita determinística) como benchmark e caso de teste.
4. HUD em canvas 2D + overlay de menu em DOM; PT-BR.
5. Benchmark + poses fixas + captura headless como ferramentas de primeira classe (`window.__cap`/`window.lab`).
6. Timestamp-query por passe e queda automática para 60 Hz se o pior frame não couber.
7. Som 100% sintetizado (Fable/Opus) ou trilha offline da mesma simulação.
8. Minimização/gaussiana periódica para fechar o laço da pista (Fable exato por cálculo; os outros por construção).

**Divergências interessantes**: Fable confiou em pós pesado (TAA/motion blur) e pagou com 4 graves; Opus foi econômico e honesto (auto-parada anunciada); Astra foi caro e meticuloso com um **crítico que rodou 19 vezes** e subagentes para dividir o trabalho — a única com 0 graves, e a única que mediu 6,9–7,0 ms de GPU consistentemente.

## 4. O crítico visual — a peça central do método (documentada, replicável)

Da VERIFICAÇÃO do pedido original:

- **Subagente NOVO a cada rodada** — sem memória entre rodadas, sem dívida de justificação, sem amizade com o autor.
- Vê **só** os renders e as referências (fotos do carro, capturas de jogo-alvo). **Nunca** o código, **nunca** o raciocínio.
- Recebe: lista de ficheiros + escala grave/médio/menor + 6 poses fixas (2560×1440, Chrome GPU) + volta de 60 s capturada ao passo 1/60 s + "quadro a cada 0,5 s + 3 rajadas de 8 quadros consecutivos" (o formato certo para pegar flicker/shimmer/Z-fighting/material que "some").
- **Compara lado a lado** com as referências e devolve defeitos **concretos e priorizados**. "Grave" = imagem que qualquer pessoa nota em 1 s; "médio" = olhar com atenção; "menor" = só na comparação lado a lado.
- Itera-se até nenhum defeito acima de "menor".

Isto é, na prática, **regressão de qualidade perceptual** — e é o que os nossos Gates (A–D) sempre tentaram ser, mas nunca formalizaram com: subagente fresco + imagens-only + poses fixas + severidade escrita + log.

## 5. Licença (jurídica, relevante)

PolyForm Noncommercial 1.0.0 (`LICENSE.md` do projeto): livre para **usar, estudar, modificar e partilhar sem fim comercial**, mantendo o aviso de licença. Não há permissão de uso comercial sem acordo.

- **Métodos, algoritmos, arquiteturas** (assado no arranque, warmup, crítico-por-imagens, fita determinística de volta, timestamp por passe, cadência adaptativa, vento por peso no vértice, HUD em canvas…) — não são protegíveis por direito de autor; podem ser e devem ser **reimplementados no NSAMBO**.
- **Código literal** (shaders, simulação, etc.) — só com manutenção do aviso PolyForm e apenas enquanto o NSAMBO for não-comercial. Se o NSAMBO virar produto/pago, isto é um bloqueio até a VictorKav autorizar.
- Decisão necessária do utilizador: (a) NSAMBO é e continuará não-comercial? (b) se copiarmos algo literal, manter `NOTICE` com a licença e o URL do projeto.

## 6. Auditoria técnica — o que está certo, o que é frágil

**Certo e transferível:**
- Build trivial e reproduzível (concatenação + pré-processador próprio, `vm.Script` como sanity check).
- Determinismo de ponta a ponta (seeds, fita, passo fixo) — pré-requisito de regressão visual.
- Warmup JIT+GPU + **medição antes de promover 120 Hz**.
- Timestamp por passe + *spike capture* (>14 ms) com perfil por passe.
- Dados semânticos no vértice (racing line/molhado/AO no vertex color) — visual e física bebem do mesmo pixel.
- HUD em canvas + overlay leve; zero dependências; tudo PT-BR.
- Ambiente por cubemap+SH (Fable) — barato o suficiente para replicar o conceito com 1 um único TextureTarget em WebGL.
- AO assado por vértice para cenário estático — NSAMBO é estático na maior parte: **altíssimo valor**.

**Frágil / não copiar:**
- TAA + motion blur + bloom pesado no budget do nosso PSX/WebGL (corta a assinatura visual e o iGPU do jogador).
- 3 cascatas dinâmicas 2048 + mapa estático 4096 (luz forte demais para terror; meia-vida de GPU).
- 338–603 KB de JS num ficheiro sem módulos — impagável para manter; ficamos no Vite.
- Fragilidade WebGPU-em-browser (bugs WebKit/Naga pós-publicação do Astra) — publicando o web build, testar Chrome/Firefox/Safari antes de prometer "roda em qualquer um".
- Persona de demonstração: **não é um jogo** — sem objetivo, conflito ou progressão; o NSAMBO só se beneficia do método, não da massa crítica.
- Custo real: US$ 88–371 por build + 5–7 h de trabalho de agente por ciclo. Verificação não é grátis; é orçamento de projeto.

## 7. O que copiar JÁ (ordem de valor para o NSAMBO)

| # | Origem (3 versões) | Alvo NSAMBO | Esforço | Porquê |
|---|---|---|---|---|
| 1 | Crítico visual fresco + severidade grave/médio/menor + 6 poses fixas + log por rodada | **Formalizar o Gate D**: `docs/checkpoints/gated/`, poses nomeadas, subagente por rodada, só imagens | S | É a peça que faltava para "evidência > declaração" fechar o ciclo |
| 2 | `__cap`/`window.lab` — poses, frames ao passo fixo, shot(), state() | `?qa=1` no build web: poses spawn/pedestal/porta/hunt, shot() headless, log de PASS/FAIL | S | Gate D automatizável parcialmente |
| 3 | Warmup JIT+GPU; cadência por pior-frame medido | Aquecer shaders/materiais + medir pior frame no boot; só então aliviar/promover | S | Mata o "stutter no primeiro susto" |
| 4 | AO assado no vértice/cor | AO bakeado no load (canvas) para cenário estático + mãos | M | Barato, sem SSAO, SSAO-like |
| 5 | 16 controlos inteiros → síntese | Camada **silêncio pré-hunt** (1–2 s sem nada + sub-drop no início do hunt) no `dread` | S | Terror é ritmo, não fidelidade |
| 6 | Fita determinística + `?verify` headless | Sessão QA jogada por script: spawn→chave→porta→hunt→morte, screenshots-chave | S–M | Rodo-mapa da regressão |
| 7 | Índice de passes com timestamp + spike capture | HUD de desempenho (H) com pior-frame + nº de frames >16,7 ms | S | Medida, não achismo |
| 8 | Racing line por otimização de curvatura | (P2) rota do stalker em grafo de células (A*/Dijkstra) com custo = ruído/luz | M | Mesma estrutura, outra direção |
| 9 | `vm.Script`/sintaxe conferida no build | `npm run build` já valida; manter | — | Já temos |
| 10 | Dado semântico no vertex color (racing line/molhado/zebra→AO/irritação) | AO e "desgaste" no vertex color/textura assada | S | Unifica look & física |

## 8. O que esta auditoria **não** fez

- Não rodou os três jogos (sem GPU nesta sandbox); a avaliação de imagem baseia-se nos screenshots oficiais e no código.
- Não copiou nenhuma linha para o NSAMBO (só método, §7).
- Não decidiu a licença final do NSAMBO — ponto aberto §5.
- Os modelos "Fable 5.2 / Opus 5.5 / Astra" são reportados como documentados pelo projeto; não foi possível verificar credenciais externas.
