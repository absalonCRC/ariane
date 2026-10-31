import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
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
