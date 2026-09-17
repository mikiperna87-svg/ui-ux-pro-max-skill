import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ToastProvider } from '@/components/ui/toast'
import { readTheme } from '@/server/preferences'
import './globals.css'

// Un solo font variabile, servito dal nostro dominio: nessuna richiesta a terzi
// e nessuno spostamento del testo al caricamento.
const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-latin-variable.woff2', weight: '100 900', style: 'normal' },
    { path: '../../public/fonts/inter-latin-ext-variable.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: {
    default: 'Gestionale Viaggi',
    template: '%s · Gestionale Viaggi',
  },
  description:
    'Gestionale per agenzie di viaggio: pratiche, preventivi, incassi, scadenze fornitore e fatturazione.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1c1a' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await readTheme()

  return (
    <html
      lang="it"
      // Nessun attributo quando la preferenza e' "sistema": decide la media query.
      {...(theme === 'system' ? {} : { 'data-theme': theme })}
      suppressHydrationWarning
      className={inter.variable}
    >
      <body>
        <a
          href="#contenuto"
          className="sr-only-focusable absolute left-3 top-3 z-[100] rounded-md bg-accent px-3 py-2 text-small font-medium text-accent-fg shadow-e2"
        >
          Salta al contenuto
        </a>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
