import { defineConfig, devices } from '@playwright/test'

/**
 * I percorsi pubblici (accesso, recupero password, registrazione) si verificano
 * senza backend: sono quelli che un utente incontra prima di avere una sessione.
 *
 * I percorsi autenticati richiedono un progetto Supabase raggiungibile: si
 * attivano impostando E2E_SUPABASE=1 insieme alle credenziali in .env.local.
 *
 * In ambienti dove il browser di Playwright e' preinstallato altrove, basta
 * esportare PLAYWRIGHT_CHROMIUM_PATH con il percorso dell'eseguibile.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Il server di sviluppo compila una pagina alla volta: troppi lavoratori
  // in parallelo allungano i tempi invece di accorciarli.
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/accedi',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // La suite apre decine di sessioni in pochi secondi: senza alzare la
          // soglia il limitatore la bloccherebbe, e a ragione.
          LIMITE_ACCESSO: '500',
          LIMITE_MAGIC_LINK: '500',
          LIMITE_RECUPERO: '500',
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'chiave-anonima-di-sviluppo-locale-0000',
          SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'chiave-di-servizio-di-sviluppo-locale-0000',
        },
      },
})
