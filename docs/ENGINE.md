# NSAMBO ENGINE — Módulo THE BACKROOMS
# Documento de decisão técnica e arquitetura

## 1. Auditoria do ambiente (2026-11-25, sandbox deste projeto)
| Recurso | Estado |
|---|---|
| g++ 12.2 / gcc | ✅ existe |
| cmake / ninja / cargo / rustc | ❌ não existe |
| SDL2 / GLFW / GL / EGL / OSMesa / Vulkan / X11 | ❌ **nenhuma biblioteca** |
| apt (acesso a repos) | ❌ sem permissão/rede |
| WebGL2 (browser) | ✅ funciona + testável headless (SwiftShader) |
| npm registry | ✅ acessível |

**Conclusão**: compilar um binário nativo (C++/Vulkan) neste ambiente é impossível e,
pior, **não testável** — violaria a regra inegociável de não declarar testado o que
não foi executado.

## 2. Alternativas analisadas (como exigido)
| Opção | Vantagens | Desvantagens | Veredito |
|---|---|---|---|
| Motor em C++ + OpenGL/Vulkan | controlo total, performance nativa, brief original | não compila nem corre aqui; 0 evidência possível; 1 pessoa-turno | **Port alvo** (Fase 3+), não agora |
| Motor em Rust | memória segura, performance | sem toolchain, sem crates.io (rede bloqueada) | ❌ inviável já |
| Three.js / Babylon | rápido | são frameworks de rendering de terceiros — viola "motor próprio" | ❌ |
| **WebGL2 cru (vanilla), motor próprio** | controlo total do renderer (shaders, POM, dither PSX, sombras); corre e é testável aqui; preview ao vivo; iteração real | sem binário nativo; GC da JS | ✅ **decisão** |

**Decisão**: desenvolver o motor em módulos ES vanilla sobre WebGL2 cru — sem
Three.js, sem game engine. O motor tem arquitetura em camadas pensada para ser
**portada para C++/Vulkan módulo a módulo**: `engine/*` não referencia APIs DOM
nem WebGL fora do `renderer.js`. O JS serve como **implementação de referência**.

## 3. Arquitetura do motor (estado real, 2026-11-25)
```
app/src/backrooms/
  engine/            ← o MOTOR (sem dependências de jogo)
    renderer.js      forward renderer WebGL2: malha + PBR + sombras + pós PSX
    shaders.js       GLSL: PBR chunk (GGX/Smith), POM (Parallax Occlusion), dither
    math.js          mat4/vec3 mínimos
    textures.js      carregamento/dicionário de texturas (tiling 3.0)
    scene.js         buildLevelMeshes(): chão/teto/pilares, parede + rodapé,
                     quadros (moldura ATRÁS da tela), porta EXIT no BORDO DE ENTRADA
                     do percurso spawn→saída (via findPath), sinal SAÍDA
    wfc.js           WFC (sockets) + BFS + validador + findPath (caminho com parents)
    input.js         teclado + rato (pointer lock) + roda
    audio.js         Web Audio: drone 60Hz, footsteps, UI — 100% sintetizado
  game/              ← O JOGO (depende do motor)
    player.js        FPS: WASD, stamina (SHIFT), salto (ESPAÇO), colisão grid-AABB
                     + arestas seladas; a célula de saída é sólida até a porta abrir
    hud.js           stamina/lanterna/objetivo/toasts/minimapa canvas/prompt
    puzzle.js        máquina de estados chave→porta→vitória (pura, testável)
  levels/level1.js   Lobby 0 "O Amarelo Infinito" (fog 0.048, hemi 0.98, spot 17)
  main.js            boot do motor + loop + QA flags via query (?seed= &at= &yaw=
                     &pitch= &psx= &nopom= &topdown= &noflash= &autostart= &debug=)
app/tools/
  e2e-backrooms.mjs  joga Lobby 0: chave→porta→vitória (teclas E reais, headless)
  probe-backrooms.mjs diagnóstico ao vivo: bounds de meshes, células, screenshot
  shot-backrooms.mjs npx → docs/screenshots/br-*.jpg (aceita filtro: br-door br-spawn)
  docs/ENGINE.md     este ficheiro
```
Regras: `engine/*` nunca importa `game/*`; jogo consome API do motor.

## 4. Wave Function Collapse — honestidade técnica
WFC **não garante** conectividade. Por isso há 3 sistemas:
1. **WFC** (`wfc.js`) — estrutura com sockets (0=fechado, 1=passagem) e restrições
   de adjacência; recuperação por retry com seed+1.
2. **Validador de nível** (`validateLevel`) — BFS spawn→saída; toda a célula aberta
   alcançável; rejeita contradições; até 40 selos de aresta opcionais que nunca
   desconectam (BFS confirma, senão desfaz).
3. **findPath** (`findPath`) — BFS com parent tracking; a porta de saída é colocada
   no bordo da célula de saída voltado para a penúltima célula do percurso — ou seja
   **o jogador vê a porta no fim do caminho** (verificado em seed 1337 e nos 300 seeds).
Testes: loop em Node — **seeds 1..300: válidos, com caminho spawn→saída, 0 falhas**.

## 5. Identidade visual (PSX moderno)
- Vertex snapping **desligado por omissão** (legibilidade), ligável em `?psx=1`.
- Pós: dither Bayer 4×4 subtil + quantização ligeira + grain + vinheta + grade
  roxo/teal. Materiais PBR modernos por cima — *charm do PSX com clareza actual*.
- Luz: tectos fluorescentes (flicker ~2% dos painéis), poças roxas, vermelho EXIT,
  verde de emergência, vermelho profundo. Nada é tudo roxo — o contraste é a regra.

## 6. Controlos (reais)
WASD andar · SHIFT correr (stamina) · ESPAÇO saltar · E interagir · F lanterna ·
M mini-mapa · Esc libertar rato. (Sem ferramentas 1–5 — removidas do design.)

## 7. Qualidade (gates) — estado 2026-11-25
- Renderer arranca sem erros de shader ✅ (SwiftShader, headless chromium)
- Seeds 1..300: **300/300 válidos + caminho findPath ≠ nulo** ✅ (`node --input-type=module`)
- E2E do caminho de vitória ✅ — `node tools/e2e-backrooms.mjs`: chave apanhada (E
  real) → porta cede (E real) → pisar a célula de saída → `screen-end` visível,
  `TEMPO/ PASSADAS` no ecrã de fim
- fps ≥ 45 headless: ⚠️ métrica stale em SwiftShader; movimento e interação
  verificados ao vivo — validar em GPU real antes de declarar
- z-fighting: quadros com moldura 15 mm atrás da tela, offsets de 20–35 mm da
  parede; rodapés com 8 mm; divisórias finas seladas com volume próprio ✅
- HUD legível nos screenshots br-*.jpg ✅
- Shot list (`app/docs/screenshots/br-*.jpg`): title, spawn, wall, top, key, door,
  painting, painting-eye, spawn-psx, spawn-nopom
