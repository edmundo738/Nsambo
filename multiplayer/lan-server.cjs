#!/usr/bin/env node
// THE BACKROOMS — servidor LAN 1v1 (caçador vs fugidor), zero dependências.
// Corre com Node puro (nada de npm install): `node lan-server.cjs`
// O convidado liga pelo IP do anfitrião: ws://<ip>:8322  (porta: MP_PORT)
// Relé burro: atribui h/g e reencaminha mensagens. Nenhuma lógica de jogo aqui.
const http = require('node:http')
const crypto = require('node:crypto')
const os = require('node:os')

const PORT = Number(process.env.MP_PORT || 8322)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const ROOM_ID = crypto.randomBytes(6).toString('hex')   // identidade desta sala (loopback 127/8 responde em todo o /8 — dedup no cliente)

/** @type {import('node:net').Socket | null} */ let host = null
/** @type {import('node:net').Socket | null} */ let guest = null
const frames = new Map()   // socket → buffer acumulado

const localIPs = () => {
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
  }
  return ips
}
const sendFrame = (sock, opcode, payload) => {
  const len = payload.length
  let head
  if (len < 126) head = Buffer.from([0x80 | opcode, len])
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2) }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2) }
  sock.write(Buffer.concat([head, payload]))
}
const sendText = (sock, s) => sendFrame(sock, 0x1, Buffer.from(s, 'utf8'))
const sendPong = (sock, payload) => sendFrame(sock, 0xA, payload)
const peerOf = (sock) => (sock === host ? guest : host)

function onMessage(sock, text) {
  const other = peerOf(sock)
  if (other && other.writable) sendText(other, text)
}

function parseFrames(sock, chunk) {
  let buf = Buffer.concat([frames.get(sock) ?? Buffer.alloc(0), chunk])
  while (true) {
    if (buf.length < 2) break
    const opcode = buf[0] & 0x0F
    const masked = (buf[1] & 0x80) !== 0
    let len = buf[1] & 0x7F
    let off = 2
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4 }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10 }
    const need = off + (masked ? 4 : 0) + len
    if (buf.length < need) break
    let payload = buf.subarray(off + (masked ? 4 : 0), need)
    if (masked) {
      const mask = buf.subarray(off, off + 4)
      const un = Buffer.alloc(len)
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3]
      payload = un
    }
    buf = buf.subarray(need)
    if (opcode === 0x8) { // close
      try { sendFrame(sock, 0x8, Buffer.alloc(0)) } catch { /* já morreu */ }
      sock.destroy(); return
    } else if (opcode === 0x9) sendPong(sock, payload)      // ping → pong
    else if (opcode === 0x1) onMessage(sock, payload.toString('utf8'))   // texto
    // opcode 0 (continuação) — mensagens são minúsculas e não fragmentadas pelos browsers
  }
  frames.set(sock, buf)
}

const lanInfo = () => JSON.stringify({
  game: 'backrooms',
  name: 'THE BACKROOMS',
  version: 1,
  port: PORT,
  players: (host ? 1 : 0) + (guest ? 1 : 0),
  capacity: 2,
  open: !!host && !guest,        // true = dá para entrar já; false = partida cheia ou vazia
  room: ROOM_ID,
})
const server = http.createServer((req, res) => {
  const url = (req.url ?? '').split('?')[0]
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' }); res.end(); return }
  if (req.method === 'GET' && url === '/lan-info') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    res.end(lanInfo())
    return
  }
  res.writeHead(426, { 'content-type': 'text/plain' })
  res.end('THE BACKROOMS LAN — isto é um WebSocket game server, não um site.\n')
})

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`)
  socket.setNoDelay(true)
  socket.on('data', (chunk) => parseFrames(socket, chunk))
  socket.on('end', () => { try { socket.destroy() } catch { /* já morreu */ } })   // o peer foi-se sem aperto de mão — fecha o lado de escrita também
  socket.on('close', () => {
    console.log('[lan] um lado desligou — quarto fechado (o servidor continua à espera de outra partida)')
    const other = peerOf(socket)
    if (other && other.writable) { sendText(other, JSON.stringify({ type: 'bye', reason: 'o outro saiu' })); try { other.destroy() } catch { /* já morreu */ } }
    host = null
    guest = null
    frames.delete(socket)
    console.log('[lan] sala pronta — liga-te de novo para outra partida')
  })
  socket.on('error', () => { /* close trata do resto */ })
  frames.set(socket, Buffer.alloc(0))

  if (!host) {
    host = socket
    sendText(socket, JSON.stringify({ type: 'peer', id: 'h' }))   // responde já — o 4 s do cliente não dispara à espera do convidado
    console.log('[lan] anfitrião ligado — à espera do convidado')
  } else if (!guest) {
    guest = socket
    sendText(guest, JSON.stringify({ type: 'peer', id: 'g' }))
    sendText(host, JSON.stringify({ type: 'ready' }))             // o par formou-se — o anfitrião envia o init
    console.log('[lan] convidado ligado — a partida pode começar')
  } else {
    sendText(socket, JSON.stringify({ type: 'bye', reason: 'quarto cheio' }))
    socket.destroy()
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('THE BACKROOMS — multijogador LAN (1v1)')
  for (const ip of localIPs()) console.log(`  o convidado liga para ws://${ip}:${PORT}`)
  console.log('  (Ctrl+C para fechar a sala)')
})
