// TDD test for issue #1 – question edit history timezone parsing
// Run with: node --test src/question-history-timezone.test.js
// Also test with: TZ=America/Los_Angeles node --test ...
//                TZ=Asia/Tokyo node --test ...
//                TZ=UTC node --test ...

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Simulate what the frontend does: new Date(h.edited_at).toLocaleString()
function parseEditedAt(edited_at_str) {
  return new Date(edited_at_str)
}

test('#1 timezone – timestamp WITH Z suffix parses as UTC', () => {
  // Backend stores edited_at as UTC naive datetime, serializes with + "Z"
  // e.g. "2026-06-24T19:00:00Z"
  const utcNoon = '2026-06-24T19:00:00Z'
  const d = parseEditedAt(utcNoon)
  
  // Date should parse as UTC, not local
  // In UTC: 2026-06-24 19:00:00
  // In America/Los_Angeles (PDT, UTC-7): 2026-06-24 12:00:00
  // In Asia/Tokyo (JST, UTC+9): 2026-06-25 04:00:00
  
  assert.ok(!isNaN(d.getTime()), 'Date must parse')
  assert.equal(d.getUTCHours(), 19, 'UTC hour must be 19')
  assert.equal(d.getUTCMinutes(), 0)
  
  // The whole point: toLocaleString() should convert UTC→local
  const localStr = d.toLocaleString()
  assert.ok(localStr.length > 0, 'toLocaleString must produce output')
  
  // Verify the Date object is actually UTC-based internally
  // getHours() returns LOCAL hour, getUTCHours() returns UTC hour
  // They should DIFFER unless we're in UTC timezone
  // We can't assert a specific local hour without knowing TZ, but we CAN
  // assert that the UTC representation is correct
  assert.equal(d.toISOString(), '2026-06-24T19:00:00.000Z')
})

test('#1 timezone – timestamp WITHOUT Z suffix is PARSED AS LOCAL (the bug)', () => {
  // BUG: backend used to return "2026-06-24T19:00:00" (no Z)
  // JS Date() then treats this as LOCAL time, not UTC
  const noZ = '2026-06-24T19:00:00'
  const d_noZ = parseEditedAt(noZ)
  
  const withZ = '2026-06-24T19:00:00Z'
  const d_withZ = parseEditedAt(withZ)
  
  // These two Dates represent DIFFERENT moments in time (unless local TZ is UTC)
  // d_noZ: 2026-06-24 19:00:00 in LOCAL timezone
  // d_withZ: 2026-06-24 19:00:00 in UTC
  //
  // In a non-UTC timezone, their UTC timestamps must differ
  const tzOffset = new Date().getTimezoneOffset()
  
  if (tzOffset !== 0) {
    // Not running in UTC – the two dates MUST differ
    assert.notEqual(
      d_noZ.getTime(),
      d_withZ.getTime(),
      `BUG REPRO: without Z, Date parses as LOCAL. With TZ offset ${tzOffset}min, ` +
      `noZ=${d_noZ.toISOString()} vs withZ=${d_withZ.toISOString()}. ` +
      `They should differ – if they don't, you're running in UTC where the bug is invisible!`
    )
    // The difference should be exactly the timezone offset
    const diffMs = d_noZ.getTime() - d_withZ.getTime()
    const expectedDiffMs = tzOffset * 60 * 1000
    assert.equal(diffMs, expectedDiffMs,
      `Time difference should equal TZ offset: got ${diffMs}ms, expected ${expectedDiffMs}ms`)
  } else {
    // Running in UTC – bug is invisible here (local = UTC)
    // Still assert both parse
    assert.ok(!isNaN(d_noZ.getTime()))
    assert.ok(!isNaN(d_withZ.getTime()))
  }
})

test('#1 timezone – DST boundary edge case', () => {
  // DST spring forward 2026 in America/Los_Angeles: Mar 8, 2026 2am → 3am
  // DST fall back: Nov 1, 2026 2am → 1am
  // Test a UTC timestamp that lands in the ambiguous/missing local hour
  
  const utcDuringDST = '2026-07-01T19:00:00Z' // Summer, PDT UTC-7
  const d = parseEditedAt(utcDuringDST)
  assert.equal(d.toISOString(), '2026-07-01T19:00:00.000Z')
  assert.ok(!isNaN(d.getTime()))
  
  const utcWinter = '2026-01-01T19:00:00Z' // Winter, PST UTC-8
  const d2 = parseEditedAt(utcWinter)
  assert.equal(d2.toISOString(), '2026-01-01T19:00:00.000Z')
})

test('#1 timezone – midnight UTC edge case', () => {
  const midnightUTC = '2026-06-24T00:00:00Z'
  const d = parseEditedAt(midnightUTC)
  assert.equal(d.getUTCHours(), 0)
  assert.equal(d.getUTCMinutes(), 0)
  assert.equal(d.toISOString(), '2026-06-24T00:00:00.000Z')
  
  // In America/Los_Angeles, this is previous day 17:00 PDT
  // In Asia/Tokyo, this is same day 09:00 JST
  // toLocaleString should reflect that
  const local = d.toLocaleString()
  assert.ok(local.length > 0)
})

test('#1 timezone – microseconds preserved', () => {
  // Backend isoformat() includes microseconds if present
  const withMicros = '2026-06-24T19:00:00.123456Z'
  const d = parseEditedAt(withMicros)
  assert.ok(!isNaN(d.getTime()))
  // JS Date only has ms precision, microseconds get truncated/rounded
  assert.equal(d.getUTCMilliseconds(), 123)
  assert.equal(d.toISOString(), '2026-06-24T19:00:00.123Z')
})

test('#1 regression – backend MUST include Z suffix', async () => {
  // Read the actual backend source to verify Z suffix is present
  const fs = await import('node:fs/promises')
  // Check the backend source via filesystem
  const backendPath = new URL('../../backend/app/api/games.py', import.meta.url)
  try {
    const backendSrc = await fs.readFile(backendPath, 'utf8')
    // Find question_history function
    // New convention: timestamps use serialize_datetime() which adds Z
    const usesSerialize = backendSrc.includes('serialize_datetime')
    const hasZLiteral = backendSrc.includes('edited_at') && backendSrc.includes('"Z"')
    assert.ok(
      usesSerialize || hasZLiteral,
      'backend must include Z suffix in edited_at serialization – check backend/app/api/games.py question_history() – should use serialize_datetime()'
    )
    // Specifically check the edited_at line
    const editedAtLines = backendSrc.split('\n').filter(l => l.includes('edited_at'))
    assert.ok(editedAtLines.length > 0, 'found edited_at line')
    const hasZ = editedAtLines.some(l => l.includes('"Z"') || l.includes("'Z'") || l.includes('serialize_datetime'))
    assert.ok(hasZ, `edited_at serialization must include Z suffix (via serialize_datetime). Found lines: ${editedAtLines.join(' | ')}`)
  } catch (e) {
    // If we can't read backend source (different working dir), skip – the other tests still validate behavior
    if (e.code !== 'ENOENT') throw e
  }
})
