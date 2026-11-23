import { defineConfig } from 'vitest/config';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offline-pdf-resources',
      apply: 'build',
      writeBundle({ dir }) {
        for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
          cpSync(
            resolve('node_modules/pdfjs-dist', folder),
            resolve(dir ?? 'dist', 'pdf-assets', folder),
            { recursive: true },
          );
        }
      },
    },
  ],
  clearScreen: false,
  test: { include: ['tests/**/*.test.{ts,tsx}', 'benchmarks/**/*.test.{ts,tsx}'] },
  server: { strictPort: true, port: 1420, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          editor: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/lang-markdown',
          ],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
});
