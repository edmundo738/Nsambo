// Testes da descoberta LAN (lan-scan.mjs) — a sonda real é o fetch do browser;
// aqui injetamos falsos HTTP. Sem rede de verdade.
import test from 'node:test'
import assert from 'node:assert/strict'
import { probeList, parseLanInfo, scanLan, defaultPrefixes, LAN_INFO_PORT } from '../src/backrooms/game/lan-scan.mjs'

test('probeList lista os 254 hosts de cada prefixo na porta certa', () => {
  const urls = probeList(['192.168.1'])
  assert.equal(urls.length, 254)
  assert.equal(urls[0], `http://192.168.1.1:${LAN_INFO_PORT}/lan-info`)
  assert.equal(urls[253], `http://192.168.1.254:${LAN_INFO_PORT}/lan-info`)
})

test('probeList rejeita prefixos inválidos sem rebentar', () => {
  assert.deepEqual(probeList(['192.168.1.x', '300.1.2', '', 'abc', '1.2.3.4.5']), [])
  assert.equal(probeList(['192.168.0', '10.0.0']).length, 508)
})

test('parseLanInfo devolve sala válida de um relé THE BACKROOMS', () => {
  const url = `http://192.168.1.42:${LAN_INFO_PORT}/lan-info`
  const json = JSON.stringify({ game: 'backrooms', name: 'SALA DO EDMUNDO', port: 8322, players: 1, capacity: 2, open: true })
  const room = parseLanInfo(json, url)
  assert.equal(room.host, '192.168.1.42')
  assert.equal(room.ws, 'ws://192.168.1.42:8322')
  assert.equal(room.players, 1)
  assert.equal(room.open, true)
  assert.equal(room.name, 'SALA DO EDMUNDO')
})

test('parseLanInfo rejeita lixo: jogo errado, porta inválida, JSON partido', () => {
  const url = `http://192.168.1.42:8322/lan-info`
  assert.equal(parseLanInfo('{"game":"minecraft","port":8322,"players":1,"open":true}', url), null)
  assert.equal(parseLanInfo('{"game":"backrooms","port":99999,"players":1,"open":true}', url), null)
  assert.equal(parseLanInfo('not-json at all', url), null)
  assert.equal(parseLanInfo('null', url), null)
})

test('parseLanInfo marca como não-entrável sala cheia ou partida em curso', () => {
  const url = `http://192.168.1.9:8322/lan-info`
  const cheia = parseLanInfo('{"game":"backrooms","name":"X","port":8322,"players":2,"open":false}', url)
  assert.equal(cheia.open, false)
  const vazia = parseLanInfo('{"game":"backrooms","name":"X","port":8322,"players":0,"open":false}', url)
  assert.equal(vazia.open, false)
})

test('scanLan encontra salas e ignora máquinas sem relé', async () => {
  const salas = {
    'http://192.168.1.20:8322/lan-info': JSON.stringify({ game: 'backrooms', name: 'CASA', port: 8322, players: 1, open: true }),
    'http://192.168.1.99:8322/lan-info': JSON.stringify({ game: 'backrooms', name: 'CHÉIA', port: 8322, players: 2, open: false }),
  }
  const fetchImpl = async (url) => {
    if (salas[url]) return { ok: true, text: async () => salas[url] }
    throw new Error('recusado')
  }
  const rooms = await scanLan({ fetchImpl, prefixes: ['192.168.1'], timeoutMs: 50, concurrency: 32 })
  assert.equal(rooms.length, 2)              // sala aberta E sala cheia (cheia listada mas não-entrável)
  assert.deepEqual(rooms.map(r => r.host), ['192.168.1.20', '192.168.1.99'])
  assert.equal(rooms[0].open, true)
  assert.equal(rooms[1].open, false)
})

test('scanLan lista sala cheia mas como não-entrável', async () => {
  const cheia = JSON.stringify({ game: 'backrooms', name: 'DUPLA', port: 8322, players: 2, open: false })
  const fetchImpl = async (url) => url.startsWith('http://10.0.0.7:') ? { ok: true, text: async () => cheia } : Promise.reject(new Error('morto'))
  const rooms = await scanLan({ fetchImpl, prefixes: ['10.0.0'], timeoutMs: 50, concurrency: 32 })
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0].open, false)
})

test('scanLan reporta progresso e devolve ordenado numericamente', async () => {
  let seen = 0
  const mk = (host) => [`http://10.0.0.${host}:8322/lan-info`, JSON.stringify({ game: 'backrooms', name: 'S', port: 8322, players: 1, open: true })]
  const table = Object.fromEntries([mk(9), mk(100), mk(12)])
  const fetchImpl = async (url) => table[url] ? { ok: true, text: async () => table[url] } : Promise.reject(new Error('x'))
  const rooms = await scanLan({ fetchImpl, prefixes: ['10.0.0'], timeoutMs: 50, concurrency: 16, onProgress: (done, total) => { seen = Math.max(seen, done); assert.ok(total >= done) } })
  assert.deepEqual(rooms.map(r => r.host), ['10.0.0.9', '10.0.0.12', '10.0.0.100'])
  assert.equal(seen, 254)
})

test('defaultPrefixes inclui localhost e cobre /24 comuns', () => {
  const p = defaultPrefixes()
  assert.ok(p.includes('127.0.0'))
  assert.ok(p.includes('192.168.1'))
  assert.ok(p.length >= 4)
})

test('parseLanInfo propaga o id da sala', () => {
  const room = parseLanInfo('{"game":"backrooms","name":"S","port":8322,"players":1,"open":true,"room":"abc123"}', 'http://10.0.0.5:8322/lan-info')
  assert.equal(room.room, 'abc123')
})

test('scanLan dedup pela mesma sala em vários endereços (loopback 127/8)', async () => {
  const body = JSON.stringify({ game: 'backrooms', name: 'S', port: 8322, players: 1, open: true, room: 'sala-dedup' })
  const fetchImpl = async (url) => url.includes('127.0.0.7') || url.includes('127.0.0.1:') ? { ok: true, text: async () => body } : Promise.reject(new Error('x'))
  const rooms = await scanLan({ fetchImpl, prefixes: ['127.0.0'], timeoutMs: 50, concurrency: 32 })
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0].room, 'sala-dedup')
  assert.equal(rooms[0].host, '127.0.0.1')   // o canónico fica
})

test('scanLan salas com ids diferentes aparecem separadas', async () => {
  const bodies = {
    'http://192.168.0.10:': { name: 'A', room: 'a1' },
    'http://192.168.0.11:': { name: 'B', room: 'b2' },
  }
  const fetchImpl = async (url) => {
    for (const [prefix, b] of Object.entries(bodies)) {
      if (url.startsWith(prefix)) return { ok: true, text: async () => JSON.stringify({ game: 'backrooms', port: 8322, players: 1, open: true, ...b }) }
    }
    return Promise.reject(new Error('x'))
  }
  const rooms = await scanLan({ fetchImpl, prefixes: ['192.168.0'], timeoutMs: 50, concurrency: 32 })
  assert.deepEqual(rooms.map(r => r.room).sort(), ['a1', 'b2'])
})
