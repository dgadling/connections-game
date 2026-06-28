import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const REQUIRED_VARS = new Set([
  // Backgrounds
  '--color-bg',
  '--color-surface',
  '--color-surface-hover',
  '--color-surface-muted',
  // Borders
  '--color-border',
  '--color-border-strong',
  '--color-border-faint',
  // Text
  '--color-text',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-text-subtle',
  '--color-text-faint',
  // Primary
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-text',
  '--color-primary-bg-subtle',
  '--color-primary-border',
  '--color-primary-ring',
  // Accent
  '--color-accent-bg-subtle',
  // Success
  '--color-success',
  '--color-success-hover',
  // Danger
  '--color-danger',
  '--color-danger-hover',
  '--color-danger-bg',
  '--color-danger-border',
  '--color-danger-border-strong',
  '--color-danger-text',
  '--color-danger-text-strong',
  '--color-danger-text-emphasis',
  // Warning
  '--color-warning-bg',
  '--color-warning-bg-hover',
  '--color-warning-border',
  '--color-warning-text',
  // Tags
  '--tag-warm-bg',
  '--tag-warm-text',
  '--tag-warm-ring',
  '--tag-secretive-bg',
  '--tag-secretive-text',
  '--tag-secretive-ring',
  '--tag-reflective-bg',
  '--tag-reflective-text',
  '--tag-reflective-ring',
  '--tag-tension-bg',
  '--tag-tension-text',
  '--tag-tension-ring',
  '--tag-vulnerable-bg',
  '--tag-vulnerable-text',
  '--tag-vulnerable-ring',
  '--tag-loyal-bg',
  '--tag-loyal-text',
  '--tag-loyal-ring',
  // Tag default
  '--tag-default-bg',
  '--tag-default-text',
])

function extractThemeVars(css) {
  // Theme CSS files contain only custom property definitions for --color-* and --tag-*.
  // Scan the whole file; this is robust against nested rules (e.g. brutalist).
  const vars = new Set()
  const re = /(--[a-z0-9-]+)\s*:/gi
  let m
  while ((m = re.exec(css))) {
    const name = m[1]
    if (name.startsWith('--color-') || name.startsWith('--tag-')) {
      vars.add(name)
    }
  }
  return vars
}

describe('theme completeness', () => {
  const themesDir = path.resolve(__dirname, 'themes')
  const themes = [
    { name: 'default', file: path.resolve(__dirname, 'index.css') },
    { name: 'tavern', file: path.join(themesDir, 'tavern.css') },
    { name: 'discord', file: path.join(themesDir, 'discord.css') },
    { name: 'tarot', file: path.join(themesDir, 'tarot.css') },
    { name: 'campfire', file: path.join(themesDir, 'campfire.css') },
    { name: 'brutalist', file: path.join(themesDir, 'brutalist.css') },
  ]

  for (const theme of themes) {
    it(`${theme.name} defines all required CSS custom properties and nothing extra`, () => {
      const css = fs.readFileSync(theme.file, 'utf8')
      const vars = extractThemeVars(css)
      const missing = [...REQUIRED_VARS].filter(v => !vars.has(v))
      const extra = [...vars].filter(v => !REQUIRED_VARS.has(v))
      expect(missing, `Missing vars in ${theme.name}: ${missing.join(', ')}`).toEqual([])
      expect(extra, `Extra/unknown vars in ${theme.name}: ${extra.join(', ')}`).toEqual([])
      expect(vars.size).toBe(REQUIRED_VARS.size)
    })
  }
})
