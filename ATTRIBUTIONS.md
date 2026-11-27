# Attributions

THE BACKROOMS (Nsambo — Lobby 0) é um projeto fan-made gratuito, sem fins lucrativos.
Os assets de terceiros abaixo estão licenciados para uso livre em jogos gratuitos
(free samplers) ou são de domínio do responsável pelo repositório. Se és autor de
algum destes assets e queres correção ou remoção, abre uma issue.

## Modelos 3D — ATR0CITY (free samplers, modelados com assistência de IA e revistos à mão)

Modelo                                     | Origem                              | Ficha                                        | Destino no jogo
------------------------------------------ | ----------------------------------- | -------------------------------------------- | -------------------------------------------
PSX First-Person Arms (`arms_rig.glb`)     | ATR0CITY — psx-first-person-arms    | arms_01.png / arms_gloves_01.png / arms_uv.png | **Não usado** — viewmodel de braços removido em 2026-11-26; ficheiro mantido sem uso |
PSX House Key (`psx_house_key.glb`)        | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | Chave do puzzle (flutua acima do pedestal)  |
PSX Torn Note Page (`psx_torn_note_page.glb`) | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | **Integrada (2026-11-26)** — prop de lore junto ao pedestal; [E] ler a nota |
PSX Fuse (`psx_fuse.glb`)                  | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | **Integrada (2026-11-26)** — apanhada do chão; instala-se no quadro elétrico do corredor da saída |
PSX Cassette Tape (`psx_cassette_tape.glb`) | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | **Integrada (2026-11-26)** — fita do anterior; [E] examina (lore: o quadro do fundo) |
PSX Pickup Marker (`psx_pickup_marker.glb`) | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | **Só QA** (`?pickupmarkers=1`) — anéis debug; nunca renderizados no jogo |
PSX Crowbar (`psx_crowbar.glb`)            | ATR0CITY — PSX Tools & Melee        | Free 5-piece sampler                          | **Integrada (2026-11-26)** — pé-de-cabra abandonado; [E] examina (lore: riscos no chão) |
PSX Flashlight (`psx_flashlight.glb`)      | ATR0CITY — PSX Tools & Melee        | Free 5-piece sampler                          | **Não usado** — acompanhava o viewmodel de braços (removido) |

## Modelo — stalker definitivo (fornecido via game-assets/)

Modelo                                     | Origem                              | Destino no jogo
------------------------------------------ | ----------------------------------- | ------------------------------------
Stalker definitivo (`stalker.glb`)         | `game-assets/white_mesh.glb`, commit 329a5b33 — fornecido pelo responsável pelo repositório; malha "white" (sem textura) derivada com assistência de IA (família Hunyuan3D, se aplicável — a Hunyuan 3D 2.0 Community License não se aplica à UE/Reino Unido/Coreia e a Tencent não reivindica direitos sobre os outputs; Angola está fora dessa restrição) | **Integrado (2026-11-26)** — stalker do jogo, substituído in-place: pele PBR própria (albedo pálido gerado por IA 2026-11-26, AO assado por ray-trace, normais faux-Sobel, roughness por luminância), emissive de olhos em brasa; **esqueleto próprio de 21 juntas (2026-11-27)**: pesos top-4 por vértice (xatlas atlas reindexado, 8731 vértices), skinning Linear-Blend na CPU, cinématica IK de dois ossos por passada (pernas) com pólo anatómico, FK hierárquica, pélvis dinâmica, cabeça pot-latch no jogador + saccades, e ragdoll verlet na morte

## Modelo — faca do viewmodel (fornecida via game-assets/, processada no projeto)

Modelo                                     | Origem                              | Destino no jogo
------------------------------------------ | ----------------------------------- | ------------------------------------
Faca (`knife.glb`)                        | `game-assets/white_mesh (6).glb` — commit 8790f88, fornecida pelo responsável pelo repositório; malha derivada com assistência de IA (família Hunyuan3D, se aplicável — mesma situação de licença do stalker: a Hunyuan 3D 2.0 Community License não se aplica à UE/Reino Unido/Coreia do Sul e a Tencent não reivindica direitos sobre os outputs; Angola está fora dessa restrição). **Processada integralmente no projeto (2026-11-27)**: retopologia xatlas (≈54.5k → malha atual), pose canónica, exportação PBR 2048² pintada localmente, runas «EU SOU» na lâmina e no cabo | **Integrada (2026-11-27)** — viewmodel do ataque de faca (LMB); lâmina prateada fosca, cabo em mogno envernizado |
Texturas da faca (`assets/textures/knife/knife*.jpg`) | Geradas no projeto (2026-11-27, raster + paint local) — albedo/normal/roughness/AO/height | Papeamento do `knife.glb` |

## Modelos 3D — packs RETROS / RETRO ASSETS LIBRARY (fornecidos via game-assets/)

Sem licença ou README incluídos nos zips — usados com permissão do responsável
pelo repositório (que forneceu os packs). Se és o autor, abre uma issue.

Modelo                                     | Origem                              | Destino no jogo
------------------------------------------ | ----------------------------------- | ------------------------------------
PSX Med Kit (`psx_medkit.glb`, era `Med_1.glb`) | PSX MED PACK — RETRO ASSETS LIBRARY (GLB/Med_1.glb) | **Integrada (2026-11-26)** — kit de primeiros socorros no chão; [E] revive o fôlego |
PSX Dirty Flashlight (`psx_flashlight_dead.glb`, era `FlashLight_Set_1_1.glb`) | FLASHLIGHT PACK 2 OF 6 — RETROS (GLB/FlashLight_Set_1_1.glb) | **Integrada (2026-11-26)** — lanterna abandonada e sem pilhas; [E] examina (lore: o anterior a ti) |

Fontes (itch.io, autor ATR0CITY): "PSX First-Person Arms - FREE GAME ASSETS",
"PSX Keys & Puzzle Items — Free Sampler", "PSX Tools & Melee — Free Sampler".

## Música / OST

- **"Over The Radio"** (`assets/ost/over-the-radio.m4a`) — faixa da coleção
  "Misc. OST.zip" fornecida pelo responsável do repositório via `game-assets/`.
  ⚠️ Artista/origem exatos desconhecidos — se fores o autor e quiseres crédito
  (ou remoção), abre uma issue. Uso: ambiente/títulos em loop, volume baixo.
- Restantes 33 faixas da coleção permanecem **não integradas** em `game-assets/Misc. OST.zip`
  (proveniência/licença desconhecidas — não serão embedidas no build).

## Quadros (pinturas do Lobby 0)

- `assets/textures/backrooms/painting-eye.jpg`, `painting-mountains.jpg` — origem não documentada (ver secção Texturas).
- `painting-portrait.jpg`, `painting-ship.jpg`, `painting-corridor.jpg`, `painting-forest.jpg` —
  **geradas por IA pelo próprio projeto (2026-11-26)**, ao estilo dos mestres antigos (verniz rachado,
  paleta escura), sob medida para o jogo. Sem restrições de uso (conteúdo do próprio repositório).

## Texturas (lobby)

- `assets/textures/backrooms/` (wallpaper, carpete, teto, quadros, etc.) — as fontes
  originais **não foram documentadas** quando foram importadas (commit 007998a).
  Tratadas como "domínio do responsável pelo repositório" até prova em contrário;
  registo de origem em falta — TODO.

## Ferramentas

- `app/src/backrooms/engine/gltf.js` — loader glTF/GLB próprio e mínimo do NSAMBO ENGINE
  (não é three.js nem gl-matrix; ver `assets/` para os modelos).
- three.js (MIT) — apenas no Editor/Fase 1, não no motor do jogo.
