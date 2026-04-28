import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, open: true },
  build: { outDir: 'dist', sourcemap: true },
  // IT_Ticket legacy static app is served verbatim from /public/it/
  // so the iframe at route /it can load it as /it/index.html on the same origin
  // (sessionStorage is shared cross-route when origins match).
});
