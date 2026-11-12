import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/server-tuning-wiki/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
  },
})
