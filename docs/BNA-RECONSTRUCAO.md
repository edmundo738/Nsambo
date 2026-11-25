# Banco Nacional de Angola — Reconstrução 3D (estudo técnico)

> Reconstrução da sede do BNA (Av. 4 de Fevereiro, Luanda) a partir das referências
> em `docs/referencias-bna/`: fotos diurnas e noturnas, vista aérea, maquela em
> exibição e vinheta de banda desenhada. Objetivo: **fidelidade arquitetónica**, não
> impressão de performance.

## 1. O que está modelado (e porquê)
- **Arcada contínua de 31 arcos** — o elemento-assinatura do edifício. Parede ecrã
  extrudida sobre forma com 31 perfurações em arco de volta inteira, pedra calcária
  gerada (`stone-white.jpg`). Atrás dela: ambulacro com **abóbada de berço** creme,
  pavimento escuro, portas escuras a eixo e **lanternas hexagonais suspensas** (3
  partes instanciadas) — réplica do corredor das fotos.
- **Rotunda central** — tambor com 12 pilastras e 10 vãos em arco em 2 níveis,
  coroamento com cornija + **anel de balaustrada**, cúpula de cobre envelhecido por
  **torno (LatheGeometry)** com **16 nervuras** (TubeGeometry sobre curva meridiana),
  lanterna de 8 aberturas e espiga com cruz.
- **Pavilhões de ordem gigante** (2, simétricos) — blocos projectados, 4 pilastras
  gigantes com capitel, frontão triangular e tímpano salmão.
- **2 pisos nobres** — janelas 9 panos com orla de calcário e frontões alternados
  (triangular/curvo) no piso 1; janelas mais baixas e lisas no piso 2; cordão
  intermédio, cornija corrida com **dentículos** instanciados, **balaustrada ática**
  de bilros torneados (~224) e **10 pináculos-urna** sobre pedestais.
- **Friso com o letreiro** "BANCO NACIONAL DE ANGOLA" em capitais de bronze
  (placa canvas) + **sacada central** com balaustrada.
- **Materialidade**: reboco salmão gerado (`plaster-salmon.jpg`), telha de canal
  (`roof-tiles.jpg`) em telhados hipudos de geometria própria, granito da plaza,
  bordo de pedra, asfalto. Todos os albedos são **gerados por IA**; normal/roughness
  **derivados matematicamente** (`tools/derive_maps.py`).
- **Cenas dia/noite** — tecla **N**: sol quente ↔ lua fria, estrelas, 10 refletores
  de fachada acesos, letreiro retroiluminado, ~30% de vãos com luz interior
  (seleção determinística por seed).

## 2. Decisões de fidelidade (onde simplifiquei conscientemente)
1. **Simetria bilateral exacta** — as fotos sugerem ligeiras assimetrias (pavilhão
   do lado leste mais projectado); optou-se por simetria legível, com a opção de
   introduzir a assimetria real numa segunda passada.
2. **Reentrâncias rotunda↔corpos** — tratadas como juntas de sombra com pilastras
   de canto (os "dark reveals" que aparecem na maqueta e nas fotos noturnas).
3. **Skyline** — caixas escuras na neblina como silhueta da Baixa de Luanda; sem
   modelagem de vizinhança.
4. **Letreiro** — canvas tipográfico (placa de identificação), não textura pintada
   à mão; Bronze + serifa Times para evocar o bronze original.
5. **Sem palmeiras/bandeiras/viaturas** ainda — Fase 2 do plano, com texturas
   próprias geradas.

## 3. Controlos
`1–5` vistas · `6–0` detalhes (letreiro, janelas, cúpula, balaustrada, solo) ·
`N` dia/noite · arrastar/scroll/botão direito · URL `?view=...&night=1`

## 4. QA (screenshots em docs/screenshots/)
`bna-hero`, `bna-facade`, `bna-arcade`, `bna-sign`, `bna-windows`, `bna-dome`,
`bna-balustrade`, `bna-ground` (dia) · `bna-night-hero`, `bna-night-facade`,
`bna-night-dome` (noite)

## 5. Limitações honestas
- Escala aproximada (fachada 123 m vs ~150 m real) — sem levantamento métrico.
- Telhado hipudo com projecção planar de UV (ligeiro esticamento nas vertentes).
- Sem interiores (vãos no fundo escuro) — só a galeria da arcada é percorrida.
- Modo noite: refletores são spots sem sombras; poças de luz simuladas.
