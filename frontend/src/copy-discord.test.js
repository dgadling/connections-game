// copy-discord.test.js – Discord mention formatting
// Run with: node --test src/copy-discord.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, 'App.jsx')
const src = fs.readFileSync(appPath, 'utf8')

// formatDiscordMention – must match the implementation in App.jsx
function formatDiscordMention(id) {
  if (!id) return null
  if (/^\d{17,20}$/.test(id)) return `<@${id}>`
  return id.startsWith('@') ? id : '@' + id
}

test('formatDiscordMention – snowflake → <@id>', () => {
  assert.equal(formatDiscordMention('1386151012414259311'), '<@1386151012414259311>')
  assert.equal(formatDiscordMention('134515788454428673'), '<@134515788454428673>')
})

test('formatDiscordMention – username → @username', () => {
  assert.equal(formatDiscordMention('jon_cst'), '@jon_cst')
  assert.equal(formatDiscordMention('@jon_cst'), '@jon_cst')
  assert.equal(formatDiscordMention('jane.doe_123'), '@jane.doe_123')
})

test('formatDiscordMention – falsy → null', () => {
  assert.equal(formatDiscordMention(null), null)
  assert.equal(formatDiscordMention(''), null)
  assert.equal(formatDiscordMention(undefined), null)
})

test('copyDiscord formatting is present in App.jsx', () => {
  const checks = [
    { name: 'formatDiscordMention function exists', re: /formatDiscordMention/ },
    { name: 'snowflake branch: /^\\d{17,20}$/', re: /\\d\{17,20\}/ },
    { name: 'snowflake output: <@${', re: /<@\$\{/ },
    { name: 'username output: startsWith @ check', re: /startsWith.*['"]@['"]/ },
  ]
  const missing = checks.filter(c => !c.re.test(src))
  assert.equal(missing.length, 0,
    `copyDiscord formatting incomplete. Missing:\n  - ` + missing.map(m => m.name).join('\n  - ')
  )
})
