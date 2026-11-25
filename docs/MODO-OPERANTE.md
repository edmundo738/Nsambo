# MODO OPERANTE — THE BACKROOMS / NSAMBO ENGINE

> Fonte: diretivas do user (2026-11-25) + bíblia de desenvolvimento colada pelo user + checkpoints.
> **Consultar SEMPRE antes de qualquer ação.** Se isto e a realidade divergirem, a realidade ganha — e este ficheiro é corrigido no mesmo commit.

## 1. Quem sou neste projeto
Sou a equipa inteira — arquitetura, gameplay, geração procedural, direção artística, áudio, QA — com um **diretor** dentro de mim (o meu "Higgsfield"): diz *NÃO*, *SIM*, *FALTA COISA*, *MAIS UM POUCO*, *REFAZ*, *PASSOU POR AGORA*, *ISTO ESTÁ FEIO E SEM TEXTURA*. O QA tem poder de veto. Ninguém "deixa passar porque funciona" — só passa quando cumpre o critério visual e técnico.

## 2. Ritual obrigatório (antes de agir)
1. **Consultar** este ficheiro + o checkpoint mais recente (`docs/checkpoints/`).
2. **Auditar** o existente: ficheiros, build, última release, screenshots. Não assumir.
3. **Definir** o que está bom antes de começar (critério visual mensurável).
4. **Implementar UM slice**, depois: gerar → **ver** → comparar → auto-criticar → corrigir → repetir até passar.
5. **Evidência > declaração**: nunca dizer "testado" sem screenshot/log/E2E. Dizer exatamente o que está e o que não está verificado.
6. **Commit → push → CI republika a beta** (`.github/workflows/backrooms-beta-windows.yml`) → reportar com o link de teste e o que o user deve verificar.

## 3. Regras inegociáveis (do user, textuais)
- Nunca aprovar algo só porque está implementado. Só está concluído quando funciona, foi testado, não compromete a experiência, está integrado e cumpre o requisito visual/técnico.
- Os agentes discutem e discordam; QA rejeita. Nada de "sim" automático.
- Se falhar: refez, ou pede pacote melhor. Nunca mascarar falha com gambiarras sem documentar a limitação.
- Nunca placeholders como resultado final; nunca sistemas fictícios; nunca mentir; nunca desistir.
- Checkpoints de contexto antes de codar (anti-perda de memória). O que não está escrito no repo, perdeu-se.
- Se uma coisa precisa de mais processamento, foca nela e larga o resto.
- Evidências reais (screenshots, logs, E2E), não declarações.
- WFC gera a estrutura; **validador** de conectividade/acessibilidade; **validador de puzzles** (solucionável). Três sistemas separados — o procedural nunca pode partir a lógica dos puzzles.

## 4. Barra de qualidade (o que "bom" significa aqui)
- Alma PSX + técnicas modernas: albedo/normal/roughness/ao/height, POM nas paredes, mipmaps, anisotropia, dither/quantização no pós, grão, vinheta.
- Iluminação atmosférica com contraste: amarelos envelhecidos, bege, "fluorescente", roxo/magenta/violeta como acento de identidade, vermelhos de emergência, verdes de saída. Nunca tudo roxo.
- Medo por antecipação e incerteza, não sustos constantes. Som dos fluorescentes, zumbido da rede, silêncio intencional.
- Seeds reproduzíveis; 300/300 seeds válidas com caminho spawn→saída; puzzle sempre solucionável.
- Controlos responsivos; HUD discreto integrado no universo (sem minimapa que roube o mistério — M é opcional).
- Interações com raycast de alcance curto, prompt contextual, animação de alcançar (braço estende), objetivo atualiza.

## 5. Como o beta chega ao user (modo operante da release)
- Push para `arena/caa2461b-nsambo` (caminhos `app/**`, `assets/**`, `desktop*/**`, `launcher/**`, workflow) **dispara o workflow Windows beta** automaticamente: build Vite → Tauri (nsis) → web zip (+ `launcher/*`: JOGAR.bat, server.ps1, COMO-JOGAR.txt) → publica/atualiza o release `backrooms-v0.1.0-beta` com `--clobber`.
- Caminho primário para o user testar: **`.exe` (Windows)**. Caminho web: extrair zip → **duplo-clique em JOGAR.bat** (servidor local 127.0.0.1:8321+, abre o browser). Duplo-clique direto em `backrooms.html` **não funciona** (ES modules em file://).
- Iteração local: Vite dev (porta 5173/5174) → `node app/tools/shot-backrooms.mjs` (screenshots) → `node app/tools/e2e-backrooms.mjs` (E2E). Build de produção: `npx vite build --config vite.config.build.js` (dist com launcher copiado pelo CI).

## 6. LEDGER — o que existe, onde está, o que falta validar (2026-11-25)
| Item | Estado | Evidência | Pendente |
|---|---|---|---|
| Beta entregável ao user (r2) | 🟡 fix no ar, a validar | CI: dist+zip com verificação falha-se-faltar; server.ps1 MIME .glb/.m4a; COMO-JOGAR/notas com Opção A/B + troubleshooting | user confirmar JOGAR.bat abre |
| Viewmodel braços+lanterna | 🟡 código ok, falta veredicto | lanterna empunhada visível; spot na ponta; knife_idle | user aprovar em hardware |
| Chave PBR própria | 🟡 vista por mim, falta veredicto | key-gold.*; raycast ≤2.5u; crosshair ativo; reach animado | user aprovar |
| Motor NSAMBO (PBR, POM, sombras, pós PSX) | 🟢 sólido | screenshots/E2E | — |
| WFC + validador (seeds 1–300) | 🟢 | logs de build/teste | — |
| Loop chave→porta→vitória | 🟢 E2E verde | `tools/e2e-backrooms.mjs` | — |
| Fix do rato (P0) | 🟡 code done, ❌ hardware real | `probe-mouse.mjs` | user validar |
| Viewmodel braços | 🔴 **REPROVADO pelo user** | image-4/5/6.png | ver §7 |
| Lanterna viewmodel (empunhadura) | 🟡 parcial | br-spawn.jpg | validar após ronda 2 |
| Cadeia de interação (raycast/highlight/alcançar) | 🟡 proximidade+dot | código em main.js | raycast 2.5 + alcançar nesta ronda |
| Chave GLB (house key) | 🔴 **"parece a parede"** | image-5.png | textura metálica PBR (esta ronda) |
| LANTERNA HUD sync | 🟢 barra/flicker/off | código | tip-spot nesta ronda |
| OST "Over The Radio" | 🟡 toca em loop | commit 10479d8 | **proveniência desconhecida — user confirmar** |
| psx_torn_note_page | ⚪ copiado, não integrado | assets/models | decisão do user (puzzle?) |
| Texturas do lobby | 🟡 | commit 007998a | fontes não documentadas |
| MED Pack / gba.zip / Buildings.rar | 🔴 por inventariar | — | auditoria |
| ATTRIBUTIONS.md | 🟢 criado | ATTRIBUTIONS.md | OST + texturas em falta |
| Web zip da beta | 🟡 CI copia `launcher/*` | screenshot do user sem JOGAR.bat | **CI com verificação** nesta ronda |
| Mapa do BNA (image-1.png) | ⚪ fora de scope (track BNA) | uploads | não mexer nesta ronda |

## 7. Auto-auditoria — falhas minhas que este modo combate
- "Aprovei mesa/chave/porta sem olhar com olho crítico" (checkpoint 2026-11-25) — prometi: gerar → ver → comparar → repetir. Esta sessão aceitei braços/chave como "feitos" e o user reprovou — o critério é olho crítico contra as referências, antes de eu ficar satisfeito.
- "Dizer feito sem dizer por onde o user chega lá" — todo o report termina com: onde está, como abrir, o que verificar.
- Confundir "está a correr" com "está bem". "Está integrado" ≠ "está aprovado".
- Perguntas do user sem resposta por escrito ficam no checkpoint, nunca só na conversa.

## 8. Próxima ronda (ordem)
1. Viewmodel v2: braços a sair dos cantos inferiores (esq/dir), **dedos/mãos para a frente** (180° no eixo vertical se necessário), ombros off-screen, lanterna na mão direita.
2. Interação: raycast 2.5 do centro da câmara; highlight da chave no alvo; **braço estende** ao pressionar E; objetivo atualiza.
3. Chave com textura **metálica PBR** (albedo/normal/roughness/ao/height gerados localmente, convenção `key-gold.*.jpg` + `flipY=false` p/ UVs do GLB).
4. CI: zip web passa a **falhar** se faltar JOGAR.bat/server.ps1/models — fim dos betas sem launcher. + MIME `.m4a`/`.glb` em `launcher/server.ps1`.
5. Rebuild → push → beta republicada → user valida no hardware.
6. Aguardando user: proveniência da OST; destino da nota rasgada; inventário MED Pack/gba.zip; BNA (mapa).
