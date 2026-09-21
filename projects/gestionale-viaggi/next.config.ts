import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // Nessun errore di tipo viene ignorato: la build fallisce se il type-check fallisce.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src'],
  },
  experimental: {
    // Le Server Action ricevono solo payload piccoli (form): limite stretto per sicurezza.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Il PDF del preventivo legge i due file del carattere dal disco: senza
  // questa riga finiscono fuori dal pacchetto della funzione e in produzione
  // il documento uscirebbe senza il simbolo dell'euro.
  outputFileTracingIncludes: {
    '/preventivi/[id]/pdf': ['./src/server/pdf/fonts/*.ttf'],
    '/fatture/[id]/pdf': ['./src/server/pdf/fonts/*.ttf'],
    // La scheda della fattura contiene la Server Action che allega il PDF
    // all'email: il carattere deve viaggiare anche con quella rotta, o
    // l'allegato uscirebbe senza il simbolo dell'euro.
    '/fatture/[id]': ['./src/server/pdf/fonts/*.ttf'],
    '/impostazioni': ['./src/server/pdf/fonts/*.ttf'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
