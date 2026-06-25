// TDD test for issue #2 – invite join returns game name
// Run with: node --test src/invite-join-name.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, 'App.jsx')

test('#2 join – backend returns name and archived_at', async () => {
  const backendPath = path.join(__dirname, '../../backend/app/api/games.py')
  const src = await fs.readFile(backendPath, 'utf8')
  
  // Find join_game function
  assert.ok(src.includes('def join_game'), 'join_game function exists')
  
  // Verify response includes name
  // Look for the return statement in join_game
  const joinIdx = src.indexOf('def join_game')
  const joinFn = src.slice(joinIdx, joinIdx + 2000)
  
  assert.ok(/"name"/.test(joinFn), 'join_game response must include "name" field')
  assert.ok(/game\.name/.test(joinFn), 'join_game must return game.name')
  assert.ok(/archived_at/.test(joinFn), 'join_game response should include archived_at')
  
  // Verify it queries the Game object
  assert.ok(/db\.query.*Game/.test(joinFn), 'join_game must query Game to get name')
})

test('#2 join – frontend handles join response correctly', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // Find the invite join flow
  assert.ok(src.includes('/api/games/join'), 'frontend calls /api/games/join')
  assert.ok(src.includes('invite_token'), 'frontend sends invite_token')
  
  // Verify setGame is called with name from response
  // Look for setGame({ id: res.game_id, name: res.name
  const hasNameHandling = /setGame.*res\.game_id.*res\.name/s.test(src)
  assert.ok(hasNameHandling, 
    'frontend must set game.name = res.name after join – prevents empty title bug (#2)')
  
  // Verify graceful fallback for missing name
  const hasFallback = /res\.name\s*\|\|\s*['"]['"]/.test(src)
  assert.ok(hasFallback, 'frontend must handle missing res.name gracefully (|| "")')
  
  // Verify archived_at is also handled
  const hasArchived = /res\.archived_at/.test(src)
  assert.ok(hasArchived, 'frontend should handle res.archived_at from join response')
})

test('#2 join – response schema regression lock', async () => {
  // Verify backend test exists and checks name field
  const testPath = path.join(__dirname, '../../backend/tests/test_m6_invite_join.py')
  try {
    const testSrc = await fs.readFile(testPath, 'utf8')
    assert.ok(testSrc.includes('"name" in data') || testSrc.includes("'name' in data"),
      'backend test must assert "name" in join response')
    assert.ok(testSrc.includes('data["name"] == game.name') || testSrc.includes("data['name'] == game.name"),
      'backend test must assert returned name equals game.name')
  } catch (e) {
    if (e.code === 'ENOENT') {
      assert.fail('test_m6_invite_join.py not found')
    }
    throw e
  }
})

test('#2 join – edge cases: null/empty archived_at', async () => {
  const backendPath = path.join(__dirname, '../../backend/app/api/games.py')
  const src = await fs.readFile(backendPath, 'utf8')
  
  const joinIdx = src.indexOf('def join_game')
  const joinFn = src.slice(joinIdx, joinIdx + 2000)
  
  // archived_at should handle NULL case
  // Look for: archived_at.isoformat() + "Z" if game and game.archived_at else None
  assert.ok(/archived_at.*if.*archived_at.*else.*None/.test(joinFn),
    'archived_at serialization must handle NULL case (game not archived)')
  
  // Check for Z suffix on archived_at (consistent with #1 fix)
  const hasZ = /archived_at.*isoformat.*\+.*["']Z["']/.test(joinFn)
  assert.ok(hasZ, 
    'archived_at must include Z suffix for UTC – same bug as #1, must be consistent')
})

test('#2 join – backend returns game data atomically', async () => {
  // Verify join_game queries Game AFTER membership insert + commit
  // This prevents race where game is deleted between invite check and response
  const backendPath = path.join(__dirname, '../../backend/app/api/games.py')
  const src = await fs.readFile(backendPath, 'utf8')
  
  const joinIdx = src.indexOf('def join_game')
  const joinFn = src.slice(joinIdx, joinIdx + 2500)
  
  // Should see: db.commit() then game = db.query(Game)...
  const commitPos = joinFn.indexOf('db.commit()')
  const queryPos = joinFn.indexOf('db.query(models.Game)')
  
  assert.ok(commitPos > 0, 'join_game must commit membership')
  assert.ok(queryPos > 0, 'join_game must query Game for name')
  // Query should be AFTER commit (so membership is persisted)
  // Actually in the code it's: commit, then query Game, then return
  // That's correct – membership is saved before we fetch game details
  assert.ok(queryPos > commitPos, 
    'Game query should happen after commit – ensures membership is persisted')
})

test('#2 join – frontend does NOT show empty title', async () => {
  const src = await fs.readFile(appPath, 'utf8')
  
  // The bug was: setGame({ id: res.game_id, name: '' })
  // Fixed to: setGame({ id: res.game_id, name: res.name || '', ... })
  //
  // Verify the BUGGY pattern is GONE
  const buggyPattern = /setGame\(\{\s*id:\s*res\.game_id,\s*name:\s*['"]['"]\s*\}\)/
  assert.ok(!buggyPattern.test(src),
    'BUG REGRESSION: found setGame with hardcoded empty name – issue #2 not fixed!')
  
  // Verify the FIXED pattern exists
  const fixedPattern = /setGame.*res\.game_id.*res\.name/s
  assert.ok(fixedPattern.test(src),
    'Fixed pattern setGame with res.name must exist')
})
