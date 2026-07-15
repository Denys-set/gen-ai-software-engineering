import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The dev server proxies /api → the Express backend so the browser makes
// same-origin requests (no CORS config needed on the API during development).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
