import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const qui = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Risoluzione nativa degli alias "@/..." dal tsconfig.
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` è una guardia di compilazione: sul server è un modulo
      // vuoto, e in prova deve esserlo altrettanto (vedi tests/server-only.ts).
      'server-only': path.resolve(qui, 'tests/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 20_000,
  },
})
