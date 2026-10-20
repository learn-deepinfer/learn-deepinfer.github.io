import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: {
    markdown: ['react-markdown', 'remark-gfm'],
    syntax: ['highlight.js/lib/core', 'highlight.js/lib/languages/python', 'highlight.js/lib/languages/bash'],
  } } } },
});
