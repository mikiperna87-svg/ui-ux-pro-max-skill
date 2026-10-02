/**
 * Preferenze di interfaccia (tema, barra laterale).
 *
 * Vivono in un cookie e non in localStorage: il server deve conoscerle al primo
 * render, altrimenti la pagina "lampeggia" passando da chiaro a scuro.
 *
 * La scrittura avviene qui, nel browser, e non tramite una Server Action:
 * la preferenza deve essere registrata nell'istante del clic, senza dipendere
 * dal completamento di una richiesta di rete.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_COOKIE = 'gv-tema'
export const SIDEBAR_COOKIE = 'gv-barra-laterale'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

function writeCookie(name: string, value: string | null): void {
  if (typeof document === 'undefined') return
  document.cookie =
    value === null
      ? `${name}=; Max-Age=0; Path=/; SameSite=Lax`
      : `${name}=${value}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`
}

/** Applica il tema al documento e lo registra per i caricamenti successivi. */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (theme === 'system') {
      delete root.dataset.theme
    } else {
      root.dataset.theme = theme
    }
  }
  writeCookie(THEME_COOKIE, theme === 'system' ? null : theme)
}

/** Registra lo stato della barra laterale (compressa o estesa). */
export function persistSidebarCollapsed(collapsed: boolean): void {
  writeCookie(SIDEBAR_COOKIE, collapsed ? 'compressa' : 'estesa')
}
