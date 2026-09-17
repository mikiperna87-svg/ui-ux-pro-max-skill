import { config } from 'dotenv'

config({ path: '.env.test', quiet: true })
config({ path: '.env.local', quiet: true })

// I test di componente girano in jsdom (docblock @vitest-environment jsdom):
// solo in quel caso servono i matcher del DOM.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}
