import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Risoluzione nativa degli alias "@/..." dal tsconfig.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 20_000,
  },
})
