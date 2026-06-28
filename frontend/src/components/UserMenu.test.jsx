import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMenu } from './UserMenu.jsx'

// Mock theme.js
vi.mock('../theme.js', () => ({
  switchTheme: vi.fn(),
  ALLOWED_THEMES: ['default', 'tavern', 'discord', 'tarot', 'campfire', 'brutalist'],
}))

import { switchTheme } from '../theme.js'

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with Discord avatar when avatar_hash present', () => {
    const user = {
      discord_id: '123456789012345678',
      username: 'testuser',
      global_name: 'Test User',
      avatar_hash: 'abc123def456',
      theme: 'default',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />)

    const img = screen.getByAltText('Test User avatar')
    expect(img).toBeInTheDocument()
    expect(img.src).toBe('https://cdn.discordapp.com/avatars/123456789012345678/abc123def456.png?size=64')
  })

  it('falls back to initials when avatar_hash is null', () => {
    const user = {
      discord_id: '123456789012345678',
      username: 'testuser',
      global_name: 'Test User',
      avatar_hash: null,
      theme: 'default',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.queryByAltText(/avatar/)).not.toBeInTheDocument()
    expect(screen.getByText('TE')).toBeInTheDocument()
  })

  it('uses .gif extension for animated avatar (a_ prefix)', () => {
    const user = {
      discord_id: '123456789012345678',
      username: 'testuser',
      global_name: null,
      avatar_hash: 'a_abc123def456',
      theme: 'default',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />)

    const img = screen.getByAltText('testuser avatar')
    expect(img.src).toBe('https://cdn.discordapp.com/avatars/123456789012345678/a_abc123def456.gif?size=64')
  })

  it('clicking a theme calls switchTheme with correct value', async () => {
    const userEventSetup = userEvent.setup()
    const setUser = vi.fn()
    const user = {
      discord_id: '123',
      username: 'tester',
      global_name: null,
      avatar_hash: null,
      theme: 'default',
    }
    vi.mocked(switchTheme).mockResolvedValue({ ok: true, theme: 'discord' })

    render(<UserMenu user={user} setUser={setUser} onLogout={vi.fn()} />)

    // Open menu
    await userEventSetup.click(screen.getByLabelText('User menu'))

    // Click Discord theme
    await userEventSetup.click(screen.getByRole('menuitemradio', { name: /Discord/ }))

    await waitFor(() => {
      expect(switchTheme).toHaveBeenCalledWith('discord')
    })
    expect(setUser).toHaveBeenCalled()
  })

  it('menu closes on Esc', async () => {
    const userEventSetup = userEvent.setup()
    const user = {
      discord_id: '123',
      username: 'tester',
      global_name: null,
      avatar_hash: null,
      theme: 'default',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />)

    // Open menu
    await userEventSetup.click(screen.getByLabelText('User menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Press Esc
    await userEventSetup.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('menu closes on outside click', async () => {
    const userEventSetup = userEvent.setup()
    const user = {
      discord_id: '123',
      username: 'tester',
      global_name: null,
      avatar_hash: null,
      theme: 'default',
    }
    render(
      <div>
        <div data-testid="outside">outside</div>
        <UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />
      </div>
    )

    // Open menu
    await userEventSetup.click(screen.getByLabelText('User menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Click outside
    await userEventSetup.click(screen.getByTestId('outside'))

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('Log out calls onLogout', async () => {
    const userEventSetup = userEvent.setup()
    const onLogout = vi.fn()
    const user = {
      discord_id: '123',
      username: 'tester',
      global_name: null,
      avatar_hash: null,
      theme: 'default',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={onLogout} />)

    // Open menu
    await userEventSetup.click(screen.getByLabelText('User menu'))

    // Click Log out
    await userEventSetup.click(screen.getByRole('menuitem', { name: /Log out/ }))

    expect(onLogout).toHaveBeenCalled()
  })

  it('shows checkmark on active theme', async () => {
    const userEventSetup = userEvent.setup()
    const user = {
      discord_id: '123',
      username: 'tester',
      global_name: null,
      avatar_hash: null,
      theme: 'tavern',
    }
    render(<UserMenu user={user} setUser={vi.fn()} onLogout={vi.fn()} />)

    await userEventSetup.click(screen.getByLabelText('User menu'))

    const tavernOption = screen.getByRole('menuitemradio', { name: /Tavern/ })
    expect(tavernOption).toHaveAttribute('aria-checked', 'true')
  })
})
