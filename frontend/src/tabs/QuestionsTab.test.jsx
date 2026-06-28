import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionsTab } from './QuestionsTab.jsx'
import toast from 'react-hot-toast'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const mockQuestions = [
  { id: 1, text: 'What scares you?', tag: 'vulnerable', tag_auto: true, edit_count: 0 },
  { id: 2, text: 'Best memory?', tag: 'warm', tag_auto: false, edit_count: 1 },
]

describe('QuestionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn((url) => {
      if (url.includes('/questions?status=upcoming')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockQuestions),
        })
      }
      if (url.includes('/questions?status=used')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  it('loads and displays questions', async () => {
    render(<QuestionsTab gameId="test-game" archived={false} />)
    
    await waitFor(() => {
      expect(screen.getByText('What scares you?')).toBeInTheDocument()
    })
    expect(screen.getByText('Best memory?')).toBeInTheDocument()
  })

  it('shows empty state when no questions', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve([]),
    }))
    
    render(<QuestionsTab gameId="test-game" archived={false} />)
    
    await waitFor(() => {
      expect(screen.getByText(/no upcoming questions yet/i)).toBeInTheDocument()
    })
  })

  it('can add a new question', async () => {
    const user = userEvent.setup()
    let addCalled = false
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/questions') && opts?.method === 'POST') {
        addCalled = true
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ id: 99, text: 'New Q' }),
        })
      }
      if (url.includes('/questions?status=upcoming')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(addCalled ? [...mockQuestions, { id: 99, text: 'New Q', tag: 'warm', tag_auto: true, edit_count: 0 }] : mockQuestions),
        })
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve([]),
      })
    })
    
    render(<QuestionsTab gameId="test-game" archived={false} />)
    
    await waitFor(() => expect(screen.getByText('What scares you?')).toBeInTheDocument())
    
    const input = screen.getByPlaceholderText('Add a question…')
    await user.type(input, 'New question?')
    
    const addButton = screen.getByRole('button', { name: /^add$/i })
    await user.click(addButton)
    
    await waitFor(() => {
      expect(addCalled).toBe(true)
    })
    expect(toast.success).toHaveBeenCalledWith('Question added')
  })

  it('switches status tabs and loads questions', async () => {
    const user = userEvent.setup()
    let statusRequested = 'upcoming'
    global.fetch = vi.fn((url) => {
      const match = url.match(/status=(\w+)/)
      if (match) statusRequested = match[1]
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(statusRequested === 'upcoming' ? mockQuestions : []),
      })
    })
    
    render(<QuestionsTab gameId="test-game" archived={false} />)
    
    await waitFor(() => expect(screen.getByText('What scares you?')).toBeInTheDocument())
    
    await user.click(screen.getByText('used'))
    
    await waitFor(() => {
      expect(statusRequested).toBe('used')
    })
  })

  it('hides add UI when archived', async () => {
    render(<QuestionsTab gameId="test-game" archived={true} />)
    
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })
    
    expect(screen.queryByPlaceholderText('Add a question…')).not.toBeInTheDocument()
  })

  it('can edit a question', async () => {
    const user = userEvent.setup()
    let patchCalled = false
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'PATCH' && url.includes('/questions/1')) {
        patchCalled = true
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
        })
      }
      if (url.includes('/questions?status=')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockQuestions),
        })
      }
      return Promise.reject(new Error(`Unexpected: ${url}`))
    })
    
    render(<QuestionsTab gameId="test-game" archived={false} />)
    
    await waitFor(() => expect(screen.getByText('What scares you?')).toBeInTheDocument())
    
    await user.click(screen.getAllByTitle('Edit')[0])
    
    const editInput = screen.getByPlaceholderText('Edit question…')
    await user.clear(editInput)
    await user.type(editInput, 'Edited?')
    
    await user.click(screen.getByRole('button', { name: /save/i }))
    
    await waitFor(() => {
      expect(patchCalled).toBe(true)
    })
    expect(toast.success).toHaveBeenCalledWith('Saved')
  })
})
