import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'static', base: './', publicDir: '../public',
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  plugins: [tailwindcss(), react()],
  build: { outDir: '../dist', emptyOutDir: true },
});
