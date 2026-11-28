# THE BACKROOMS — Multijogador LAN (1v1: caçador vs fugidor)

Modo 1 contra 1 na **mesma rede local** (WLAN/LAN). Sem servidores na internet, sem contas.
O transporte é um relé WebSocket zero-dependências (`lan-server.cjs`) — **o anfitrião** corre-o na sua máquina; **o convidado** entra pelo jogo.

## Como jogar

**Anfitrião (quem cria a sala):**
1. Precisas do [Node.js](https://nodejs.org) (LTS) — só para o relé. O jogo em si não precisa.
2. `node lan-server.cjs` (porta 8322; `MP_PORT=9000 node lan-server.cjs` para mudar).
3. O relé imprime o teu IP local (ex.: `ws://192.168.1.20:8322`).
4. No jogo: **MULTIJOGADOR (LAN) → CRIAR — SOU O CAÇADOR** (ou FUGIDOR).

**Convidado:**
1. Abre o jogo **na mesma rede**. O jogo não precisa de Node.
2. **MULTIJOGADOR (LAN) → PROCURAR PARTIDAS** — o jogo percorre a rede à procura de salas (estilo Minecraft):
   aparece a lista com as salas abertas (`1/2 — dá para entrar`). Clica **ENTRAR**.
3. Alternativa: escreve o IP do anfitrião (`192.168.1.20:8322`) e clica **ENTRAR**.

## Regras (confirmadas pelo EDMUNDO, 2026-11-28)
- **Caçador vence** esvaziando a vida do fugidor (58 de dano por golpe, alcance 2,9 m, botão esquerdo).
- **Fugidor vence** abrindo a porta da saída com a chave (como no single-player).
- Seed partilhado → nível idêntico nos dois lados; papéis opostos (quem é caçador de um lado é fugidor do outro).

## Como funciona (para quem mexe no código)

```
anfitrião (jogo)  ←ws→  lan-server.cjs (relé)  ←ws→  convidado (jogo)
```

- `lan-server.cjs` — HTTP+WebSocket RFC6455 à mão, sem dependências. Atribui `h`/`g`, avisa o anfitrião que o par formou-se (`ready`), reforça o keep-alive (um lado sair fecha a sala inteira) e expõe `GET /lan-info` (CORS `*`) com o estado da sala + um `room` id aleatório (dedup da descoberta).
- `app/src/backrooms/engine/net.mjs` — `LanNet`: WebSocket fino; resolve em `peer`, `onReady` para o anfitrião (é aí que o `init{seed, hostRole}` viaja), `send/close`.
- `app/src/backrooms/game/net-proto.mjs` — protocolo puro e testado: `makeInit/parseInit/parseMessage`, interpolação remota, `STATE_INTERVAL` (10 Hz).
- `app/src/backrooms/game/lan-scan.mjs` — descoberta: percorre `/24`s candidatos (`127.0.0`, `192.168.0`, `192.168.1`, `192.168.8`, `10.0.0`) com `fetch` + timeout curto, valida `/lan-info`, deduplica por `room`, ordena. QA: `?lanscan=192.168.1` restringe a procura (ex.: testes headless).
- No lado do **fugidor**, o caçador é renderizado como o stalker em estado `puppet` (a IA dele não dirige — o cérebro é alimentado pelas mensagens `st` do anfitrião). No lado do **caçador**, o fugidor é só um ponto de luz + cone fraco (sombras na parede).
- Mensagens: `init` (seed+papel) · `st` (pose, 10 Hz) · `atk` (golpe do caçador em alcance) · `hp` (dano comunicado) · `stagger` (faca do fugidor atordoa o caçador 1,25 s) · `door` (fugidor saiu) · `dead` · `bye`.

## Bluetooth — por que não
A Web Bluetooth é só «Central» (cliente BLE): nenhum browser implementa a ponta «periférica» (servidor GATT), por isso dois PCs não jogam entre si por Bluetooth de jogo nenhum — seria preciso um app nativo dos dois lados (Android/Windows) e ainda assim o alcance é ~10 m. A LAN/WLAN cobre o caso real (Wi-Fi de casa, cabo, hotspot do telemóvel). **Não foi implementado — e não há plano de implementar.**

## Testes
`cd app && npm test` — 215/215 (protocolo puro + scanner; o relé é testado à mão com dois browsers headless).

## Limitações conhecidas (honestas)
- O **anfitrião** precisa de Node para o relé (o convidado não). Versões futuras podem compilar o relé (pkg) para não precisar de nada.
- A descoberta percorre /24 candidatos — redes "exóticas" (172.16–31, 10.x grandes) podem não ser encontradas; aí usa o IP manual.
- Não há reconexão: se a ligação cair, a sala fecha e o ecrã de resultado informa.
- 1v1 apenas. Mais jogadores não está no horizonte.
