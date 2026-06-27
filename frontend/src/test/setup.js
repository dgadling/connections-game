import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Global clipboard mock for jsdom (clipboard API is not available in jsdom by default)
Object.defineProperty(global.navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
  },
  configurable: true,
})

// Also define on window.navigator if it exists and differs
if (typeof window !== 'undefined' && window.navigator !== global.navigator) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: global.navigator.clipboard,
    configurable: true,
  })
}
