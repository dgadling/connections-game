import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminTab } from './AdminTab.jsx'
import toast from 'react-hot-toast'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const mockGame = {
  id: 'test-game',
  name: 'Test Game',
  archived_at: null,
  discord_role_id: null,
}

describe('AdminTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn((url) => {
      if (url.includes('/invites')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      if (url.includes('/admins')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([{ discord_id: '123', username: 'admin1', global_name: 'Admin One' }]),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  it('loads and displays admins', async () => {
    render(<AdminTab gameId="test-game" game={mockGame} onGameUpdate={vi.fn()} />)
    
    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument()
    })
  })

  it('can rename game', async () => {
    const user = userEvent.setup()
    const onGameUpdate = vi.fn()
    let patchCalled = false
    
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/invites') || url.includes('/admins')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      if (opts?.method === 'PATCH' && url.includes('/api/games/test-game')) {
        patchCalled = true
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<AdminTab gameId="test-game" game={mockGame} onGameUpdate={onGameUpdate} />)
    
    await waitFor(() => expect(screen.getByText(/game settings/i)).toBeInTheDocument())
    
    const renameInput = screen.getByDisplayValue('Test Game')
    await user.clear(renameInput)
    await user.type(renameInput, 'Renamed Game')
    
    await user.click(screen.getByRole('button', { name: /rename/i }))
    
    await waitFor(() => {
      expect(patchCalled).toBe(true)
    })
    expect(onGameUpdate).toHaveBeenCalledWith({ name: 'Renamed Game' })
    expect(toast.success).toHaveBeenCalledWith('Renamed')
  })

  it('can generate invite link', async () => {
    const user = userEvent.setup()
    
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST' && url.includes('/invites')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ invite_token: 'abc123xyz' }),
        })
      }
      if (url.includes('/invites') || url.includes('/admins')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<AdminTab gameId="test-game" game={mockGame} onGameUpdate={vi.fn()} />)
    
    await waitFor(() => expect(screen.getByText(/invite links/i)).toBeInTheDocument())
    
    await user.click(screen.getByRole('button', { name: /generate invite/i }))
    
    await waitFor(() => {
      expect(screen.getByText(/abc123xyz/)).toBeInTheDocument()
    })
    expect(toast.success).toHaveBeenCalledWith('Invite created')
  })

  it('shows archive button for active game', async () => {
    render(<AdminTab gameId="test-game" game={mockGame} onGameUpdate={vi.fn()} />)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /archive game/i })).toBeInTheDocument()
    })
  })

  it('shows unarchive/delete buttons for archived game', async () => {
    const archivedGame = { ...mockGame, archived_at: '2024-01-01T00:00:00Z' }
    render(<AdminTab gameId="test-game" game={archivedGame} onGameUpdate={vi.fn()} />)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unarchive game/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /delete game permanently/i })).toBeInTheDocument()
    })
  })

  it('can save Discord role ID', async () => {
    const user = userEvent.setup()
    const onGameUpdate = vi.fn()
    let patchCalled = false
    
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/invites') || url.includes('/admins')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      if (opts?.method === 'PATCH') {
        patchCalled = true
        const body = JSON.parse(opts.body)
        expect(body.discord_role_id).toBe('987654321')
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<AdminTab gameId="test-game" game={mockGame} onGameUpdate={onGameUpdate} />)
    
    await waitFor(() => expect(screen.getByPlaceholderText(/discord role id/i)).toBeInTheDocument())
    
    const roleInput = screen.getByPlaceholderText(/discord role id/i)
    await user.type(roleInput, '987654321')
    
    await user.click(screen.getByRole('button', { name: /save role/i }))
    
    await waitFor(() => {
      expect(patchCalled).toBe(true)
    })
    expect(toast.success).toHaveBeenCalledWith('Role saved')
  })
})
