// NSAMBO ENGINE — renderer.js — forward renderer WebGL2 (sombras → PBR → pós PSX)
import { VS_MESH, VS_DEPTH, VS_POST, FS_DEPTH, FS_MAIN, FS_POST, VS_CONE, FS_CONE, VS_DUST, FS_DUST } from './shaders.js'
import { buildShaft, buildDust, coneModel } from './volumetrics.js'

function compile(gl, type, src, define) {
  const full = define ? src.replace('#version 300 es\n', `#version 300 es\n${define}\n`) : src
  const sh = gl.createShader(type)
  gl.shaderSource(sh, full)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('Shader não compilou:\n' + log + '\n---\n' + full.split('\n').slice(0, 6).join('\n'))
  }
  return sh
}
function link(gl, vsrc, fsrc, define) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsrc, define))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsrc, define))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link falhou: ' + gl.getProgramInfoLog(p))
  return p
}
function uniforms(gl, p, names) { const o = {}; for (const n of names) o[n] = gl.getUniformLocation(p, n); return o }

export class Renderer {
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL2 não disponível neste navegador')
    this.canvas = canvas
    this.gl = gl
    this.opts = opts
    this.meshes = []
    this.psxSnap = !!opts.psxSnap
    this.fps = 60
  }

  init() {
    const gl = this.gl
    // programas
    this.progMain = link(gl, VS_MESH, FS_MAIN, this.psxSnap ? '#define PSX_SNAP' : '')
    this.progDepth = link(gl, VS_DEPTH, FS_DEPTH)
    this.progPost = link(gl, VS_POST, FS_POST)
    this.uMain = uniforms(gl, this.progMain, [
      'uViewProj', 'uModel', 'uCameraPos',
      'tAlbedo', 'tNormal', 'tRough', 'tAO', 'tHeight', 'tShadowMap', 'tEmissive', 'uEmissiveMap',
      'uUntextured', 'uBaseColor', 'uMetallic', 'uRoughness', 'uEmissiveColor', 'uEmissive',
      'uPomScale', 'uNormalFlip', 'uAlbedoTint', 'uHemiSky', 'uHemiGround', 'uHemiIntensity',
      'uPointCount', 'uPointPos', 'uPointColor', 'uPointRadius',
      'uSpotOn', 'uSpotPos', 'uSpotDir', 'uSpotColor', 'uSpotIntensity', 'uSpotCosInner', 'uSpotCosOuter', 'uLightMatrix',
      'uFogColor', 'uFogDensity',
    ])
    this.uDepth = uniforms(gl, this.progDepth, ['uViewProj', 'uModel'])
    // programas volumétricos (cone de foco / poeira) e pós com pulso bodycam
    this.progCone = link(gl, VS_CONE, FS_CONE)
    this.progDust = link(gl, VS_DUST, FS_DUST)
    this.uCone = uniforms(gl, this.progCone, ['uViewProj', 'uModel', 'uColor', 'uIntensity', 'uTime', 'uCamPos'])
    this.uDust = uniforms(gl, this.progDust, ['uViewProj', 'uCamPos', 'uBox', 'uTime'])
    this.uPost = uniforms(gl, this.progPost, ['tScene', 'uRes', 'uTime', 'uGrain', 'uVignette', 'uLevels', 'uPulse', 'uTorchUV', 'uTorchI'])
    // cone unitário + sementes de poeira
    this._unitCone = buildShaft()
    this._coneVao = gl.createVertexArray()
    gl.bindVertexArray(this._coneVao)
    const conePos = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, conePos)
    gl.bufferData(gl.ARRAY_BUFFER, this._unitCone.positions, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    const coneNrm = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, coneNrm)
    gl.bufferData(gl.ARRAY_BUFFER, this._unitCone.normals, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    const coneIdx = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, coneIdx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._unitCone.indices, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    const dust = buildDust(150, [6.5, 2.6, 6.5], 1337)
    this._dustCount = dust.aRnd.length / 2
    this._dustVao = gl.createVertexArray()
    gl.bindVertexArray(this._dustVao)
    const seedBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf)
    gl.bufferData(gl.ARRAY_BUFFER, dust.aSeed, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    const rndBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, rndBuf)
    gl.bufferData(gl.ARRAY_BUFFER, dust.aRnd, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    // VAO do triângulo de ecrã inteiro
    this.postVao = gl.createVertexArray()
    gl.bindVertexArray(this.postVao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
    gl.bindVertexArray(null)
    // FBO de cena + FBO de sombra
    this._makeSceneFbo(this.canvas.width, this.canvas.height)
    this._makeShadowFbo()
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
  }

  _makeSceneFbo(w, h) {
    const gl = this.gl
    if (this.sceneTex) gl.deleteTexture(this.sceneTex)
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo)
    this.sceneTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    const depth = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h)
    this.sceneFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this._depthRb = depth
  }

  _makeShadowFbo() {
    const gl = this.gl
    this.shadowTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1024, 1024, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.shadowFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0)
    gl.drawBuffers([gl.NONE])
    gl.readBuffer(gl.NONE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr))
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr))
    if (w === this.canvas.width && h === this.canvas.height) return
    this.canvas.width = w
    this.canvas.height = h
    this._makeSceneFbo(w, h)
  }

  setScene(built) {
    const gl = this.gl
    this.meshes = built.meshes.map((m, i) => ({ ...this._upload(m), phase: (i * 2.399963) % 6.2832 }))
    const dm = built.doorMeshes
    this._uploadDynamic('doorL', dm.left)
    this._uploadDynamic('doorR', dm.right)
    this._uploadDynamic('doorHwL', dm.hwLeft)
    this._uploadDynamic('doorHwR', dm.hwRight)
  }

  // GLB carregado pelo jogo → malha dinâmica + textura própria (flipY=false)
  async setModel(name, glb) {
    const gl = this.gl
    glb.__name = name
    this['mesh_' + name] = this._upload(glb)
    this['tex_' + name] = await this._uploadGlbTexture(glb.textureBlob)
  }

  // viewmodel: posições atualizadas por frame (blend de poses no CPU)
  async setDynamicModel(name, glb) {
    const gl = this.gl
    glb.__name = name
    this['mesh_' + name] = this._upload(glb, { dynamic: true })
    this['tex_' + name] = await this._uploadGlbTexture(glb.textureBlob)
  }

  // normais/tangentes recomputadas no CPU têm de subir junto com as posições —
  // caso contrário a iluminação continua a ver a pose original (VM-006)
  updateDynamic(name, positions, normals, tangents) {
    const gl = this.gl
    const buf = this['dynpos_' + name]
    if (buf) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions) }
    const nb = this['dynnor_' + name]
    if (nb && normals) { gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals) }
    const tb = this['dyntan_' + name]
    if (tb && tangents) { gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tangents) }
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
  }

  async _uploadGlbTexture(blob) {
    if (!blob) return this.textures?.sign ?? null
    const bmp = await createImageBitmap(blob)
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    return tex
  }

  _upload(m, { dynamic = false } = {}) {
    const gl = this.gl
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const mk = (data, loc, size, dyn = false) => {
      const b = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, b)
      gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      return b
    }
    const posBuf = mk(m.positions, 0, 3, dynamic)
    if (dynamic) {
      this['dynpos_' + m.__name] = posBuf
      this['dynnor_' + m.__name] = mk(m.normals, 1, 3, true)
      if (m.tangents) this['dyntan_' + m.__name] = mk(m.tangents, 2, 4, true)
    } else {
      mk(m.normals, 1, 3)
      mk(m.tangents, 2, 4)
    }
    mk(m.uvs, 3, 2)
    const idx = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    return { ...m, vao, indexCount: m.indices.length }
  }

  _uploadDynamic(name, raw) {
    this['mesh_' + name] = this._upload(raw)
  }

  // frame = { viewProj, lightViewProj, cameraPos, time, lights, fog, spot, doorMatrix, keyMatrix, keyVisible, quality }
  render(frame) {
    const gl = this.gl
    const dynMeshes = [
      // porta dupla — as folhas deslizam para os bolsos na parede (não afundam no chão)
      this.mesh_doorL ? { ...this.mesh_doorL, model: frame.doorMatrixL ?? IDENTITY, material: 'door' } : null,
      this.mesh_doorR ? { ...this.mesh_doorR, model: frame.doorMatrixR ?? IDENTITY, material: 'door' } : null,
      this.mesh_doorHwL ? { ...this.mesh_doorHwL, model: frame.doorMatrixL ?? IDENTITY, material: 'doorHw', untextured: { baseColor: [0.86, 0.68, 0.30], metallic: 0.9, roughness: 0.28 } } : null,
      this.mesh_doorHwR ? { ...this.mesh_doorHwR, model: frame.doorMatrixR ?? IDENTITY, material: 'doorHw', untextured: { baseColor: [0.86, 0.68, 0.30], metallic: 0.9, roughness: 0.28 } } : null,
      ...(frame.keyVisible && this.mesh_key ? [{ ...this.mesh_key, model: frame.keyMatrix, material: 'modelKey', hot: frame.keyHot }] : []),
      ...(frame.noteMatrix && this.mesh_note ? [{ ...this.mesh_note, model: frame.noteMatrix, material: 'modelNote' }] : []),
      ...(frame.fuseMatrix && this.mesh_fuse ? [{ ...this.mesh_fuse, model: frame.fuseMatrix, material: 'modelProp', tex: this.tex_fuse, emissive: 0.30, ec: [1.0, 0.86, 0.5], rough: 0.5 }] : []),
      ...(frame.cassetteMatrix && this.mesh_cassette ? [{ ...this.mesh_cassette, model: frame.cassetteMatrix, material: 'modelProp', tex: this.tex_cassette, emissive: 0.35, ec: [0.75, 0.85, 1.0], rough: 0.55 }] : []),
      ...(frame.crowbarMatrix && this.mesh_crowbar ? [{ ...this.mesh_crowbar, model: frame.crowbarMatrix, material: 'modelProp', tex: this.tex_crowbar, rough: 0.4, metallic: 0.75 }] : []),
      ...(frame.medkitMatrix && this.mesh_medkit ? [{ ...this.mesh_medkit, model: frame.medkitMatrix, material: 'modelProp', tex: this.tex_medkit, emissive: 0.10, ec: [1.0, 0.32, 0.28], rough: 0.6 }] : []),
      ...(frame.flashDeadMatrix && this.mesh_flashdead ? [{ ...this.mesh_flashdead, model: frame.flashDeadMatrix, material: 'modelProp', tex: this.tex_flashdead, rough: 0.45, metallic: 0.5 }] : []),
      ...(this.mesh_marker ? (frame.markers ?? []).map(mm => ({ ...this.mesh_marker, model: mm, material: 'modelProp', tex: this.tex_marker, emissive: 0.95, ec: [1.0, 0.96, 0.86], rough: 0.7 })) : []),
    ].filter(Boolean)
    const all = [...this.meshes.map(m => {
      if (m.material !== 'panelBad') return { ...m, model: IDENTITY }
      const t = frame.time, ph = m.phase
      const v = Math.sin(t * 11 + ph) * Math.sin(t * 4.7 + ph * 1.7 + 1.3)
      return { ...m, model: IDENTITY, flick: v > -0.35 ? 1.15 : 0.15 }
    }), ...dynMeshes]
    if (frame.stalkerMatrix && this.mesh_stalker) {
      all.push({ ...this.mesh_stalker, model: frame.stalkerMatrix, material: 'modelStalker', pulse: 2.75 + 0.55 * Math.sin(frame.time * 1.65 + 0.8) })
    }

    // ── passe de sombra (só a lanterna projecta) ──────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.viewport(0, 0, 1024, 1024)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.FRONT)   // reduz peter-panning
    gl.useProgram(this.progDepth)
    gl.uniformMatrix4fv(this.uDepth.uViewProj, false, frame.lightViewProj)
    for (const m of all) {
      gl.uniformMatrix4fv(this.uDepth.uModel, false, m.model)
      gl.bindVertexArray(m.vao)
      gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_INT, 0)
    }
    gl.cullFace(gl.BACK)

    // ── passe principal (PBR) para o FBO de cena ───────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(frame.fog[0], frame.fog[1], frame.fog[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.progMain)
    gl.uniformMatrix4fv(this.uMain.uViewProj, false, frame.viewProj)
    gl.uniform3fv(this.uMain.uCameraPos, frame.cameraPos)
    gl.uniform3fv(this.uMain.uHemiSky, frame.hemiSky)
    gl.uniform3fv(this.uMain.uHemiGround, frame.hemiGround)
    gl.uniform1f(this.uMain.uHemiIntensity, frame.hemiIntensity)
    gl.uniform1i(this.uMain.uPointCount, frame.points.length)
    if (frame.points.length) {
      gl.uniform3fv(this.uMain.uPointPos, frame.points.flatMap(p => p.pos))
      gl.uniform3fv(this.uMain.uPointColor, frame.points.flatMap(p => p.color))
      gl.uniform1fv(this.uMain.uPointRadius, frame.points.map(p => p.radius))
    }
    gl.uniform1i(this.uMain.uSpotOn, frame.spot.on ? 1 : 0)
    if (frame.spot.on) {
      gl.uniform3fv(this.uMain.uSpotPos, frame.spot.pos)
      gl.uniform3fv(this.uMain.uSpotDir, frame.spot.dir)
      gl.uniform3fv(this.uMain.uSpotColor, frame.spot.color)
      gl.uniform1f(this.uMain.uSpotIntensity, frame.spot.intensity)
      gl.uniform1f(this.uMain.uSpotCosInner, Math.cos(frame.spot.inner))
      gl.uniform1f(this.uMain.uSpotCosOuter, Math.cos(frame.spot.outer))
      gl.uniformMatrix4fv(this.uMain.uLightMatrix, false, frame.lightMatrix)
    }
    gl.uniform3fv(this.uMain.uFogColor, frame.fog)
    gl.uniform1f(this.uMain.uFogDensity, frame.fogDensity)
    // texturas partilhadas
    gl.activeTexture(gl.TEXTURE5)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(this.uMain.tShadowMap, 5)

    for (const m of all) {
      this._bindMaterial(m)
      gl.uniformMatrix4fv(this.uMain.uModel, false, m.model)
      gl.bindVertexArray(m.vao)
      gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_INT, 0)
    }

    // ── volumétricos aditivos (cones de foco + poeira) — após opacos, antes dos braços ──
    this._drawVolumetrics(frame)


    // ── lanterna em 1ª pessoa (viewmodel): FOV largo, sem mãos ─────
    if (frame.flashMatrix && this.mesh_flash && frame.viewmodelViewProj) {
      gl.clear(gl.DEPTH_BUFFER_BIT)
      gl.uniformMatrix4fv(this.uMain.uViewProj, false, frame.viewmodelViewProj)
      this._bindMaterial({ ...this.mesh_flash, material: 'modelFlash', model: frame.flashMatrix })
      gl.bindVertexArray(this.mesh_flash.vao)
      gl.drawElements(gl.TRIANGLES, this.mesh_flash.indexCount, gl.UNSIGNED_INT, 0)
      if (frame.heldKeyMatrix && this.mesh_key) {
        this._bindMaterial({ ...this.mesh_key, material: 'modelKey', model: frame.heldKeyMatrix, hot: Math.min(1.4, (frame.keyHot ?? 0.6) + 0.3) })
        gl.bindVertexArray(this.mesh_key.vao)
        gl.drawElements(gl.TRIANGLES, this.mesh_key.indexCount, gl.UNSIGNED_INT, 0)
      }
      gl.uniformMatrix4fv(this.uMain.uViewProj, false, frame.viewProj)
    }

    // ── passe de pós (dither + quantização + grão) ─────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(this.progPost)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.uniform1i(this.uPost.tScene, 0)
    gl.uniform2f(this.uPost.uRes, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.uPost.uTime, frame.time)
    gl.uniform1f(this.uPost.uGrain, frame.grain)
    gl.uniform1f(this.uPost.uVignette, frame.vignette)
    gl.uniform1f(this.uPost.uLevels, frame.levels)
    gl.uniform1f(this.uPost.uPulse, frame.pulse ?? 0)
    gl.uniform2f(this.uPost.uTorchUV, frame.torchUV?.[0] ?? 0.5, frame.torchUV?.[1] ?? 0.5)
    gl.uniform1f(this.uPost.uTorchI, frame.torchI ?? 0)
    gl.bindVertexArray(this.postVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.enable(gl.DEPTH_TEST)
  }

  _drawVolumetrics(frame) {
    const gl = this.gl
    const cones = frame.cones ?? []
    const wantDust = frame.dust !== false
    if (!cones.length && !wantDust) return
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)          // aditivo puro
    gl.depthMask(false)                   // não escreve profundidade (é luz, não objecto)
    gl.disable(gl.CULL_FACE)
    // ── cones de luz ──
    if (cones.length) {
      gl.useProgram(this.progCone)
      gl.uniformMatrix4fv(this.uCone.uViewProj, false, frame.viewProj)
      gl.uniform1f(this.uCone.uTime, frame.time)
      gl.uniform3fv(this.uCone.uCamPos, frame.cameraPos)
      gl.bindVertexArray(this._coneVao)
      for (const c of cones) {
        const model = coneModel(c.apex, c.dir, c.radius, c.length)
        gl.uniformMatrix4fv(this.uCone.uModel, false, model)
        gl.uniform3fv(this.uCone.uColor, c.color)
        gl.uniform1f(this.uCone.uIntensity, c.intensity)
        gl.drawElements(gl.TRIANGLES, this._unitCone.indices.length, gl.UNSIGNED_SHORT, 0)
      }
    }
    // ── poeira em suspensão ──
    if (wantDust) {
      gl.useProgram(this.progDust)
      gl.uniformMatrix4fv(this.uDust.uViewProj, false, frame.viewProj)
      gl.uniform3fv(this.uDust.uCamPos, frame.cameraPos)
      gl.uniform3f(this.uDust.uBox, 6.5, 2.6, 6.5)
      gl.uniform1f(this.uDust.uTime, frame.time)
      gl.bindVertexArray(this._dustVao)
      gl.drawArrays(gl.POINTS, 0, this._dustCount)
    }
    gl.bindVertexArray(null)
    gl.depthMask(true)
    gl.enable(gl.CULL_FACE)
    gl.disable(gl.BLEND)
    // devolve o programa principal — quem vem a seguir (braços/viewmodel) assume progMain ligado
    gl.useProgram(this.progMain)
  }

  _bindMaterial(m) {
    const gl = this.gl, u = this.uMain, T = this.textures
    gl.uniformMatrix4fv(u.uModel, false, m.model ?? IDENTITY)
    // por omissão: sem emissivo / sem POM / não untextured
    gl.uniform1i(u.uUntextured, 0)
    gl.uniform1f(u.uEmissiveMap, 0)
    gl.uniform1f(u.uEmissive, 0)
    gl.uniform3f(u.uEmissiveColor, 1, 1, 1)
    gl.uniform1f(u.uPomScale, 0)
    gl.uniform1f(u.uNormalFlip, 1)
    gl.uniform3f(u.uAlbedoTint, 1, 1, 1)
    gl.uniform1f(u.uMetallic, 0)
    gl.uniform1f(u.uRoughness, 0.85)
    const tex = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit }
    const bindSet = (set) => {
      gl.uniform1i(u.tAlbedo, tex(0, set.albedo))
      gl.uniform1i(u.tNormal, tex(1, set.normal))
      gl.uniform1i(u.tRough, tex(2, set.roughness))
      gl.uniform1i(u.tAO, tex(3, set.ao))
      gl.uniform1i(u.tHeight, tex(4, set.height))
      gl.uniform1f(u.uNormalFlip, set.normalFlip ?? 1)
    }
    // defaults por draw — um material nunca herda estado do anterior (senão o porteiro
    // aparece com o estado da última luminária, como acontecia à chave)
    gl.uniform1i(u.uUntextured, 0)
    gl.uniform1f(u.uPomScale, 0)
    gl.uniform1f(u.uEmissive, 0)
    gl.uniform1f(u.uMetallic, 0)
    gl.uniform1f(u.uRoughness, 0.8)
    gl.uniform3f(u.uAlbedoTint, 1, 1, 1)
    gl.uniform3f(u.uEmissiveColor, 0, 0, 0)
    switch (m.material) {
      case 'wall':
        bindSet(T.wall)
        if (m.pom !== false && (this.opts.pom ?? true)) gl.uniform1f(u.uPomScale, 0.045)
        gl.uniform1f(u.uRoughness, 0.72)
        break
      case 'carpet':
        bindSet(T.carpet)
        gl.uniform1f(u.uRoughness, 0.96)
        gl.uniform1f(u.uMetallic, 0)
        break
      case 'ceiling':
        bindSet(T.ceiling)
        // teto NUNCA é preto puro — um fio de luz difusa (forro de lã branca)
        gl.uniform3f(u.uEmissiveColor, 0.32, 0.315, 0.29)
        gl.uniform1f(u.uEmissive, 0.38)
        gl.uniform1f(u.uRoughness, 0.9)
        break
      case 'panelBad':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3f(u.uBaseColor, 0.96, 0.94, 0.88)
        gl.uniform1f(u.uRoughness, 0.4)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.97, 0.86)
        gl.uniform1f(u.uEmissive, m.flick ?? 1.15)
        break
      case 'panel':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3f(u.uBaseColor, 0.96, 0.94, 0.88)
        gl.uniform1f(u.uRoughness, 0.4)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.97, 0.86)
        gl.uniform1f(u.uEmissive, 1.35)
        break
      case 'frame':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'bulb':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3f(u.uBaseColor, 0.95, 0.82, 0.55)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.72, 0.38)
        gl.uniform1f(u.uEmissive, 1.6)
        break
      case 'cornice':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'tableWood':
        bindSet(T.doorWood)
        gl.uniform1f(u.uRoughness, 0.52)
        gl.uniform1f(u.uMetallic, 0.0)
        gl.uniform3f(u.uAlbedoTint, 0.92, 0.88, 0.82)
        break
      case 'wood':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'door':
        bindSet(T.doorWood)
        gl.uniform1f(u.uMetallic, 0.05)
        break
      case 'keycard':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        gl.uniform3fv(u.uEmissiveColor, m.untextured.emissive)
        gl.uniform1f(u.uEmissive, 1.35)
        break
      case 'doorHw':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'modelKey':
        bindSet(this.textures.key)
        gl.uniform1f(u.uMetallic, 0.55)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.68, 0.22)
        gl.uniform1f(u.uEmissive, m.hot ?? 0.6)
        gl.uniform3f(u.uAlbedoTint, 1.06, 1.0, 0.85)
        break
      case 'modelFlash': {
        const t = this.tex_flash
        if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t) }
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.38)
        gl.uniform1f(u.uMetallic, 0.55)
        gl.uniform3f(u.uAlbedoTint, 1.35, 1.3, 1.2)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.9, 0.72)
        gl.uniform1f(u.uEmissive, 0.22)
        break
      }
      case 'modelNote': {
        const t = this.tex_note
        if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t) }
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.85)
        gl.uniform1f(u.uMetallic, 0.0)
        break
      }
      case 'modelProp': {
        const t = m.tex ?? null
        if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t) }
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, m.rough ?? 0.62)
        gl.uniform1f(u.uMetallic, m.metallic ?? 0.08)
        if (m.emissive) {
          const ec = m.ec ?? [1.0, 0.88, 0.66]
          gl.uniform3f(u.uEmissiveColor, ec[0], ec[1], ec[2])
          gl.uniform1f(u.uEmissive, m.emissive)
        }
        if (m.tint) gl.uniform3f(u.uAlbedoTint, m.tint[0], m.tint[1], m.tint[2])
        break
      }
      case 'fuseDoor': {
        const t = this.textures.fuseFront
        if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t) }
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.46)
        gl.uniform1f(u.uMetallic, 0.34)
        break
      }
      case 'fusebox':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'fuseLamp':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3f(u.uBaseColor, 0.92, 0.52, 0.14)
        gl.uniform3f(u.uEmissiveColor, 1.0, 0.58, 0.15)
        gl.uniform1f(u.uEmissive, 1.35)
        break
      case 'modelStalker': {
        bindSet(this.textures.stalker)
        if (T.stalkerEmissive) {
          gl.uniform1i(u.tEmissive, tex(6, T.stalkerEmissive))
          gl.uniform1f(u.uEmissiveMap, 1)
          gl.uniform1f(u.uEmissive, m.pulse ?? 1.3)   // olhos em brasa — pulso lento
        }
        gl.uniform1f(u.uRoughness, 0.58)
        gl.uniform1f(u.uMetallic, 0.0)
        gl.uniform3f(u.uAlbedoTint, 0.88, 0.82, 0.82)
        break
      }
      case 'modelArms': {
        const t = this.tex_arms
        if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t) }
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.78)
        gl.uniform1f(u.uMetallic, 0.0)
        gl.uniform3f(u.uAlbedoTint, 0.60, 0.53, 0.48)   // pele domada — o foco da lanterna é agressivo
        break
      }
      case 'lampHousing':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'lampSteel':
        gl.uniform1i(u.uUntextured, 1)
        gl.uniform3fv(u.uBaseColor, m.untextured.baseColor)
        gl.uniform1f(u.uMetallic, m.untextured.metallic)
        gl.uniform1f(u.uRoughness, m.untextured.roughness)
        break
      case 'sign':
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, T.sign)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)   // albedo da textura; emissivo modulado pelo albedo
        gl.uniform1f(u.uRoughness, 0.5)
        gl.uniform1f(u.uMetallic, 0.0)
        gl.uniform3f(u.uEmissiveColor, 0.65, 1.0, 0.72)
        gl.uniform1f(u.uEmissive, 1.15)
        break
      case 'paintingEye':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.eye)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.62)
        break
      case 'paintingMtn':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.mountains)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.68)
        break
      case 'paintingPortrait':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.portrait)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.6)
        break
      case 'paintingShip':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.ship)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.66)
        break
      case 'paintingCorridor':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.corridor)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.58)
        break
      case 'paintingForest':
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.forest)
        gl.uniform1i(u.tAlbedo, 0)
        gl.uniform1i(u.uUntextured, 2)
        gl.uniform1f(u.uRoughness, 0.7)
        break
      default:
        bindSet(T.wall)
    }
  }

  setTextures(t) {
    this.textures = t
    // resolve o set PBR das signaturas: paintings etc. precisam de sets completos;
    // a porta do quadro usa apenas albedo (textura própria)
    if (!this.textures.fuseFront) this.textures.fuseFront = t.fuseFront ?? null
  }
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
