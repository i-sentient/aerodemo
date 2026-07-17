import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Scene-3 shares Scene-2's node_modules via a symlink, so its Vite dep-cache is
// pinned to a LOCAL dir (not node_modules/.vite, which would collide with Scene-2).
export default defineConfig({
  plugins: [react()],
  cacheDir: '.vite',
  server: { port: 5270, strictPort: true, open: false },
})
