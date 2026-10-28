import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

function rewriteDocs(req: { url?: string }, _res: unknown, next: () => void) {
  if (req.url && /^\/docs(\/[a-z0-9-]*)?$/.test(req.url.split('?')[0])) req.url = '/docs/index.html';
  next();
}

/** In dev, serve the docs app for every /docs/... path (Vercel does the same with a rewrite). */
function docsFallback(): Plugin {
  return {
    name: 'docs-fallback',
    configureServer(server) {
      server.middlewares.use(rewriteDocs);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriteDocs);
    },
  };
}

export default defineConfig({
  plugins: [react(), docsFallback()],
  build: {
    rollupOptions: {
      // Two separate pages: the wallet and the docs. The docs never load wallet code.
      input: {
        main: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
      },
      output: {
        // Keep the large ethers library in its own cacheable chunk.
        manualChunks: { ethers: ['ethers'] },
      },
    },
  },
});
