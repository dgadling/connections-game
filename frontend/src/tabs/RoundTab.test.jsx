import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundTab } from './RoundTab.jsx'
import toast from 'react-hot-toast'

// react-hot-toast mock
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

// clipboard mock – jsdom's navigator.clipboard is read-only / non-configurable
const writeClipboardMock = vi.fn((text) => Promise.resolve(text))
vi.mock('../utils/clipboard.js', () => ({
  writeClipboard: (...args) => writeClipboardMock(...args),
}))

const mockRoundData = {
  question: { text: 'What scares you?', tag: 'vulnerable' },
  pairings: [
    { asker_id: 1, target_id: 2, asker_name: 'Alice', target_name: 'Bob', asker_discord_id: '123456789012345678', target_discord_id: '987654321098765432' },
  ],
}

describe('RoundTab – copyDiscord', () => {
  beforeEach(() => {
    writeClipboardMock.mockClear()
    toast.success.mockClear()
    toast.error.mockClear()
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/games/') && url.includes('/round')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockRoundData),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  it('role ping mode: suppresses individual mentions, includes role ping', async () => {
    const user = userEvent.setup()
    render(<RoundTab gameId="test-game" game={{ discord_role_id: '999888777666555444' }} archived={false} />)

    await waitFor(() => expect(screen.getByText('What scares you?')).toBeInTheDocument())

    const copyButton = screen.getByRole('button', { name: /copy/i })
    await user.click(copyButton)

    await waitFor(() => expect(writeClipboardMock).toHaveBeenCalled())
    const clipboardText = writeClipboardMock.mock.calls[0][0]

    expect(clipboardText).toContain('<@&999888777666555444>')
    expect(clipboardText).toContain('Alice answers about Bob')
    expect(clipboardText).not.toContain('<@123456789012345678>')
  })

  it('no role ping: includes individual Discord mentions', async () => {
    const user = userEvent.setup()
    render(<RoundTab gameId="test-game" game={{ discord_role_id: null }} archived={false} />)

    await waitFor(() => expect(screen.getByText('What scares you?')).toBeInTheDocument())

    const copyButton = screen.getByRole('button', { name: /copy/i })
    await user.click(copyButton)

    await waitFor(() => expect(writeClipboardMock).toHaveBeenCalled())
    const clipboardText = writeClipboardMock.mock.calls[0][0]

    expect(clipboardText).toContain('<@123456789012345678>')
    expect(clipboardText).toContain('<@987654321098765432>')
    expect(clipboardText).not.toContain('<@&')
  })
})
