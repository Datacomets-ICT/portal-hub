import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Deployed at portal-hub.vercel.app/meeting/, so assets must resolve to
  // /meeting/assets/* — not /assets/* (which is the portal hub root).
  base: '/meeting/',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: true },
});
