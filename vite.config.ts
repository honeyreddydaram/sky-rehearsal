import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'reload-rehearsal',
      // Legacy engines own listeners and the animation loop. A full reload avoids
      // running two copies when a React panel or engine changes during development.
      handleHotUpdate({file, server}) {
        if (file.includes('/src/')) {
          server.ws.send({type: 'full-reload'});
          return [];
        }
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    proxy: {'/api': process.env.SKY_API_ORIGIN || 'http://127.0.0.1:8000'},
  },
  define: {CESIUM_BASE_URL: JSON.stringify('./cesium/')},
});
