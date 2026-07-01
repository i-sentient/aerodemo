import { defineConfig } from 'vite';

// Single-page app. base:'./' so a production build can be served from any path.
export default defineConfig({
  base: './',
  server: { open: true, port: 5180 },
  build: { target: 'es2020', outDir: 'dist' },
});
