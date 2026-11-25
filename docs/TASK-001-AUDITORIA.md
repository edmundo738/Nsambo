# TASK 001 — Fase 0: Auditoria, baseline e plano (Lobby 0 · NSAMBO)

**Data:** 2026-11-25 · **Spec:** THE BACKROOMS — NSAMBO / TASK 001 (Reestruturação da geração procedural, identidade visual do Lobby 0 e otimização do renderizador) · **Executor:** Arena (este agente) · **Validação:** crítico visual independente (a definir pelo proprietário) + QA técnico.

> ⚠️ **Nada nesta fase é "feito" no sentido da spec (§12).** Esta fase só estabelece a linha de base: o que existe, o que mede, o que falta e o plano. Declarações de conclusão exigem as evidências das fases B–F e o veredito do crítico (§8.4) + máquina de referência (§7.2).

---

## 0. Referências visuais (anexadas pelo proprietário)

Três imagens, preservadas em `docs/referencias/lobby0/` (uso interno de avaliação; não distribuir) — ver README local para origens.

1. **Sala aberta com pilares** (render "KaneParson"): tecto de grelha, **painéis fluorescentes quadrados embutidos** densos, **colunas quadradas**, profundidade por repetição + névoa, amarelo sujo.
2. **HobbyTown USA Oshkosh 2002** (fotografia real, origem do mito "The Backrooms"): papel de parede **padrão ziguezague + bolinha**, rodapé longo horizontal (madeira), carpete caramelo opaco, troffers retangulares no tecto de grelha, paredes brancas, tomada na parede.
3. **Corredor infinito** (render): duas fileiras de **painéis retangulares** convergindo num ponto de fuga; paredes verde-amareladas; carpete laranja-queimado.

**Comum às três (define a identidade):** luminosidade fluorescente tépida e artificialmente uniforme; geometria ortogonal repetida; paleta monocromática suja; desconforto por repetição — não por dimensão.

## 1. O que existe hoje (fonte: leitura de código, sem alterações de comportamento)

**Geração (WFC, `app/src/backrooms/engine/wfc.js`, 441 l.)**
- Single-level: 6 módulos base (corridor/corner/tee/cross/deadend/block) → 18 por rotação; sockets [N,E,S,W]; portas 0/1.
- Propagação com conjunto de compatibilidade pré-computado; contradição ⇒ retry (até 40 tentativas, `seed + tentativa*7919`); fallback `null`.
- Pós-passes determinísticos: merge de componentes por abertura de paredes; carve de salas 2×2 (até 5, prob 0.75); **passe estrutural** — pilares (células abertas circundadas → coluna fina, máx 18) + **divisórias** (selagem de arestas em **linhas retas**, máx 40, revert-on-fail por BFS); spawn no centro; saída na célula aberta mais distante; chave a 45–70% da distância máxima; validação final (BFS + sem isoladas).
- **Hierarquia Nivel 1 (organização geral antes do WFC) NÃO existe** — a spec hierárquico-3-níveis não está implementada; o WFC aqui é único nível.
- Determinismo: `mulberry32(seed + tentativa*7919)`; reproduzível e testado.
- **Estrutura teatral forte**: a rede é sempre conectada (merge forçado + BFS), spawn/saída/chave protegidos de selos.

**Mundo/geometria (`scene.js`, 353 l.)**: buckets por material → ~15 draws + dinâmicos (porta/stalker/viewmodel); luminárias **modeladas** (caixa + bandeja reflectora + 2 tubos T8, ~20% "a morrer") posicionadas a cada 3×3 células (x%3==1, z%3==2) — **poucas e esparsas face às referências**; pilares cilíndricos.

**Renderer (`renderer.js`, 512 l.)**: forward WebGL2 próprio; PSX skip opcional; POM; PBR por mapas (albedo/normal/rough/AO/height); 1 shadow map 1024 só da lanterna; FBO RGBA8 + pós (dither/grain/vignette/levels); **sem LOD, sem frustum culling, sem occlusion culling**; desenho de tudo a cada quadro.

**HUD/QA**: `?debug` overlay (agora com fps + p95 + p99 + máx + contagens >16,7/>33,3 ms — **adicionado nesta fase**); `?seed=`, `?at=x,z`, `?yaw/pitch=`, `?topdown=1`, `?autostart=1`; `window.__READY` adicionado nesta fase (gancho headless; zero efeito no jogo); mapa por minimap canvas.

**Testes**: 66/66 ✅ (wfc 48-seed sweep incluído). Gameplay (stalker/puzzle/viewmodel) intocada.

## 2. Baseline medido (2026-11-25)

**Seeds (`docs/checkpoints/task001/seed-report-2026-11-25.json`, `app/tools/task001/seed-report.mjs`):**
- 64/64 seeds válidas e conectadas; tempo de geração (generateLevel) média **42 ms**, máx **205 ms**; openCount média **525** (nível 26×26, 676 celas); maxDist média **37.9**; pilares **sempre 18** (teto do passe estrutural); divisórias **sempre 40** (teto) — são caps, não equilíbrio emergente.
- Implicação: a spec o "10 seeds" está largamente cumprida no básico; o risco real é de variedade estrutural, não de validade.

**Capturas BEFORE (`docs/screenshots/task001/`, 1366×768, seed 1337, máquina SwiftShader):**
- `lobby0-before-01-spawn.jpg` — cena **demasiado escura**; **tecto renderiza quase preto** (refs: creme/grelha claros); **um único troffer esparso** visível; wallpaper **barroco/damasco** (refs: ziguezague-bolinha/limpo-sujo); carpete **demasiado saturado** (refs: caramelo opaco). Mãos/viewmodel legíveis (trabalho P0).
- `lobby0-before-02-topdown.jpg` — estrutura irregular de blob+corredores (boa: não é grelha uniforme); paredes finas e grandes abertas; legibilidade fraca.
- **Nenhuma destas imagens serve para aprovação** — são apenas a ref. temporal `before` para as rondas seguintes.

**Desempenho na máquina de referência (HP ProBook 450 G5 · i5-8250U · UHD 620 · 12 GB · Win11 · 1366×768@60 Hz): NÃO MEDIDO.** SwiftShader ≠ UHD 620; números aqui não valem.
**Tempo de geração no browser:** não instrumentado (o relatório Node mede o mesmo código no CPU — 42 ms média).

## 3. Gaps vs spec, por secção

| § | Requisito | Estado actual | Lacuna |
|---|---|---|---|
| 3 | Preservação absolute (stalker, gameplay, controlos) | Respeitada (nada tocado nesta fase) | manter como gate de cada fase |
| 4.1 | Identidade Backrooms reconhecível (labirinto, repetição, desorientação) | Parcial — "amarelo de pilares" existe; paleta/ritmo falham (ver §2) | **Fase B** |
| 4.2 | WFC para estruturas; hierarquia 3 níveis | Single-level + pós-passes robustos; sem Nível 1 macro; sem recuperação formal de contradição (há retry); fallback null sem substituição documentada | **Fase C** (flag `?gen=hier`, manter single-level como fallback) |
| 4.3 | Seeds reproduzíveis + registo | Reproduzível, testado; **sem registo por geração no jogo/log** | registar seed efetiva em cada boot (console/HUD debug já a mostra; garantir JSON de sesión QA) |
| 4.4 | Biomas isolados; Lobby 0 sem contaminação | Só há Lobby 0; LEVEL1 isolado; sem biomas | manter; documentar fronteira |
| 5 | Shaders/materiais/luz tépida uniforme | Forward PBR próprio; pós PSX; emissivos modelados; **tecto preto**; troffers esparsos; wallpaper errado; fog 0.048 forte demais p/ "tépida uniforme" | **Fase B** |
| 6.1 | LOD 0–3 com transições | **Nenhum** | Fase D (decidir: só LOD em detalhe pequeno? medir) |
| 6.2 | Frustum culling | **Nenhuma** | Fase D (barato; esferas) |
| 6.3 | Occlusion culling (células/portais) | **Nenhuma** (mas nível é grelha: BFS-por-célula a partir do jogador é viável; orçamento de N células + margem 1 célula) | Fase D (com rajada de frames para pop-in) |
| 6.4 | Distance culling/streaming | Nenhum; mundo pequeno (26×26) | medir antes de implementar — provavelmente não justifica |
| 6.5 | Instancing/batching/draw calls | Buckets por material ≈ batching implícito; sem instancing explícito; draw calls já baixos (~15) | medir draw calls; não implementar sem medição |
| 7 | 30–60 FPS na máquina de referência; métricas obrigatórias | Instrumentação adicionada (fps/p95/p99/máx/contagens); **sem dados de UHD 620** | Fase E com o proprietário |
| 8 | Crítico independente, severidade Muito Alto..Muito Reduzido | Não existe canal independente nesta sessão | **Decisão do proprietário** (§5 abaixo) |
| 9 | 10 seeds, regressão, visibilidade | 48-seed sweep + 64-seed report ✓; regressão 66/66 ✓; visibilidade n/a (nada existe ainda) | repetir após fases B–D |

## 4. Fases e verificações (nada passa para a seguinte sem evidência)

- **Fase A — instrumentos e baseline** ✅ (esta entrega: métricas `?debug`, `seed-report.mjs`, `shots.mjs`, `__READY`, refs arquivadas, este documento). Verificação: testes 66/66 + capturas registadas.
- **Fase B — identidade visual do Lobby 0** (sem gameplay): tecto claro com grelha; troffers **densos** com variantes sala (quadrado) / corredor (retangular) e ~20% mortos; wallpaper variante fiel às refs (padrão ziguezague/bolinha gerado em canvas, comparado contra referência actual lado a lado); carpete caramelo opaco; rebalancear luz hemisférica + emissivo (tépida, uniforme, com variação por painel); fog ajuste; exposição. Verificação: 6 capturas fixas (mesmos pontos/ângulos) + parecer do crítico (severidade spec §8.2) + 60 FPS preservado nos testes A/B SwiftShader (informativo).
- **Fase C — WFC hierárquico (opcional)**: Nível 1 macro (zonas: arranque → distritos → ligação) → Nível 2 WFC por zona → validação/fallback ao single-level. Flag `?gen=hier`; single-level continua default até o crítico aprovar. Verificação: 10 seeds válidas (spec §9.1) + comparação de métricas estruturais (openCount/maxDist/variedade).
- **Fase D — visibilidade**: frustum culling (esferas por bucket/célula) + occlusion por células (BFS a partir da célula do jogador, orçamento de N células + margem 1). Verificação: draw calls antes/depois; zero pop-in em rajada de 60 frames; métricas.
- **Fase E — validação na máquina de referência**: correr na UHD 620 (proprietário); FPS médio/mín/p95/p99; geração; relatório antes/depois (spec §9.3).
- **Fase F — relatório final** (spec §10): + lista de problemas conhecidos (spec §12.12).

## 5. Bloqueadores e decisões necessárias do proprietário

1. **Máquina de referência**: como correr e registar os dados de FPS na HP ProBook 450 G5 (podes correr `npm run dev`/`build` lá e devolver-me os logs `?debug`, ou ceder outro canal)? Sem isto, §7 fica por verificar.
2. **Crítico visual independente**: quem avalia as rondas? Opções: (a) tu, fora daqui, só com as imagens; (b) sessão/modelo fresca com as imagens + referências e nada mais; (c) eu mesmo faço uma "auto-crítica" declarada como tal (não é independente — não cumpre §8). A spec exige (a) ou (b).
3. **Objetivo comercial do NSAMBO** (define o que fazer com assets de terceiros — ver `ATTRIBUTIONS.md`).
4. **Cap a 60 FPS** quando a plataforma permitir (spec §7.2) — confirmar implementação.
5. Referência `ref-hobbytown-level0-foto.jpg` é registo histórico real (Wikimedia/The Backrooms wiki); uso interno ✓; não distribuir.

## 6. Riscos e mitigação

- Identidade "tépida/uniforme" pode achatar o horror → variação por painel + mortos ocasionais (já existe o padrão 20%).
- Culling por células → pop-in oblíquo → margem de 1 célula + teste em rajada.
- WFC hierárquico → mudar a estrutura que o WFC single-level já garante → fica atrás de flag; fallback documentado.
- Teto claro ↑ → revela união de buckets (fendas de painel) → verificar 10 seeds em capturas antes do merge.

## 7. Ficheiros desta fase (Fase A)

- `app/src/backrooms/main.js` — métricas de quadro no overlay `?debug`; `window.__READY` (hook headless).
- `app/tools/task001/seed-report.mjs` — 64-seed report (exit 1 se alguma falhar).
- `app/tools/task001/shots.mjs` — capturas headless 1366×768.
- `docs/checkpoints/task001/seed-report-2026-11-25.json` — log de seeds.
- `docs/screenshots/task001/lobby0-before-{01-spawn,02-topdown}.jpg` — BEFORE.
- `docs/referencias/lobby0/` — 3 referências + README.
- Este documento.
