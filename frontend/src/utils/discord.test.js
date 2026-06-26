// utils/discord.test.js – Discord mention formatting
// Run with: node --test src/utils/discord.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDiscordMention } from './discord.js'

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

test('formatDiscordMention – name fallback when id missing', () => {
  assert.equal(formatDiscordMention(null, 'Jon'), 'Jon')
  assert.equal(formatDiscordMention('', 'Jane'), 'Jane')
})

test('formatDiscordMention – role mode suppresses mentions', () => {
  // When roleId is set, return plain name, no @mention
  assert.equal(formatDiscordMention('1386151012414259311', 'Jon', '999'), 'Jon')
  assert.equal(formatDiscordMention('jon_cst', 'Jon', '999'), 'Jon')
  assert.equal(formatDiscordMention(null, 'Jon', '999'), 'Jon')
})
