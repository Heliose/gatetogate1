import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Single page: index.html → src/main.js
export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400, // three dominates the bundle
    rolldownOptions: {
      input: { app: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
