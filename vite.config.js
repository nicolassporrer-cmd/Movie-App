import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project-site deploy: everything is served under /Movie-App/
export default defineConfig({
  base: '/Movie-App/',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' }
})
