// Theme switching infrastructure
// Per-user theme preference, persisted via PATCH /auth/me

import { api } from './api.js'
import toast from 'react-hot-toast'

export const ALLOWED_THEMES = ['default', 'tavern', 'discord', 'tarot', 'campfire', 'brutalist']
export const DEFAULT_THEME = 'default'

/**
 * Apply a theme by setting data-theme attribute on <html>
 * CSS in index.css uses [data-theme="xxx"] selectors
 */
export function applyTheme(theme) {
  const t = ALLOWED_THEMES.includes(theme) ? theme : DEFAULT_THEME
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t)
  }
  return t
}

/**
 * Get the currently applied theme from <html data-theme>
 */
export function getCurrentTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME
}

/**
 * Switch theme with optimistic UI + server persistence
 * 
 * 1. Optimistically apply theme immediately
 * 2. PATCH /auth/me to persist
 * 3. On error: revert to previous theme + show toast
 * 
 * @param {string} newTheme - theme slug to switch to
 * @returns {Promise<{ok: boolean, theme: string}>}
 */
export async function switchTheme(newTheme) {
  const prevTheme = getCurrentTheme()
  
  // Validate client-side (API also validates)
  if (!ALLOWED_THEMES.includes(newTheme)) {
    toast.error(`Invalid theme: ${newTheme}`)
    return { ok: false, theme: prevTheme }
  }

  // Optimistic apply
  applyTheme(newTheme)

  try {
    await api('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    })
    return { ok: true, theme: newTheme }
  } catch (e) {
    // Revert on error
    applyTheme(prevTheme)
    const msg = e?.message || 'Failed to save theme preference'
    toast.error(msg)
    return { ok: false, theme: prevTheme }
  }
}
