# Attributions

THE BACKROOMS (Nsambo — Lobby 0) é um projeto fan-made gratuito, sem fins lucrativos.
Os assets de terceiros abaixo estão licenciados para uso livre em jogos gratuitos
(free samplers) ou são de domínio do responsável pelo repositório. Se és autor de
algum destes assets e queres correção ou remoção, abre uma issue.

## Modelos 3D — ATR0CITY (free samplers, modelados com assistência de IA e revistos à mão)

Modelo                                     | Origem                              | Ficha                                        | Destino no jogo
------------------------------------------ | ----------------------------------- | -------------------------------------------- | -------------------------------------------
PSX First-Person Arms (`arms_rig.glb`)     | ATR0CITY — psx-first-person-arms    | arms_01.png / arms_gloves_01.png / arms_uv.png | Viewmodel de 1ª pessoa (braços/mãos)        |
PSX House Key (`psx_house_key.glb`)        | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | Chave do puzzle (flutua acima do pedestal)  |
PSX Torn Note Page (`psx_torn_note_page.glb`) | ATR0CITY — PSX Keys & Puzzle Items  | Free 5-piece sampler                          | Reservada — ainda não integrada             |
PSX Flashlight (`psx_flashlight.glb`)      | ATR0CITY — PSX Tools & Melee        | Free 5-piece sampler                          | Lanterna segurada pelos braços (viewmodel)  |

Fontes (itch.io, autor ATR0CITY): "PSX First-Person Arms - FREE GAME ASSETS",
"PSX Keys & Puzzle Items — Free Sampler", "PSX Tools & Melee — Free Sampler".

## Música / OST

- **"Over The Radio"** (`assets/ost/over-the-radio.m4a`) — faixa da coleção
  "Misc. OST.zip" fornecida pelo responsável do repositório via `game-assets/`.
  ⚠️ Artista/origem exatos desconhecidos — se fores o autor e quiseres crédito
  (ou remoção), abre uma issue. Uso: ambiente/títulos em loop, volume baixo.
- Restantes 33 faixas da coleção permanecem **não integradas** em `game-assets/Misc. OST.zip`.

## Texturas (lobby)

- `assets/textures/backrooms/` (wallpaper, carpete, teto, quadros, etc.) — as fontes
  originais **não foram documentadas** quando foram importadas (commit 007998a).
  Tratadas como "domínio do responsável pelo repositório" até prova em contrário;
  registo de origem em falta — TODO.

## Ferramentas

- `app/src/backrooms/engine/gltf.js` — loader glTF/GLB próprio e mínimo do NSAMBO ENGINE
  (não é three.js nem gl-matrix; ver `assets/` para os modelos).
- three.js (MIT) — apenas no Editor/Fase 1, não no motor do jogo.
