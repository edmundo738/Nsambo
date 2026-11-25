// NSAMBO ENGINE — flashlight.js — regras da lanterna (PURAS). Corrige: luz com bateria 0 voltava com F.
export const lightIsOn = (on, battery) => !!on && battery > 0
export function toggleFlashlight(on, battery) {
  if (battery <= 0) return { on: false, denied: true }
  return { on: !on, denied: false }
}
