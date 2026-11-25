// NSAMBO ENGINE — shaders.js — GLSL (WebGL2 / GLSL ES 3.00)
// PBR metal-rough (GGX/Smith), POM nas paredes, sombras PCF do foco da lanterna,
// pós-processamento PSX moderno (dither ordenado + quantização + grão + vinheta roxa)

export const VS_MESH = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vTangent;
out vec2 vUV;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNorm);
  vTangent = vec4(mat3(uModel) * aTangent.xyz, aTangent.w);
  vUV = aUV;
  vec4 clip = uViewProj * wp;
  #ifdef PSX_SNAP
    clip.xy = floor(clip.xy / clip.w * 180.0 + 0.5) / 180.0 * clip.w;
  #endif
  gl_Position = clip;
}`

export const VS_DEPTH = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main() {
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`

export const FS_DEPTH = /* glsl */`#version 300 es
precision mediump float;
void main() { }`

export const FS_MAIN = /* glsl */`#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vTangent;
in vec2 vUV;
out vec4 fragColor;

uniform vec3 uCameraPos;
uniform sampler2D tAlbedo, tNormal, tRough, tAO, tHeight;
uniform int  uUntextured;      // 0 = mapas PBR · 1 = parâmetros planos
uniform vec3 uBaseColor;
uniform float uMetallic, uRoughness;
uniform vec3 uEmissiveColor;
uniform float uEmissive;
uniform vec3 uAlbedoTint;
uniform float uPomScale;       // >0 activa parallax oclusion mapping
uniform float uNormalFlip;

#define MAX_POINTS 3
uniform vec3  uHemiSky, uHemiGround;
uniform float uHemiIntensity;
uniform int   uPointCount;
uniform vec3  uPointPos[MAX_POINTS], uPointColor[MAX_POINTS];
uniform float uPointRadius[MAX_POINTS];

uniform int   uSpotOn;
uniform vec3  uSpotPos, uSpotDir, uSpotColor;
uniform float uSpotIntensity, uSpotCosInner, uSpotCosOuter;
uniform mat4  uLightMatrix;
uniform sampler2D tShadowMap;

uniform vec3  uFogColor;
uniform float uFogDensity;

const float PI = 3.14159265359;

vec2 parallaxUV(vec2 uv, vec3 Vtan) {
  // UVs tiladas (espaço fract por tile) — POM por tile, sem discard
  const int STEPS = 12;
  float layerDepth = 1.0 / float(STEPS);
  vec2 dUV = (Vtan.xy / max(Vtan.z, 0.15)) * uPomScale / float(STEPS);
  vec2 uvTile = fract(uv);
  vec2 off = vec2(0.0);
  float cur = 0.0;
  float hd = texture(tHeight, uvTile).g;
  for (int i = 0; i < STEPS; i++) {
    if (hd <= cur) break;
    off -= dUV;
    cur += layerDepth;
    hd = texture(tHeight, fract(uvTile + off)).g;
  }
  return uvTile + off;
}

float shadowPCF(vec4 lp) {
  vec3 ndc = lp.xyz / lp.w;
  vec2 suv = ndc.xy * 0.5 + 0.5;
  if (suv.x <= 0.0 || suv.x >= 1.0 || suv.y <= 0.0 || suv.y >= 1.0 || ndc.z > 1.0) return 1.0;
  float bias = 0.0022;
  float s = 0.0;
  vec2 texel = vec2(1.0 / 1024.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float depth = texture(tShadowMap, suv + vec2(float(x), float(y)) * texel).r;
    s += (ndc.z - bias <= depth) ? 1.0 : 0.0;
  }
  return s / 9.0;
}

vec3 pbrDirect(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo, float rough, float metal, vec3 F0) {
  float a = max(rough * rough, 0.045);
  float a2 = a * a;
  float NdotL = max(dot(N, L), 0.0);
  if (NdotL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float HdotV = max(dot(H, V), 0.0);
  float dDen = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / max(PI * dDen * dDen, 1e-6);
  float r = rough + 1.0;
  float k = (r * r) / 8.0;
  float G = (NdotL / (NdotL * (1.0 - k) + k)) * (NdotV / (NdotV * (1.0 - k) + k));
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - HdotV, 5.0);
  vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 1e-4);
  vec3 kd = (vec3(1.0) - F) * (1.0 - metal);
  return (kd * albedo / PI + spec) * radiance * NdotL;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent.xyz);
  vec3 B = cross(N, T) * vTangent.w;
  mat3 TBN = mat3(T, B, N);
  vec3 V = normalize(uCameraPos - vWorldPos);

  vec2 uv = vUV;
  if (uPomScale > 0.0) {
    vec3 Vtan = transpose(TBN) * V;
    uv = parallaxUV(vUV, Vtan);
  }

  vec3 albedo; float rough, metal; float ao = 1.0;
  if (uUntextured == 1) {
    albedo = uBaseColor;
    rough = uRoughness;
    metal = uMetallic;
    ao = 1.0;
  } else if (uUntextured == 2) {
    // albedo de uma textura, restantes parâmetros planos (quadros, sinal)
    albedo = texture(tAlbedo, uv).rgb * uAlbedoTint;
    rough = uRoughness;
    metal = uMetallic;
    ao = 1.0;
  } else {
    vec4 aTex = texture(tAlbedo, uv);
    albedo = aTex.rgb;
    rough = texture(tRough, uv).g;
    metal = uMetallic;   // mapas próprios não incluem metalness — uniforme por material
    ao = texture(tAO, uv).g;
    vec3 nTex = texture(tNormal, uv).rgb * 2.0 - 1.0;
    nTex.y *= uNormalFlip;
    N = normalize(TBN * nTex);
  }
  vec3 F0 = mix(vec3(0.04), albedo, metal);

  // ambiente hemisférico (tecto quente / alcatifa escura)
  float hemiMix = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uHemiGround, uHemiSky, hemiMix) * uHemiIntensity * albedo * ao;

  vec3 color = ambient;

  // luzes pontuais estáticas (saída / chave)
  for (int i = 0; i < MAX_POINTS; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i] - vWorldPos;
    float d = length(toL);
    float r = max(uPointRadius[i], 0.001);
    float w = clamp(1.0 - d * d / (r * r), 0.0, 1.0);
    float att = (w * w) / (d * d + 1.0);
    vec3 L = toL / d;
    color += pbrDirect(N, V, L, uPointColor[i] * att, albedo, rough, metal, F0) * ao;
  }

  // lanterna (foco com cone suave + sombra PCF)
  if (uSpotOn == 1) {
    vec3 toL = uSpotPos - vWorldPos;
    float d = length(toL);
    vec3 L = toL / max(d, 1e-4);
    float cosA = dot(normalize(uSpotDir), -L);
    float cone = smoothstep(uSpotCosOuter, uSpotCosInner, cosA);
    float att = 1.0 / (1.0 + d * d * 0.085);
    vec4 lp = uLightMatrix * vec4(vWorldPos, 1.0);
    float sh = shadowPCF(lp);
    color += pbrDirect(N, V, L, uSpotColor * (cone * att * uSpotIntensity), albedo, rough, metal, F0) * sh;
  }

  // emissivo (painéis fluorescentes / sinal / chave) — modulado pelo albedo
  color += uEmissiveColor * uEmissive * albedo;

  // nevoeiro quente e denso
  float dist = length(uCameraPos - vWorldPos);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFogColor, clamp(f, 0.0, 1.0));
  // ombro suave (fotómico barato) — evita clip a 1.0 e dá filme vintage
  color = max(color, vec3(0.0));
  color = color / (1.0 + color * 0.22);
  fragColor = vec4(color, 1.0);
}`

export const VS_POST = /* glsl */`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const FS_POST = /* glsl */`#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime, uGrain, uVignette, uLevels;
const mat4 BAYER = mat4(
   0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
  12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
   3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
  15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0);
float bayer(vec2 frag) {
  int x = int(mod(frag.x, 4.0));
  int y = int(mod(frag.y, 4.0));
  return BAYER[y][x];
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture(tScene, vUV).rgb;
  // gradação "modern PSX": sombras teal, luzes quentes, orla violeta
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.90, 1.06, 1.10), (1.0 - lum) * 0.38);
  c = mix(c, c * vec3(1.09, 0.95, 1.03), smoothstep(0.55, 1.0, lum) * 0.28);
  // vinheta + névoa violeta nos cantos (a nossa assinatura)
  float d = distance(vUV, vec2(0.5));
  c *= 1.0 - uVignette * smoothstep(0.42, 0.98, d);
  c = mix(c, vec3(0.23, 0.11, 0.31), uVignette * smoothstep(0.60, 1.02, d) * 0.45);
  // quantização com dither ordenado (Bayer 4x4)
  vec2 frag = vUV * uRes;
  float b = bayer(frag) - 0.5;
  c = floor(c * uLevels + b + 0.5) / uLevels;
  // grão de película
  float g = hash12(frag + fract(uTime) * 371.17) - 0.5;
  c += g * uGrain;
  fragColor = vec4(max(c, 0.0), 1.0);
}`
