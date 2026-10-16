import { defineConfig } from 'vite';

// base: './' — чтобы собранная игра открывалась из файла (Electron)
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
