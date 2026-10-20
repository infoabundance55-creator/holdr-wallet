import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the large ethers library in its own cacheable chunk.
        manualChunks: { ethers: ['ethers'] },
      },
    },
  },
});
