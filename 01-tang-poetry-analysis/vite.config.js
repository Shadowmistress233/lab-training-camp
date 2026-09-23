import { resolve } from 'path';
import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  root: 'web',
  base: './', // 适配 GitHub Pages 相对路径部署
  plugins: [
    {
      name: 'copy-data-assets',
      closeBundle() {
        const srcDir = resolve(import.meta.dirname, 'web/data');
        const destDir = resolve(import.meta.dirname, 'dist/data');
        if (fs.existsSync(srcDir)) {
          fs.cpSync(srcDir, destDir, { recursive: true });
        }
      },
    },
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'web/index.html'),
        poets: resolve(import.meta.dirname, 'web/poets.html'),
        clusters: resolve(import.meta.dirname, 'web/clusters.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});

