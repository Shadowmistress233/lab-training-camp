import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './', // 适配 GitHub Pages 相对路径部署
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true, // 允许局域网或本地多端访问
  }
});
