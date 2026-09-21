import { describe, expect, it } from 'vitest'
import { buttonVariants } from '@/components/ui/button'
import { cn, initials, required, slugify } from '@/lib/utils'

describe('unione delle classi', () => {
  it('non lascia che una dimensione di testo cancelli un colore di testo', () => {
    // Il difetto originale: tailwind-merge non conosce le nostre dimensioni e
    // trattava `text-caption` e `text-accent-fg` come due colori in conflitto.
    const classi = cn('text-accent-fg', 'text-caption')
    expect(classi).toContain('text-accent-fg')
    expect(classi).toContain('text-caption')
  })

  it('fa ancora vincere l’ultimo fra due colori, e fra due dimensioni', () => {
    expect(cn('text-text-muted', 'text-danger')).toBe('text-danger')
    expect(cn('text-body', 'text-small')).toBe('text-small')
    expect(cn('text-metric', 'text-metric-sm')).toBe('text-metric-sm')
  })

  it('conosce tutte le dimensioni della scala, non solo quelle originarie', () => {
    // Ogni misura aggiunta al design system va dichiarata anche qui: una
    // dimenticata torna a comportarsi da colore e cancella quello vero.
    for (const dimensione of ['hero', 'display', 'title', 'heading', 'body', 'small', 'caption', 'micro', 'metric', 'metric-sm']) {
      const classi = cn('text-accent-fg', `text-${dimensione}`)
      expect(classi, dimensione).toContain('text-accent-fg')
      expect(classi, dimensione).toContain(`text-${dimensione}`)
    }
  })

  it('risolve i conflitti veri di Tailwind', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('bg-accent', 'bg-danger')).toBe('bg-danger')
  })
})

describe('varianti del bottone', () => {
  // Il bottone è il punto in cui il difetto si vedeva: ogni variante deve
  // arrivare a schermo con il proprio colore, a qualunque dimensione.
  const varianti = [
    ['primary', 'text-accent-fg'],
    ['secondary', 'text-text'],
    ['ghost', 'text-text-muted'],
    ['subtle', 'text-accent-subtle-fg'],
    ['danger', 'text-danger-contrast'],
    ['link', 'text-accent'],
  ] as const

  for (const [variante, colore] of varianti) {
    for (const size of ['sm', 'md', 'lg'] as const) {
      it(`la variante ${variante} conserva ${colore} alla dimensione ${size}`, () => {
        expect(buttonVariants({ variant: variante, size })).toContain(colore)
      })
    }
  }
})

describe('utilità di testo', () => {
  it('riduce un nome alle iniziali', () => {
    expect(initials('Mario Rossi')).toBe('MR')
    expect(initials('Giulia')).toBe('GI')
    expect(initials('   ')).toBe('?')
    expect(initials('Anna Maria De Santis')).toBe('AS')
  })

  it('costruisce uno slug senza accenti né simboli', () => {
    expect(slugify('Preventivo Città di Sanremo')).toBe('preventivo-citta-di-sanremo')
    expect(slugify('  --Isole  Eolie!!  ')).toBe('isole-eolie')
  })

  it('required lancia su un valore assente e lo restituisce quando c’è', () => {
    expect(required('valore', 'assente')).toBe('valore')
    expect(() => required(null, 'manca il cliente')).toThrow('manca il cliente')
    expect(() => required(undefined, 'manca la pratica')).toThrow('manca la pratica')
  })
})
