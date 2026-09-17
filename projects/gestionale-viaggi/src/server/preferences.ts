import 'server-only'

import { cookies } from 'next/headers'
import { SIDEBAR_COOKIE, THEME_COOKIE, type ThemePreference } from '@/lib/preferences'

/**
 * Lettura delle preferenze di interfaccia dal cookie della richiesta.
 * La scrittura avviene nel browser (vedi @/lib/preferences): qui si legge
 * soltanto, per rendere la pagina già nel tema giusto.
 */
export async function readTheme(): Promise<ThemePreference> {
  const store = await cookies()
  const value = store.get(THEME_COOKIE)?.value
  return value === 'light' || value === 'dark' ? value : 'system'
}

export async function readSidebarCollapsed(): Promise<boolean> {
  const store = await cookies()
  return store.get(SIDEBAR_COOKIE)?.value === 'compressa'
}
