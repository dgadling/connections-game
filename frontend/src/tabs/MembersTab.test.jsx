import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembersTab } from './MembersTab.jsx'

// mock react-hot-toast (api.js imports toastErr which uses toast.error)
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('MembersTab – Discord UI strings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockMembers(members = []) {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/games/') && url.includes('/members')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(members),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  }

  it('renders Discord username placeholder and help text, no banned strings', async () => {
    mockMembers([])
    const { container } = render(<MembersTab gameId="test-game" archived={false} />)

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    // Required placeholder (issue #17 – discord_id is optional)
    expect(screen.getByPlaceholderText('Discord username (optional)')).toBeInTheDocument()

    // Help text
    expect(screen.getByText(/Used for @mentions in Copy-to-Discord/)).toBeInTheDocument()

    // Banned strings must NOT appear in DOM
    const text = container.textContent || ''
    const banned = [
      'Discord @username',
      '@jon_cst',
      'numeric snowflake',
      'Discord @username is required',
      'Discord username is required',
    ]
    for (const s of banned) {
      expect(text.includes(s), `banned string "${s}" found in rendered output`).toBe(false)
    }
  })

  it('edit form shows Discord username (optional) placeholder, no banned strings', async () => {
    const user = userEvent.setup()
    mockMembers([{ id: 1, name: 'Alice', discord_id: 'alice123', deleted_at: null }])

    const { container } = render(<MembersTab gameId="test-game" archived={false} />)

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

    // open edit form
    await user.click(screen.getByRole('button', { name: /edit/i }))

    // edit form should have the same placeholder
    const placeholders = screen.getAllByPlaceholderText('Discord username (optional)')
    expect(placeholders.length).toBeGreaterThanOrEqual(1)

    // banned strings still absent
    const text = container.textContent || ''
    expect(text.includes('Discord @username')).toBe(false)
    expect(text.includes('@jon_cst')).toBe(false)
    expect(text.includes('numeric snowflake')).toBe(false)
  })

  it('add form input accepts both usernames and numeric IDs (smoke)', async () => {
    mockMembers([])
    render(<MembersTab gameId="test-game" archived={false} />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    const input = screen.getByPlaceholderText('Discord username (optional)')
    expect(input).toBeInTheDocument()
    // Input is plain text – no format enforcement in the UI (backend accepts both)
    expect(input.getAttribute('type')).toBeFalsy() // defaults to text
  })
})
