# game-assets/ — ingestão de conteúdo para THE BACKROOMS

Pasta de **dados brutos** que tu colocas e eu (agente) integro no jogo.
Regras curtas: kebab-case, sem acentos, sem espaços, sem ficheiros gigantes,
só conteúdo que tens direito de publicar.

## Estrutura

| Pasta | O quê | Formatos aceites (pref. primeiro) |
|---|---|---|
| `ost/` | OST / ambiente / drones / loops | `.ogg` (q5–q7) · `.mp3` · `.wav` — loop seamless; indica BPM/tomal se souber |
| `textures/` | Paredes, chão, teto, papel, azulejo | `.jpg` tileável ≤ 1024² · sets PBR: `nome.jpg` + `nome.normal.jpg` + `nome.roughness.jpg` + `nome.ao.jpg` + `nome.height.jpg` |
| `decals/` | Pôsteres, olho, manchas, setas, sinais | `.png` com alpha ≤ 512² (ou `.jpg` sem alpha) |
| `objects/` | Adereços/móveis 3D | `.zip` contendo **`.glb`** (pref.) **ou** `.obj` + `.mtl` + texturas — Y-up, metros, low-poly (< 5k tris/objeto) |

## Convenções de nome
- `kebab-case`: `wallpaper-green.jpg`, `ambient-hum-60hz.ogg`, `decal-eye-01.png`
- PBR segue a convenção já usada em `assets/textures/backrooms/` (`.normal.jpg`, `.roughness.jpg`, `.ao.jpg`, `.height.jpg`)
- Sem `ç ã é í`, sem `espaços`, sem `MAIÚSCULAS` no nome do ficheiro

## ⚠️ O repo é PÚBLICO — licença
Tudo o que cair aqui fica **público e no histórico do git para sempre**.
Só coloca:
- trabalho teu (fotos, texturas pintadas por ti, loops, modelos);
- CC0 / CC-BY (com atribuição no README da pasta de origem);
- royalty-free com licença compatível (ex.: algumas packs de itch.io marcam).

**NUNCA** coloques OST pirateada de YouTube/filmes, músicas comerciais, packs roubados
ou assets de jogos com copyright. Isso expõe o repo público e a conta — e eu
(agente) terei de recusar integrá-los.

## Limites de tamanho
- Ficheiro individual **< 100 MB** (limite do GitHub); ideal **< 25 MB**.
- Packs grandes (> 100 MB): publica como **asset de Release** e mete só o link aqui num `.txt` (`link.txt` na pasta certa).
- Zips dentro de `objects/` são bem-vindos como formato de transporte.

## Como o conteúdo entra no jogo
1. Tu fazes push (ou arrastas o ficheiro pelo site do GitHub na pasta certa).
2. Dizes-me "chegou conteúdo em game-assets/".
3. Eu integro: os arquivos entram em `assets/` (ou viram instâncias no motor),
   ajusto loaders/áudio/posicionamento, rebuild, beta atualizada.

## Estado de integração do motor (honesto, 2026-11)
- `textures/` — **direto**: o motor já lê sets PBR com esta convenção (textura/parede/chão/teto/quadros).
- `decals/` — **direto**: plano com textura, mesmo esquema dos quadros (`painting-*`).
- `ost/` — **fácil**: Web Audio do motor já faz drones; trigo para um `radio.js`/jukebox é trivial.
- `objects/` (3D) — **loader GLB próprio disponível desde 2026-11-25**
  (`app/src/backrooms/engine/gltf.js`: accessors, hierarquia TRS, 1 anim LINEAR/STEP,
  skinning bake na CPU, texturas embebidas). Posicionamento à mão estilo viewmodel/prop
  (igual aos quadros/porta). Já no jogo: arms viewmodel, PSX House Key (puzzle), PSX Flashlight.
  Limites de sempre: estáticos ou TRS simples, < 5k tris, ≤ 1024², metros, origem no chão do objeto.

## Para modelos 3D: requisitos mínimos
- `.glb` único com materiais embutidos OU `.obj`+`.mtl`+texturas juntos no zip
- escala em metros (1 unidade = 1 m), origem no chão do objeto
- texturas ≤ 1024², sem animações (estáticos) — ou animação simples por morph
