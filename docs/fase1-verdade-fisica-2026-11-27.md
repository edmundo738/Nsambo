# NSAMBO: The Backrooms — Auditoria externa 2026-11-27 · FASE 1 (verdade física) — relatório de execução

Branch: `arena/caa2461b-nsambo` · Data: 2026-11-27 · Estado: **implementada e testada; NÃO commitada (aguarda autorização)**

A auditoria externa anexada pelo utilizador declarou o jogo «REPROVADO como survival horror completo» e fixou uma **Fase 1 — prioridade máxima — corrigir a verdade física do jogo**. Cada afirmação foi verificada no código antes de corrigir. Este documento regista o que era verdade, o que foi corrigido, e o que ainda não está provado.

## Veredicto da verificação (código, não fé cega)

| # | Afirmação da auditoria | Verdade no código | Ação |
|---|---|---|---|
| A | Stalker vê/ouve através de divisórias (`_losClear` ignora `sealedEdges`) | **VERDADE** — só verificava células sólidas | `occlusion.mjs` unificado; Stalker passou a usar `losClearXZ` (células sólidas + arestas seladas + cantos, idêntico ao jogador) |
| B | Stalker não conhece pilares; atravessa-os | **VERDADE** — `StalkerBrain` recebia só `cells/size/sealedEdges`; BFS e `_moveToward` sem pilares | Construtor aceita `pillarCells`; BFS contorna-os (alvo exceto); corpo resolvido por círculo×AABB (raio 0.34, caixas 0.35 m); spawns/vagarosidade excluem células-pilar |
| C | Faca atravessa divisórias (`raycastCells` só células sólidas) | **VERDADE** | `rayBlocked` unificado (oclusão + arestas seladas + cantos); `raycastCells` apagado |
| D | Interações sem linha de visão (medkit, fusível, cassete, pé-de-cabra, lanterna velha, nota, quadro) | **VERDADE** — só chave e porta verificavam LOS | Guarda `player.hasLineOfSight()` em TODOS os candidatos de interação |
| E | Objetos podem nascer sobre células-pilar | **VERDADE** — `claim()` não excluía pilares | Células-pilar reservadas antes da distribuição de pickups |
| F | Dano do pounce no mesmo frame do evento (antes do impacto visual) | **VERDADE** — `damageHealth(58)` junto de `stalker.strike()` | Dano adiado para a janela de impacto (`POUNCE_IMPACT_DELAY=0.42 s`, envelope sin(π·u) do strike de 0.9 s) com teste de raio (`POUNCE_IMPACT_RADIUS=1.45 m`) — se o jogador se afastou, evadiu |
| G | Regeneração 5.5 s × 16 hp/s vs cooldown 55–85 s — dois pounces improváveis | **CONFIRMADO, NÃO CORRIGIDO** — é balanceamento (Fase 2, decisão do utilizador) | Pendente de decisão (dano/cooldown/faca-lethal) |
| H | Faca mata em 3 golpes + stunlock | **CONFIRMADO, NÃO CORRIGIDO** — balanceamento (Fase 2) | Pendente de decisão |
| I | Lanterna não afeta o Stalker | **CONFIRMADO, NÃO CORRIGIDO** — é a mecânica proposta pelo utilizador (L = B×C×D×O) | Pendente (briefing da lanterna; aguarda decisões de implementação) |
| J | Áudio do Stalker não espacializado | **CONFIRMADO PARCIALMENTE** — respiração por distância, sem panner 3D | Pendente (Fase 5 da auditoria) |
| K | Objeto-esperto (STALKER PATHING) não verificado contra pilares reais | Corrigido aqui | Teste novo: perseguição de 400 passos sem ocupar a caixa do pilar |
| L | WFC com desempate por ordem da grelha / seleção da chave pela 1.ª célula | **VERDADE** (desempate determinístico, não aleatório) | NÃO corrigido — pós-processamento intencional; registo para Fase 4 |
| M | Pickups posicionados por distância euclidiana (não BFS) | **VERDADE** | NÃO corrigido — registado para Fase 4 (distribuição de recursos) |

## Alterações (working tree, sem commit)

**Novo:** `app/src/backrooms/game/occlusion.mjs` — consulta ÚNICA de oclusão: `losClearXZ` (segment test, cantos via dois caminhos, `ignoreCell`, `forcedSolid`), `rayBlocked` (raio já conta divisórias), `resolveCircleBoxes` (círculo × AABB), `makeSealedSet`.

**Alterados:**
- `game/stalker-ai.mjs` — importa oclusão unificada; `bfsNextStep(…, pillarSet)` opcional; `StalkerBrain` recebe `pillarCells`; `_losClear` corrigida; movimento e knockback do atordoamento deslizam contra pilares; alvos de vagarosidade/despertar evitam células-pilar; `BODY_RADIUS = 0.34`.
- `game/player.js` — `hasLineOfSight` delega em `losClearXZ` (porta fechada = `forcedSolid`, `ignoreCell` mantém prioridade).
- `main.js` — `raycastCells` apagado; faca usa `rayBlocked`; interações filtradas por LOS; `_pickupPos` reserva células-pilar; pounce com dano adiado; spawn do cérebro passa `pillarCells`; `_pouncePending` limpo no `reset()`; constantes `POUNCE_IMPACT_DELAY`/`POUNCE_IMPACT_RADIUS`.
- `package.json` — `npm test` passou a incluir `occlusion.test.mjs` + `weight-paint.test.mjs` (estavam órfãos do script).

**Testes:** `test/occlusion.test.mjs` NOVO — 16 testes (LOS aberta/sólida/selada/ignoreCell/forcedSolid; rayBlocked sólido/livre/divisória; círculo×pilar; BFS com/sem pilares; integração Stalker-divisória; perseguição 400 passos sem pisar o pilar; compatibilidade sem pillarCells; EDGE_KEY).

## Evidência

- `node test/occlusion.test.mjs` → **16/16**
- `npm test` → **176/176** (era 149 com 2 ficheiros de teste fora do script)
- `npx vite build --config vite.config.build.js` → OK (170 kB JS, gzip 57 kB)
- Smoke headless (`?seed=42` e `?seed=42&stalkerhunt`): **zero erros de página**; jogo chega ao ecrã de título («ACORDAR»). Não se jogou uma partida completa nesta sessão — o E2E existente continua a saltar as partes difíceis (crítica L da auditoria mantém-se).

## Não verificado / limitações (a não esconder)

- Nenhuma medição de game feel, ritmo ou justiça das perseguições — isto é Fase 2+ e exige playtest com input real.
- O pounce adiado (Fase 1-F) foi verificado por leitura + smoke, não por teste unitário de timing (o bloco vive no `main.js`, acoplado ao DOM).
- Pilares: a colisão contra divisórias 0.14 m foi incluída no raio da faca; a oclusão visual ignora a espessura do fuste do pilar (0.35 m mal tapa visão — aceitável e intencional).
- Fase 2 (fontes de luz × coragem × L = B×C×D×O), Fase 3 (pé-de-cabra, cassete, recarga), Fase 4 (WFC/level design), Fase 5 (áudio espacial/transições): **não iniciadas**; requerem as decisões do utilizador.

## Pendente do utilizador

1. Autorização de commit/push (ronda correctiva + Item 4 + Fase 1 juntos?).
2. Decisões de Fase 2: dano/cooldown do Stalker, letalidade da faca, modelo da lanterna (ver nota no registo da sessão).
