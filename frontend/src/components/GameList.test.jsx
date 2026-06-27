import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameList } from './GameList.jsx'
import toast from 'react-hot-toast'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('GameList – join/open flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('openGame – sets game name from API response (prevents empty title bug #2)', async () => {
    const user = userEvent.setup()
    const setGame = vi.fn()
    const games = [{ id: 'g1', name: 'Test Campaign', archived_at: null, discord_role_id: null }]

    // Mock /api/games/g1 returning full game with name
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/games/g1')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({
            id: 'g1',
            name: 'Test Campaign',
            archived_at: null,
            discord_role_id: null,
          }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })

    render(
      <GameList
        user={{ username: 'tester' }}
        games={games}
        gamesLoading={false}
        setGame={setGame}
        onRefresh={vi.fn()}
        onLogout={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Test Campaign/ }))

    await waitFor(() => expect(setGame).toHaveBeenCalled())

    const calledWith = setGame.mock.calls[0][0]
    // Issue #2: invite join / game open must set game.name from API response,
    // not hardcoded empty string
    expect(calledWith.id).toBe('g1')
    expect(calledWith.name).toBe('Test Campaign')
    expect(calledWith.name).not.toBe('')
  })

  it('openGame – handles archived_at from response', async () => {
    const user = userEvent.setup()
    const setGame = vi.fn()
    const games = [{ id: 'g2', name: 'Archived Game', archived_at: '2024-01-01T00:00:00Z', discord_role_id: null }]

    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/games/g2')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({
            id: 'g2',
            name: 'Archived Game',
            archived_at: '2024-01-01T00:00:00Z',
            discord_role_id: null,
          }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })

    render(
      <GameList
        user={{ username: 'tester' }}
        games={games}
        gamesLoading={false}
        setGame={setGame}
        onRefresh={vi.fn()}
        onLogout={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Archived Game/ }))

    await waitFor(() => expect(setGame).toHaveBeenCalled())
    const calledWith = setGame.mock.calls[0][0]
    expect(calledWith.archived_at).toBe('2024-01-01T00:00:00Z')
  })
})
