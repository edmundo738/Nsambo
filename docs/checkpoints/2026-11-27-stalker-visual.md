# Checkpoint — Stalker visual in-game (2026-11-27, ~13:00 UTC)

> Correções à reclamação: «o monstro está mal rigado, mal texturizado, texturas
> desalinhadas; joga, tira print, compara com o Blender, vê-o andar».

## O que estava mal (verificado com medição, não a olho)

1. **Blowout total** — a lanterna (`spot.intensity` 10.0) estourava a pele
   pálida: o stalker virava uma silhueta branca sem rosto. Prints `/tmp/c1/c2`.
2. **Pele plástica, sem rachaduras** — o albedo IA (`skin.jpg`) era
   uniformemente pálido (mean 171); o "look" do hero Blender (manchas escuras,
   rachas fundas) não aparecia em jogo.
3. **Orientação da face** — suspeita de bug de yaw no modelo. Medido e
   **descartada**: a face do GLB aponta +Z (olhos em z≈+0.51), a matriz
   `rotYTranslate` mapeia +Z → (−sin r, 0, cos r), logo `r = π + b.yaw` está
   certo — o código original já estava correto. (Um "fix" errado `π − b.yaw`
   chegou a ser testado e revertido: virava as costas ao jogador.)
4. **Alinhamento UV × albedo** — suspeita de desalinhamento («texturas mal
   encaixadas»). Medido: amostragem vert→albedo com flipY=false (como o
   renderer) dá **5.3% de verts em fundo puro e 57% em pele** (mean RGB
   183/176/156) — o atlas **está** alinhado aos UVs xatlas atuais; com
   flipY=true, 44% caía no fundo (por isso o `flipY=false` do GLB). O sintoma
   "mal encaixado" era, na prática, o estouro de luz + a falta de contraste do
   albedo.
5. **Toast «STALKER AINDA NÃO CARREGOU»** no boot — corrigido (chamadas
   automáticas agora silenciosas; o aviso fica só no dev-menu).
6. **Vídeo da caminhada impossível** — `record-game.mjs` gravava desde o load
   (20 s de ecrã de loading). Agora espera `stalker.present === true`, nomeia a
   saída de forma determinística e faz dump do estado final do cérebro.

## O que mudou

| Ficheiro | Mudança |
|---|---|
| `app/src/backrooms/levels/level1.js` | lanterna `3.8 → 2.9` (0.2.0 já tinha baixado de 10.0 → 3.8) |
| `app/src/backrooms/engine/renderer.js` | `modelStalker` `uAlbedoTint` `0.88/0.82/0.82 → 0.66/0.60/0.58` (como `modelArms`: "a lanterna é agressiva") |
| `app/src/backrooms/main.js` | QA `stalkerhunt=1` (força `brain.state='hunt'` — caça visível em headless lento); toasts de spawn silenciosos |
| `assets/textures/stalker/skin.jpg` | re-assado por `tools/rebake-stalker-albedo.py`: cracks aprofundadas, carne nas cavidades da AO, contraste; chart dos olhos preservada texel a texel |
| `assets/textures/stalker/skin.normal.jpg` | re-derivado do novo albedo (Sobel, strength 4.2) |
| `assets/textures/stalker/skin.roughness.jpg` / `skin.height.jpg` | re-derivados (derive_maps.py) |
| `assets/textures/stalker/skin.ao.jpg` | re-assado (bake_stalker_ao.py, determinístico) — ver nota abaixo |
| `app/tools/record-game.mjs` | espera stalker presente; nome de saída determinístico; dump de estado final |
| `app/tools/probe-stalker.mjs` | sonda nova: estado do cérebro ao longo do tempo |
| `fotos/video/stalker-walk-in-game-2026-11-27.mp4` | vídeo real headless: stalker a avançar em `hunt` (12 m → 6.9 m) |

**Nota (acidente contido):** durante o re-derive, `derive_maps.py` reescreveu
também `skin.ao.jpg` com o seu AO falso (p99=255 — o bug A10). Recuperado de
imediato re-correndo `bake_stalker_ao.py` (determinístico; mean 0.874).
Backups dos originais em `/tmp/skin.jpg.orig-2026-11-27` e
`/tmp/skin.normal.jpg.orig-2026-11-27` (e no git, para os mapas commitados).

## Resultado (verificado em screenshots/vídeo reais)

- 3.0 m (h1): pele legível com rachaduras, silhueta corcunda/braços/digitigrade
  reconhecíveis — sem clip branco. 2.2 m (h2): detalhe de rachas e manchas bem
  visível; já não "derrete" em luz direta.
- Vídeo: stalker avançando em `hunt` da neblina; gait com IK nos pés.
- F3 mostra `STALKER … m · stalk|hunt` corretamente (probe: `present=true`,
  `LOS=true`, `huntFocus` a subir — em headless o relógio de jogo corre ~1/12 do
  tempo real, por isso a caçada demora ~40 s de parede; em jogo normal são ~3 s).

## O que NÃO está resolvido / fica para depois

- **Olhos vermelhos invisíveis de frente**: a pose de stalk/hunt baixa a cabeça
  (design do rig); os olhos só aparecem no pounce/olhar para cima. O mapa
  emissive e o pulso (2.2–3.3) estão corretos e alinhados — não foram tocados.
- **FPS pós-morte ~21** no headless (investigar) — fora deste âmbito.
- **«STALKER ausente» intermitente em 2 gravações** (walk2/walk3) — não
  reproduzido no probe nem no walk4 (estado final `hunt, 6.9 m, present=true`).
  Suspeita: sessões em que a página carregou durante uma janela de rebuild do
  `dist/`. Se voltar a acontecer, o `record-game.mjs` agora faz dump do estado
  final para diagnóstico.
- **A8** (pelvis sem pesos), **A11** (FPS 56→47), **A12** (screenshot timeout no
  Playwright) — pendentes do relatório de 0.1.0.
- Sessão ainda **não commitada nem publicada** — ver git status.
