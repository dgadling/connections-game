// TDD test for issue #3 – member Discord fields remove extra @'s
// Run with: node --test src/member-discord-strings.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, 'App.jsx')

test('#3 member UI – no "Discord @username" strings', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // BANNED strings (the bug)
  const banned = [
    'Discord @username',
    '@jon_cst',
    'numeric snowflake',
  ]
  
  for (const s of banned) {
    assert.ok(!src.includes(s),
      `BUG REGRESSION #3: found banned string "${s}" in App.jsx – ` +
      `member Discord fields must NOT use @ prefix or "snowflake" terminology`)
  }
})

test('#3 member UI – correct placeholder text present', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // REQUIRED strings (the fix)
  assert.ok(src.includes('Discord username (e.g. anondotj2)'),
    'Member add form must show "Discord username (e.g. anondotj2)" placeholder')
  
  assert.ok(src.includes('numeric User ID'),
    'Member help text must say "numeric User ID", NOT "numeric snowflake"')
  
  // Edit form placeholder
  assert.ok(/placeholder="Discord username"/.test(src),
    'Member edit form must have placeholder="Discord username" (no @)')
})

test('#3 member UI – alert messages cleaned', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // Alert messages should say "Discord username is required", NOT "Discord @username is required"
  assert.ok(!src.includes('Discord @username is required'),
    'Alert messages must NOT say "Discord @username is required"')
  
  // The fixed version should exist
  assert.ok(src.includes('Discord username is required'),
    'Alert messages must say "Discord username is required"')
})

test('#3 member UI – all Discord ID input fields use correct placeholder', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // Find all placeholder="Discord ... occurrences in MembersTab area
  const memberTabIdx = src.indexOf('function MembersTab')
  assert.ok(memberTabIdx > 0, 'MembersTab function exists')
  
  const memberTabSrc = src.slice(memberTabIdx, memberTabIdx + 5000)
  
  // No @ in any Discord placeholder within MembersTab
  const discordPlaceholders = [...memberTabSrc.matchAll(/placeholder="([^"]*Discord[^"]*)"/g)]
  
  for (const m of discordPlaceholders) {
    const placeholder = m[1]
    assert.ok(!placeholder.includes('@username'),
      `MembersTab placeholder must NOT contain "@username": found "${placeholder}"`)
    assert.ok(!placeholder.includes('@jon'),
      `MembersTab placeholder must NOT contain old example "@jon_cst": found "${placeholder}"`)
    // It's OK if placeholder says "Discord username" or "Discord ID"
    assert.ok(/Discord (username|ID)/.test(placeholder),
      `Discord placeholder should mention username or ID clearly: found "${placeholder}"`)
  }
  
  assert.ok(discordPlaceholders.length >= 2,
    `Expected at least 2 Discord input placeholders in MembersTab (add + edit), found ${discordPlaceholders.length}`)
})

test('#3 regression – full codebase scan for banned Discord terminology', async () => {
  // Scan entire frontend/src for banned strings
  const srcDir = __dirname
  const files = await fs.readdir(srcDir)
  const jsFiles = files.filter(f => 
    (f.endsWith('.jsx') || f.endsWith('.js')) &&
    !f.endsWith('.test.js')  // skip test files – they contain banned strings in assertions
  )
  
  const bannedPatterns = [
    { pattern: /Discord @username/g, desc: 'Discord @username (should be "Discord username")' },
    { pattern: /Discord @.*jon_cst/g, desc: '@jon_cst in Discord UI text (should be anondotj2)' },
    { pattern: /numeric snowflake/g, desc: 'numeric snowflake (should be "numeric User ID")' },
  ]
  
  const violations = []
  for (const file of jsFiles) {
    const content = await fs.readFile(path.join(srcDir, file), 'utf8')
    for (const { pattern, desc } of bannedPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        violations.push(`${file}: "${desc}" found ${matches.length} time(s)`)
      }
    }
  }
  
  assert.equal(violations.length, 0,
    `Issue #3 regression – banned Discord terminology found:\n  - ` + violations.join('\n  - '))
})

test('#3 – backend accepts both Discord usernames and numeric IDs', async () => {
  // Verify backend doesn't enforce @ prefix (it shouldn't – usernames are stored as-is)
  // Check that GameMember.discord_id is just String, no format validation in model
  const modelsPath = path.join(__dirname, '../../backend/app/models.py')
  try {
    const modelsSrc = await fs.readFile(modelsPath, 'utf8')
    // Find GameMember / GameMember table definition
    // discord_id should be a plain String column, no CheckConstraint for @ prefix
    assert.ok(/discord_id.*String/.test(modelsSrc),
      'GameMember.discord_id should be String type')
    // Make sure there's NO validation requiring @ prefix
    assert.ok(!/@.*discord_id/.test(modelsSrc.toLowerCase()),
      'models.py must NOT enforce @ prefix on discord_id')
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Skip if backend not available in test env
      return
    }
    throw e
  }
})
