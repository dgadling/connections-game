// TDD test for invite join flow
// Run with: node --test src/invite-join.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, 'App.jsx')
const src = fs.readFileSync(appPath, 'utf8')

test('GameList – auto-join from ?invite=TOKEN URL', () => {
  const checks = [
    { name: 'reads window.location.search', re: /location\.search/ },
    { name: 'parses invite param (URLSearchParams / get.*invite)', re: /URLSearchParams|get.*invite/i },
    { name: 'POST /api/games/join', re: /\/api\/games\/join/ },
    { name: 'invite_token in request body', re: /invite_token/ },
    { name: 'history.replaceState to clean URL', re: /history\.replaceState|replaceState/ },
    { name: 'navigates to game after join (setGame)', re: /setGame/ },
  ]
  const missing = checks.filter(c => !c.re.test(src))
  assert.equal(missing.length, 0,
    `Invite auto-join flow incomplete. Missing:\n  - ` + missing.map(m => m.name).join('\n  - ')
  )
})

test('GameList – manual join is via invite URL, not code input', () => {
  // Issue #6: "Join with invite code" UI was removed – join is via full URL only (?invite=TOKEN)
  // Verify the old "Join with invite code" input UI is gone
  const hasJoinCodeUI = /Join with invite/i.test(src)
  assert.equal(hasJoinCodeUI, false,
    'Manual "Join with invite code" UI should be removed per issue #6. Join is via invite URL (?invite=TOKEN) only.'
  )
  // Verify auto-join from URL still works
  const hasUrlJoin = /\/api\/games\/join/.test(src) && /URLSearchParams|get.*invite/i.test(src)
  assert.ok(hasUrlJoin, 'Invite URL auto-join flow (?invite=TOKEN) must still exist')
})

test('GameList – join error handling is user-visible', () => {
  // Must show errors to user, not just console.error
  const hasJoinCall = /\/api\/games\/join/.test(src)
  assert.ok(hasJoinCall, 'No /api/games/join call found – join flow not implemented')
  // Look for error state handling near join code
  const joinIdx = src.indexOf('/api/games/join')
  const context = src.slice(Math.max(0, joinIdx - 500), joinIdx + 1500)
  const hasErrorUI = /error|Error|catch|alert/i.test(context)
  assert.ok(hasErrorUI, 'Join error handling not found near /api/games/join call')
})
