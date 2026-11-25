# Nsambo — Plano de Arquitetura do Ambiente 3D

> Documento de engenharia. Define as regras antes de qualquer linha de código/asset.
> Cada fase só avança com aprovação do que foi entregue.

## 1. Objetivo desta fase (Fase 1)
Um **único edifício** hiper-detalhado em 3D (não é um jogo completo), rodeado pelo
terreno imediato: estrada de asfalto, passeio de pavers, bordo (meio-fio) e zona do
lote. O observador deve sentir um lugar real, não um "demo de Engine".

## 2. Princípios de engenharia
1. **Geometria primeiro, textura depois.** Detalhe arquitetónico (fins, juntas de
   sombra, furos de tirante, caixilhos, saliência de laje) é geometria real com
   profundidade — não linhas pintadas numa cor lisa.
2. **Texturas geradas, nunca pintadas por código.** Cada superfície tem o seu
   próprio albedo gerado por IA a partir de descrição física do material real.
   Mapas auxiliares (normal, rugosidade) são **derivados matematicamente** do albedo
   (Sobel/luminância), que é o workflow PBR padrão — o código não "desenha" nada.
3. **PBR rigoroso.** Albedo em sRGB, normal/roughness em linear; metalness/roughness
   plausíveis por material; sombras PCF-Soft; tonemapping ACES-Filmic; ambiente
   PMREM (reflexos físicos no vidro e metal).
4. **Escala métrica real.** 1 unidade = 1 metro. Pé-direito, panos envidraçados,
   larguras de passeio e faixa de rodagem seguem dimensões reais.
5. **O edifício e o chão não partilham material — partilham linguagem.** Concreto
   com o mesmo vocabulário tonal quente-gris do solo pavimentado, transições sempre
   por bordo físico, junta ou ombreira. Nada "flutua" nem "costura" sem regra.

## 3. Gramática de materiais (regras de coexistência)

| Zona | Material | Função semântica | Rugosidade | Transição permitida |
|---|---|---|---|---|
| Faixa de rodagem | Asfalto (albedo gerado) | Vias e tráfego | ~0.95 | só via bordo/guia |
| Passeio | Pavers de betão (albedo gerado) | Pedestre | ~0.85 | só via bordo/guia |
| Bordo | Betão pré-moldado | Fronteira vertical asfalto↔passeio | ~0.7 | sempre entre as duas zonas |
| Fachada base/pódio | Betão aparente (painel) | Massa de serviço + retalho | ~0.75 | fileira de bordos própria |
| Torre | Betão + vidro + alumínio anodizado | Escritórios | vidro ~0.06 | ombreiras/fins verticais |
| Cobertura | Betão + equipamentos (cisternas, casa de máquinas) | Serviço | ~0.8 | parapeito de bordo |

**Regras explícitas**
- R1. Asfalto **nunca** entra no passeio; pavers **nunca** entram na via.
- R2. Toda mudança de material no solo passa por uma peça de fronteira (bordo/guia) modelada.
- R3. O edifício assenta sobre o passeio/lotre com soleira própria; nunca sobre a via.
- R4. Vidro e metal só em elementos de fachada; solo é sempre material de pedra/betão.
- R5. Repetição de textura muda com a escala da zona: asfalto repete em ~6 m, pavers em ~3 m, betão em ~4 m — sem emendas visíveis no campo de visão principal.
- R6. Cada textura gerada fica em `assets/textures/` com nome `material-uso.jpg`; mapas derivados ao lado como `material-uso.normal.jpg` / `.roughness.jpg`.

## 4. Pipeline de assets
1. **Albedo** — geração IA, vista frontal plana, iluminação neutra e uniforme, tileável, sem objetos nem texto.
2. **Normal map** — derivado por Sobel sobre luminância do albedo (`tools/derive_maps.py`), força ajustável por material.
3. **Roughness** — derivado por variação de luminância comprimida à volta do valor-base do material.
4. **Import** — sRGB só no albedo; `RepeatWrapping`; anisotropia do GPU; repeat calculado pela escala real da zona (R5).

## 5. Stack técnica
- **Vite + Three.js** (WebGL2), sem engine de jogo nesta fase; módulos ES.
- Câmaras: OrbitControls + presets determinísticos via query param (`?view=hero|street|top`) para screenshots reproduzíveis.
- Render: `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, sombras 4096, ambiente PMREM (`RoomEnvironment`).
- Screenshots headless (chromium) para ciclo de revisão com o utilizador.
- Preview ao vivo via servidor de desenvolvimento (`npm run dev`, host `0.0.0.0`).

## 6. Estrutura
```
assets/textures/          # albedos gerados + mapas derivados
tools/derive_maps.py      # normal + roughness a partir do albedo
app/                      # vite + three.js
  src/main.js             # cena, materiais, construção
docs/                     # este plano, screenshots de revisão
```

## 7. Roadmap
- **Fase 0 — Plano** ✅ (este documento) + pipeline de texturas e mapas derivados.
- **Fase 1 — O Edifício** (actual): pódio, torre de betão com fins verticais, caixilharia, cobertura com cisternas e casa de máquinas, soleira, bordo, asfalto, passeio.
- **Fase 2 — A Rua**: postes de iluminação, sinalização, carros, árvores e plantas (texturas próprias geradas), mobiliário urbano.
- **Fase 3 — O Bairro/Cidade (Nza)**: quarteirões, variação de volumes, LOD, identidade visual do universo Nsambo.
- **Fase BNA — Reconstrução 3D do Banco Nacional de Angola**: ver `docs/BNA-RECONSTRUCAO.md` (estudo de fidelidade sobre referência real; vive em `/` com o Fase 1 em `/fase1.html`).

## 8. Critérios de aceitação da Fase 1
- [ ] Silhueta com 3 planos de profundidade: pódio / torre / ático-cobertura.
- [ ] Detalhe real à distância de rua: ombreiras, furos de tirante, juntas de sombra, caixilhos com vidro reflexivo.
- [ ] Zonas do solo a obedecer R1–R5 (asfalto ≠ passeio ≠ bordo).
- [ ] Sem costuras de textura visíveis no ângulo hero.
- [ ] Screenshots em `docs/screenshots/` para análise do utilizador antes de avançar para a Fase 2.
