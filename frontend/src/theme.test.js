import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyTheme, getCurrentTheme, switchTheme, ALLOWED_THEMES } from './theme.js'

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))
import toast from 'react-hot-toast'

describe('theme switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.removeAttribute('data-theme')
    global.fetch = vi.fn()
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('applyTheme – sets data-theme attribute on <html>', () => {
    applyTheme('default')
    expect(document.documentElement.getAttribute('data-theme')).toBe('default')
  })

  it('applyTheme – falls back to default for invalid theme', () => {
    applyTheme('not_a_real_theme')
    expect(document.documentElement.getAttribute('data-theme')).toBe('default')
  })

  it('getCurrentTheme – reads data-theme from <html>', () => {
    document.documentElement.setAttribute('data-theme', 'discord')
    expect(getCurrentTheme()).toBe('discord')
  })

  it('getCurrentTheme – falls back to default when no attribute', () => {
    document.documentElement.removeAttribute('data-theme')
    expect(getCurrentTheme()).toBe('default')
  })

  it('switchTheme – optimistically applies theme, PATCH succeeds', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ theme: 'tavern' }),
    })

    // Mock CSRF cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf_token=test123',
    })

    const result = await switchTheme('tavern')

    expect(document.documentElement.getAttribute('data-theme')).toBe('tavern')
    expect(result.ok).toBe(true)
    expect(result.theme).toBe('tavern')

    // Verify PATCH was called with correct body
    expect(global.fetch).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ theme: 'tavern' }),
        credentials: 'include',
      })
    )
  })

  it('switchTheme – failed PATCH reverts theme + shows toast', async () => {
    // Start with default theme
    applyTheme('default')
    expect(getCurrentTheme()).toBe('default')

    // Mock failed PATCH
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"detail":"invalid theme"}'),
      headers: { get: () => 'text/plain' },
    })

    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf_token=test123',
    })

    const result = await switchTheme('discord')

    // Should revert to previous theme
    expect(document.documentElement.getAttribute('data-theme')).toBe('default')
    expect(result.ok).toBe(false)
    expect(result.theme).toBe('default')

    // Toast error should be shown with message content
    expect(toast.error).toHaveBeenCalled()
    const toastMsg = vi.mocked(toast.error).mock.calls[0][0]
    expect(typeof toastMsg).toBe('string')
    expect(toastMsg.length).toBeGreaterThan(0)
    // Should mention failure – either generic "Failed to save" or the API error
    expect(toastMsg.toLowerCase()).toMatch(/fail|error|invalid|theme/)
  })

  it('switchTheme – rejects invalid theme client-side, no PATCH', async () => {
    applyTheme('default')

    const result = await switchTheme('not_a_theme')

    // Should NOT have called fetch
    expect(global.fetch).not.toHaveBeenCalled()
    // Theme should stay default
    expect(getCurrentTheme()).toBe('default')
    expect(result.ok).toBe(false)
    // Toast should mention invalid theme
    expect(toast.error).toHaveBeenCalled()
    const toastMsg = vi.mocked(toast.error).mock.calls[0][0]
    expect(toastMsg).toMatch(/Invalid theme/i)
  })

  it('ALLOWED_THEMES includes all 6 expected themes', () => {
    expect(ALLOWED_THEMES).toEqual(
      expect.arrayContaining(['default', 'tavern', 'discord', 'tarot', 'campfire', 'brutalist'])
    )
    expect(ALLOWED_THEMES.length).toBe(6)
  })
})
