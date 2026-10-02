'use client'

/**
 * Ultimo confine: sostituisce l’intero documento, quindi porta con se' html e body.
 * Stili minimi in linea perché' qui il foglio di stile potrebbe non essere caricato.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f5f4f1',
          color: '#2b2926',
          padding: '1.5rem',
        }}
      >
        <main style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>Errore imprevisto</h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.5, color: '#6b6761', margin: '0 0 1.25rem' }}>
            L’applicazione non è riuscita ad avviarsi. Ricarica la pagina; se il problema persiste,
            contatta l’assistenza indicando il codice riportato qui sotto.
          </p>
          {error.digest ? (
            <p style={{ fontSize: '0.75rem', color: '#8a857e', margin: '0 0 1.25rem' }}>
              Codice errore: {error.digest}
            </p>
          ) : null}
          {/* Link di next/link non è utilizzabile qui: questo confine sostituisce
              il documento e serve proprio un ricaricamento completo. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              background: '#0f5f60',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Torna alla panoramica
          </a>
        </main>
      </body>
    </html>
  )
}
