import { test, expect } from 'vitest'
import { formatDiscordMention } from './discord.js'

test('formatDiscordMention – snowflake → <@id>', () => {
  expect(formatDiscordMention('1386151012414259311')).toBe('<@1386151012414259311>')
  expect(formatDiscordMention('134515788454428673')).toBe('<@134515788454428673>')
})

test('formatDiscordMention – username → @username', () => {
  expect(formatDiscordMention('jon_cst')).toBe('@jon_cst')
  expect(formatDiscordMention('@jon_cst')).toBe('@jon_cst')
  expect(formatDiscordMention('jane.doe_123')).toBe('@jane.doe_123')
})

test('formatDiscordMention – falsy → null', () => {
  expect(formatDiscordMention(null)).toBe(null)
  expect(formatDiscordMention('')).toBe(null)
  expect(formatDiscordMention(undefined)).toBe(null)
})

test('formatDiscordMention – name fallback when id missing', () => {
  expect(formatDiscordMention(null, 'Jon')).toBe('Jon')
  expect(formatDiscordMention('', 'Jane')).toBe('Jane')
})

test('formatDiscordMention – role mode suppresses mentions', () => {
  // When roleId is set, return plain name, no @mention
  expect(formatDiscordMention('1386151012414259311', 'Jon', '999')).toBe('Jon')
  expect(formatDiscordMention('jon_cst', 'Jon', '999')).toBe('Jon')
  expect(formatDiscordMention(null, 'Jon', '999')).toBe('Jon')
})
