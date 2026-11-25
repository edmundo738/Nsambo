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
  const [wall, carpet, ceiling, eye, mountains, key, doorWood, exitGlow] = await Promise.all([
    loadPBRSet(gl, `${basePath}/wallpaper-yellow`),
    loadPBRSet(gl, `${basePath}/carpet-tile`),
    loadPBRSet(gl, `${basePath}/ceiling-tile`),
    loadOne(gl, `${basePath}/painting-eye.jpg`, { srgb: true }),
    loadOne(gl, `${basePath}/painting-mountains.jpg`, { srgb: true }),
    loadPBRSet(gl, `${basePath}/key-iron`, { normalFlip: 1, flipY: false }),   // ferro envelhecido — NUNCA o amarelo da parede
    loadPBRSet(gl, `${basePath}/door-wood`, { normalFlip: 1 }),
    loadOne(gl, `${basePath}/exit-glow.png`, { srgb: true }),
  ])
  // sinal SAÍDA — tipografia gerada em canvas (não é textura de material pintada à mão)
  const sign = makeSignTexture(gl)
  return { wall, carpet, ceiling, eye, mountains, key, doorWood, exitGlow, sign }
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
