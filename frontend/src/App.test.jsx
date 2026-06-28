import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

// Mock all tab components to simplify testing
vi.mock('./tabs/RoundTab.jsx', () => ({
  RoundTab: () => <div>RoundTab content</div>,
}))
vi.mock('./tabs/QuestionsTab.jsx', () => ({
  QuestionsTab: () => <div>QuestionsTab content</div>,
}))
vi.mock('./tabs/MembersTab.jsx', () => ({
  MembersTab: () => <div>MembersTab content</div>,
}))
vi.mock('./tabs/HistoryTab.jsx', () => ({
  HistoryTab: () => <div>HistoryTab content</div>,
}))
vi.mock('./tabs/AdminTab.jsx', () => ({
  AdminTab: () => <div>AdminTab content</div>,
}))
vi.mock('./components/GameList.jsx', () => ({
  GameList: ({ games }) => <div>GameList – {games?.length || 0} games</div>,
}))
vi.mock('./components/UserMenu.jsx', () => ({
  UserMenu: () => <div data-testid="user-menu">UserMenu</div>,
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear cookies
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
    })
  })

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) // never resolves
    render(<App />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows login screen when user is not authenticated', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/auth/me') {
        return Promise.reject(new Error('Not authenticated'))
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Connections')).toBeInTheDocument()
      expect(screen.getByText(/sign in with discord/i)).toBeInTheDocument()
    })
  })

  it('shows GameList when user is authenticated but no game selected', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ discord_id: '123', username: 'testuser', theme: 'default' }),
        })
      }
      if (url === '/api/games') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([{ id: 'game1', name: 'Test Game' }]),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText(/gamelist/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/1 games/)).toBeInTheDocument()
  })

  it('applies theme from user profile', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ discord_id: '123', username: 'testuser', theme: 'tavern' }),
        })
      }
      if (url === '/api/games') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<App />)
    
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('tavern')
    })
  })

  it('defaults to default theme when user has no theme', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ discord_id: '123', username: 'testuser', theme: null }),
        })
      }
      if (url === '/api/games') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<App />)
    
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('default')
    })
  })
})
