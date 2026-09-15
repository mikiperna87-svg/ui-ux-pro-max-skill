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
}

export const IDLE: ActionState = { status: 'idle' }

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
