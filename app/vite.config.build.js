import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync } from 'node:fs'

// O Tauri serve por convenção <frontendDist>/index.html na raiz.
// O jogo chama-se backrooms.html — emitimos os dois cópias idênticas.
export default defineConfig({
  base: './',
  publicDir: '../assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: { input: resolve(__dirname, 'backrooms.html') }
  },
  plugins: [
    {
      name: 'emit-index-html',
      closeBundle() {
        copyFileSync(resolve(__dirname, 'dist/backrooms.html'), resolve(__dirname, 'dist/index.html'))
        console.log('dist/index.html ✓ (cópia para o Tauri)')
      }
    }
  ]
})
