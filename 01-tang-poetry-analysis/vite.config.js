import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './', // 适配 GitHub Pages 相对路径部署
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'web/index.html'),
        poets: resolve(import.meta.dirname, 'web/poets.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  }
});
