/**
 * Stato condiviso dei form gestiti da Server Action.
 *
 * Vive fuori dai file marcati 'use server' perché quei moduli possono esportare
 * soltanto funzioni asincrone: una costante o un tipo esportato da lì farebbe
 * fallire la richiesta a runtime.
 */
export interface ActionState {
  readonly status: 'idle' | 'error' | 'success'
  readonly message?: string
  readonly fieldErrors?: Readonly<Record<string, string>>
  /**
   * Valori inviati, restituiti quando la validazione fallisce.
   *
   * I campi di un form sono non controllati e dopo una Server Action l'albero
   * viene ricostruito: senza questi valori l'utente si ritroverebbe il modulo
   * vuoto e dovrebbe ridigitare tutto per correggere un carattere.
   */
  readonly values?: Readonly<Record<string, string>>
}

export const IDLE: ActionState = { status: 'idle' }

/** Estrae dal form i soli valori testuali, da restituire in caso di errore. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value
  }
  return values
}

/** Riduce gli errori di Zod a una mappa campo -> primo messaggio. */
export function fieldErrorsFrom(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !result[key]) result[key] = issue.message
  }
  return result
}

/** Esito di un'importazione da file, con l'elenco delle righe scartate. */
export interface ImportReport {
  readonly status: 'idle' | 'error' | 'success'
  readonly message?: string
  readonly imported: number
  /** Righe rifiutate dalla validazione. */
  readonly failed: readonly { readonly line: number; readonly reason: string }[]
  /**
   * Righe valide ma non inserite perché già presenti in anagrafica.
   * Non sono errori: sono il caso normale di chi reimporta lo stesso file.
   */
  readonly skipped: readonly { readonly line: number; readonly reason: string }[]
}

export const EMPTY_IMPORT_REPORT: ImportReport = {
  status: 'idle',
  imported: 0,
  failed: [],
  skipped: [],
}
