// copy-discord.test.js – Discord mention formatting integration
// Run with: node --test src/copy-discord.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatDiscordMention } from './utils/discord.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('formatDiscordMention – snowflake → <@id>', () => {
  assert.equal(formatDiscordMention('1386151012414259311', null, null), '<@1386151012414259311>')
  assert.equal(formatDiscordMention('134515788454428673', null, null), '<@134515788454428673>')
})

test('formatDiscordMention – username → @username', () => {
  assert.equal(formatDiscordMention('jon_cst', null, null), '@jon_cst')
  assert.equal(formatDiscordMention('@jon_cst', null, null), '@jon_cst')
  assert.equal(formatDiscordMention('jane.doe_123', null, null), '@jane.doe_123')
})

test('formatDiscordMention – falsy → name fallback', () => {
  assert.equal(formatDiscordMention(null, null, null), null)
  assert.equal(formatDiscordMention('', 'Jon', null), 'Jon')
  assert.equal(formatDiscordMention(undefined, 'Jane', null), 'Jane')
})

test('copyDiscord integration – RoundTab and HistoryTab use utils/discord.js', () => {
  const roundTab = fs.readFileSync(path.join(__dirname, 'tabs/RoundTab.jsx'), 'utf8')
  const historyTab = fs.readFileSync(path.join(__dirname, 'tabs/HistoryTab.jsx'), 'utf8')

  // Both tabs must import formatDiscordMention from utils
  assert.match(roundTab, /import.*formatDiscordMention.*from.*utils\/discord\.js/, 'RoundTab must import formatDiscordMention from utils/discord.js')
  assert.match(historyTab, /import.*formatDiscordMention.*from.*utils\/discord\.js/, 'HistoryTab must import formatDiscordMention from utils/discord.js')

  // Calls must pass roleId (3rd arg) – prevents regression to old 2-arg version
  const callRe = /formatDiscordMention\s*\([^,]+,[^,]+,[^)]+\)/
  assert.match(roundTab, callRe, 'RoundTab must call formatDiscordMention with roleId (3 args)')
  assert.match(historyTab, callRe, 'HistoryTab must call formatDiscordMention with roleId (3 args)')
})

test('formatDiscordMention is defined ONLY in utils/discord.js', () => {
  const srcDir = __dirname
  const files = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) files.push(full)
    }
  }
  walk(srcDir)
  const defs = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    // look for function definition, not import/call
    if (/function\s+formatDiscordMention\s*\(/.test(src) || /export\s+function\s+formatDiscordMention/.test(src) || /const\s+formatDiscordMention\s*=\s*\(/.test(src)) {
      defs.push(path.relative(srcDir, f))
    }
  }
  assert.deepEqual(defs.sort(), ['utils/discord.js'], `formatDiscordMention must be defined ONLY in utils/discord.js, found in: ${defs.join(', ')}`)
})
