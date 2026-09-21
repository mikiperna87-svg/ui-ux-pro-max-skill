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
    // HSTS solo in produzione: su localhost dice al browser di usare HTTPS
    // anche lì, e da quel momento lo sviluppo non funziona più finché non si
    // svuota a mano la cache delle politiche.
    const produzione = process.env.NODE_ENV === 'production'

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Resta accanto a `frame-ancestors` della CSP, che lo sostituisce
          // sui browser moderni: questo serve a quelli che non la leggono.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(produzione
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ]
  },
}

export default nextConfig
