import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// atomic-sentient-hospital runs on its own port (5175), separate from sentient-scene1 (5173)
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, open: true },
})
