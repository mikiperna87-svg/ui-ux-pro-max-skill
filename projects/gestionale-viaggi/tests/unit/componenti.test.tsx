// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/domain/status-badge'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/money'

describe('Button', () => {
  it('rende il testo e reagisce al clic', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Salva</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('non reagisce quando è disabilitato', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Salva
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Field', () => {
  it('collega etichetta, suggerimento ed errore al campo', () => {
    render(
      <Field label="Destinazione" hint="Città o area geografica" error="Campo obbligatorio" required>
        {(props) => <Input {...props} name="destination" />}
      </Field>,
    )

    const input = screen.getByLabelText(/Destinazione/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // Con un errore presente il suggerimento lascia il posto al messaggio
    expect(screen.getByRole('alert')).toHaveTextContent('Campo obbligatorio')
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('mostra il suggerimento quando non ci sono errori', () => {
    render(
      <Field label="Destinazione" hint="Città o area geografica">
        {(props) => <Input {...props} name="destination" />}
      </Field>,
    )
    expect(screen.getByText('Città o area geografica')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Badge di stato', () => {
  it('accompagna sempre il colore con il testo', () => {
    render(
      <>
        <BookingStatusBadge status="confermata" />
        <PaymentStateBadge state="in_ritardo" />
      </>,
    )
    expect(screen.getByText('Confermata')).toBeInTheDocument()
    expect(screen.getByText('In ritardo')).toBeInTheDocument()
  })
})

describe('KpiCard', () => {
  it('mostra etichetta, valore e contesto', () => {
    render(<KpiCard label="Venduto" value={formatEuro(1_234_56)} hint="12 pratiche" />)
    expect(screen.getByText('Venduto')).toBeInTheDocument()
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument()
    expect(screen.getByText('12 pratiche')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('spiega che cosa manca e che cosa fare', () => {
    render(
      <EmptyState
        title="Nessuna pratica"
        description="Crea la prima pratica per vedere qui l’elenco."
        action={<Button>Nuova pratica</Button>}
      />,
    )
    expect(screen.getByText('Nessuna pratica')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuova pratica' })).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('richiede di digitare il riferimento prima di confermare', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        trigger={
          <button type="button" data-testid="apri">
            Annulla pratica
          </button>
        }
        title="Annullare la pratica?"
        description="L’operazione non si può annullare."
        confirmLabel="Annulla la pratica"
        requireTyping="2026/0042"
        onConfirm={onConfirm}
      />,
    )

    await userEvent.click(screen.getByTestId('apri'))
    const confirm = screen.getByRole('button', { name: 'Annulla la pratica' })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox'), '2026/0042')
    expect(confirm).toBeEnabled()

    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
