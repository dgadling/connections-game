// Clipboard helper – wrapper around navigator.clipboard for testability
// jsdom's navigator.clipboard is read-only / non-configurable, can't be mocked directly
// Mocking this module in Vitest works reliably
export async function writeClipboard(text) {
  return navigator.clipboard.writeText(text)
}
