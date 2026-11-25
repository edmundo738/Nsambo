import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: '../assets',          // assets/textures/*.jpg servidos em /textures/...
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,            // preview do Arena (host *.e2b.app)
    fs: { allow: ['..'] }
  }
})
