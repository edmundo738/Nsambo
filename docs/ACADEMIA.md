# ACADEMIA DE GAMEPLAY — The Backrooms

> «Não jogues a campanha inteira para testar uma mecânica.»

Esta é a nossa versão do **Gameplay Gym** (a «sala de testes» dos tutoriais de
design de jogos). É um **nível fixo**, determinístico e separado do jogo, onde
todas as mecânicas podem ser exercitadas e validadas **antes** de chegarem à
cada. A campanha nunca é a sala de testes.

## Como abrir

```bash
cd app
npm run dev          # http://localhost:5173/backrooms.html?gym
```

- `?gym` — arranca na Academia (planta fixa, semente `0x6A11`)
- `?debug` — liga o painel de diagnóstico por omissão (também em `?gym`)
- **F3** — liga/desliga o painel em qualquer altura
- `?nowin` — não dispara a vitória ao pisar a sala de saída
- `?noflash` — lanterna apagada (fotos de ambiente)

Testes automáticos: `npm test` (runner `node:test` — ver `test/gym.test.mjs`).

## A planta (26×26 células, 3 m cada)

| Zona | Zona de teste | O que exercita |
|------|---------------|----------------|
| **A** | Arena do stalker (divisórias em L) | perseguição, FSM de estados, desistência |
| **B** | Ôco com muro em U + portão estreito | pathfinding a contornar; impasse "impossível" |
| **C** | Salão principal | mobília: mesa de madeira + chave, pilares, quadros, quadro eléctrico |
| **D** | Saída com vão selado (porta dupla) | porta só abre com a chave; nada à volta contorna |
| **E** | Corredor sul de lâmpadas + nicho oeste | fixtures bons/avariados; impasse sem saída |
| **F** | 3 colunas (células abertas, obstáculo físico) | colisão fina |

A planta é gerada em `app/src/backrooms/levels/gym.js` e validada pelo mesmo
validador do jogo (`validateLevel`). As regras do jogo são exatamente as
mesmas — só a planta é fixa.

## Princípios extraídos do vídeo (Uniday Studio — «Gameplay Gym»)

Adaptados para a nossa stack (JS + WebGL, sem Godot):

1. **Cena separada do jogo, sempre.** A academia vive ao lado do jogo; nunca
   entra na build. Iterar na mecânica ≠ jogar a campanha na ordem.
2. **Duas camadas de IA separadas.** Comportamento (FSM — IDLE, HUNTING,
   STALKING, FLEEING…) vs navegação (pathfinding A→B com obstáculos).
   A navegação resolve «como chegar lá», o cérebro decide «quero lá chegar».
   No nosso jogo: `stalker.js` (StalkerBrain + StalkerEntity) sobre
   `findPath`/`bfsDistances` — os testes de `stalker.test.mjs` separam estes
   contratos de propósito.
3. **Teste situações extremas, não o caminho feliz.**
   - U-obstacle · muro em L · portão/porta estreita · posição impossível
     (o NPC tem de **desistir**, nunca ciclar para sempre)
   - obstáculo dinâmico: algo aparece **a meio do percurso** — o NPC tem de
     refazer o caminho (o teste do «helicóptero»)
   - direção oposta · colisão previsível ≠ bloqueio total
   O que a academia já tem: muro em U (zona B), portão estreito, impasse oeste,
   pilares finos. O stalker tem de encontrar o caminho contornando ou desistir.
4. **≥ 1 teste de sucesso + ≥ 1 de falha por funcionalidade importante.**
   «Funcionou uma vez» não é «funciona». Todo o fluxo crítico tem de ser
   cobrível por runner (`node:test`) — nunca só manual.
   - Exemplo real: `test/gym.test.mjs` prova a planta; o teste de falha
     deliberadamente parte o spawn (parede) e exige rejeição do validador.
   - No Godot seria GdUnit4 (`godot -s addons/gdUnit4/...`) — mesma regra.
5. **DEBUG MODE — olhar os internos, não só o resultado.**
   Painel F3 (canto superior direito):
   `FPS · POS · célula · YAW · BATERIA · LANTERNA · FÔLEGO · PORTA · CHAVE ·
   QUADRO · STALKER (distância + estado)`.
   Um bug que some ao olhar só o ecrã aparece aqui.
6. **Level Design ≠ Environment Art.** Primeiro a planta (leitura, ritmo,
   dificuldade, cobertura/risco), depois o embelezamento. A academia prova a
   planta antes de pendurar o primeiro quadro.
7. **Ordem de desenvolvimento:**
   conceito → jogabilidade → level design → integração de sistemas → arte → testes/otimização.
   Nunca arte antes de a mecânica existir.
8. **Regras de ouro do vídeo (adaptadas):**
   - Nada está «feito» por ter funcionado uma vez.
   - Fica uma cena de teste separada.
   - Teste os extremos, não só o caso normal.
   - Visualize o estado interno quando caçar um bug.
   - Uma funcionalidade não pode quebrar silenciosamente outra (regressão) —
     por isso o painel e os testes de planta existem juntos.

## Mapeamento Godot → este projeto

| Documento (Godot 4, jogo de corrida) | Este projeto |
|---|---|
| `TestRoom.tscn` | `/backrooms.html?gym` |
| `NavigationRegion3D` + `NavigationAgent3D` | `bfsDistances` / `findPath` (`engine/wfc.js`) |
| `CharacterBody3D` | jogador em `game/player.js` |
| `NavigationAgent3D` dist/avoid | BFS ponderado + `sealedEdges` |
| GdUnit4 / `--script` | `node:test` (`npm test`) |
| `scenes/{player,world,test_rooms,ui}` | `app/src/backrooms/{game,engine,levels}` |
| Painel de debug | F3 (`game/debugpanel.js`) + `#debug` (`?debug`) |
| Webcam input | não aplicável (projeto de terror FPS) |

## Fases (do jogo de corrida do vídeo → adaptadas ao Backrooms)

- **F1 — protótipo funcional:** planta fixa + regras mínimas + debug overlay.
  ✅ nesta academia (planta/F3/testes).
- **F2 — avançado:** todo o fluxo de mecânicas testável aqui (stalker, chave →
  porta → vitória, quadro eléctrico, lanterna, som), obstáculos dinâmicos,
  testes automáticos de sucesso e falha.
- **F3 — experiência completa:** QA visual + performance, e só depois release.

## Como adicionar uma mecânica nova (checklist)

1. Construir/pôr a mecânica na academia (zona ou planta nova em `levels/gym.js`).
2. Testar os extremos: impossível, bloqueio dinâmico, falha.
3. `npm test` — sucesso + falha.
4. Screenshot/QA visual (`?gym`) — posição/comportamento corretos.
5. Só depois integrar no jogo principal (branch + release).

**Se a mecânica não sobrevive à academia, não entra no jogo.**
