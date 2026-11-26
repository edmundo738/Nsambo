// NSAMBO ENGINE — textures.js — carregador de texturas + mapas PBR derivados
// Convenção: cada material tem até 5 mapas em /textures/backrooms/<nome>[.<mapa>].jpg
export async function loadOne(gl, url, { srgb = false, mipmap = true, flipY = true } = {}) {
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('textura não encontrada: ' + url))
    i.src = url
  })
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY)
  void(srgb) // pipeline em gamma space (estilo PSX) — sem conversões
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
  if (mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  // anisotropia (onde disponível) — reduz o shimmering PSX em ângulos rasantes
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
  if (aniso) {
    const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
    gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max))
  }
  return tex
}

export async function loadPBRSet(gl, base, { normalFlip = 1, flipY = true } = {}) {
  const [albedo, normal, roughness, ao, height] = await Promise.all([
    loadOne(gl, `${base}.jpg`, { srgb: true, flipY }),
    loadOne(gl, `${base}.normal.jpg`, { flipY }),
    loadOne(gl, `${base}.roughness.jpg`, { flipY }),
    loadOne(gl, `${base}.ao.jpg`, { flipY }),
    loadOne(gl, `${base}.height.jpg`, { flipY }),
  ])
  return { albedo, normal, roughness, ao, height, normalFlip }
}

export async function loadAllTextures(gl, basePath = '/textures/backrooms') {
  const [wall, carpet, ceiling, eye, mountains, key, doorWood] = await Promise.all([
    loadPBRSet(gl, `${basePath}/wallpaper-yellow`),
    loadPBRSet(gl, `${basePath}/carpet-tile`),
    loadPBRSet(gl, `${basePath}/ceiling-tile`),
    loadOne(gl, `${basePath}/painting-eye.jpg`, { srgb: true }),
    loadOne(gl, `${basePath}/painting-mountains.jpg`, { srgb: true }),
    loadPBRSet(gl, `${basePath}/key-iron`, { normalFlip: 1, flipY: false }),   // ferro envelhecido — NUNCA o amarelo da parede
    loadPBRSet(gl, `${basePath}/door-wood`, { normalFlip: 1 }),
  ])
  // sinal SAÍDA — tipografia gerada em canvas (não é textura de material pintada à mão)
  const sign = makeSignTexture(gl)
  const fuseFront = makeFuseboxTexture(gl)
  return { wall, carpet, ceiling, eye, mountains, key, doorWood, sign, fuseFront }
}

// porta do quadro elétrico — aço escovado, raios, stencil âmbar, risco de perigo
function makeFuseboxTexture(gl) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 640
  const ctx = c.getContext('2d')
  // fundo — aço escovado vertical
  ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0, 0, 512, 640)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.030)' : 'rgba(0,0,0,0.10)'
    ctx.lineWidth = Math.random() * 1.6 + 0.4
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 14, 640); ctx.stroke()
  }
  // moldura interna (rebite-cega)
  ctx.strokeStyle = '#0d0d10'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 492, 620)
  ctx.strokeStyle = '#2c2c33'; ctx.lineWidth = 2; ctx.strokeRect(17, 17, 478, 606)
  // ventilação — três fendas
  ctx.fillStyle = '#08080a'
  for (let i = 0; i < 3; i++) ctx.fillRect(96, 470 + i * 26, 320, 9)
  // raio luminoso
  ctx.save(); ctx.translate(256, 168)
  ctx.beginPath()
  ctx.moveTo(18, -92); ctx.lineTo(-34, 8); ctx.lineTo(2, 8); ctx.lineTo(-18, 92); ctx.lineTo(36, -12); ctx.lineTo(0, -12); ctx.closePath()
  ctx.fillStyle = '#f7b733'; ctx.shadowColor = '#ff9d00'; ctx.shadowBlur = 26; ctx.fill()
  ctx.shadowBlur = 0; ctx.strokeStyle = '#3a2a05'; ctx.lineWidth = 5; ctx.stroke()
  ctx.restore()
  // stencil
  ctx.fillStyle = '#e8a33d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.letterSpacing = '10px'
  ctx.font = '900 54px "Courier New", monospace'
  ctx.fillText('QUADRO', 256, 330)
  ctx.fillText('ELÉTRICO', 256, 392)
  ctx.font = '700 22px "Courier New", monospace'; ctx.fillStyle = '#c9a86a'
  ctx.fillText('30A · 250V', 256, 436)
  // faixa de perigo na base
  const stripe = (x, y, w, h, flip) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    for (let i = -4; i < 20; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#d8a723' : '#12120f'
      ctx.beginPath()
      const ox = i * 36
      ctx.moveTo(x + ox, y + h); ctx.lineTo(x + ox + h, y); ctx.lineTo(x + ox + h + 18, y); ctx.lineTo(x + ox + 18, y + h); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }
  stripe(10, 566, 492, 64, false)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return tex
}

function makeSignTexture(gl) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0d2818'
  ctx.fillRect(0, 0, 512, 128)
  ctx.strokeStyle = '#1d4a2c'
  ctx.lineWidth = 6
  ctx.strokeRect(8, 8, 496, 112)
  ctx.fillStyle = '#d8f3dc'
  ctx.font = '700 84px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = '#9bf6b0'
  ctx.shadowBlur = 26
  ctx.fillText('S A Í D A', 256, 68)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return tex
}
