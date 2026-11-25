import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({
  base: './',
  publicDir: '../assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: { input: resolve(__dirname, 'backrooms.html') }
  }
})
