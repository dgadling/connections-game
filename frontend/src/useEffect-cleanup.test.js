// Regression test for useEffect cleanup crash (GH #tab-crash)
// Bug: QuestionsTab / MembersTab did useEffect(load, [deps])
// where load = () => api(...).then(...) returns Promise
// React stores effect return value as cleanup fn
// Unmount → cleanup() → Promise is not a function → TypeError: n is not a function
// ErrorBoundaries DON'T catch effect errors → blank page
//
// Fix: useEffect(() => { load() }, [deps]) – effect returns undefined
//
// This test ensures the buggy pattern never regresses.
// It checks that App.jsx contains ZERO calls to useEffect with a bare identifier:
//   BAD:  useEffect(load, [deps])
//   GOOD: useEffect(() => { load() }, [deps])
//
// Rationale: a bare identifier passed to useEffect is usually a function
// that was defined elsewhere, often returning a Promise (api call).
// If that function returns anything other than undefined / cleanup function,
// React will store it as cleanup and crash on unmount.
// Wrapping in () => { load() } discards the return value, preventing the bug.
//
// This is intentionally strict – even safe cases like
// useEffect(loadGames, [user]) where loadGames returns undefined
// are banned, because a future edit could make loadGames return a Promise
// and silently reintroduce the crash (ErrorBoundary won't catch it).
//
// Run with: node --test src/useEffect-cleanup.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, 'App.jsx')
const src = fs.readFileSync(appPath, 'utf8')

test('App.jsx – no bare-identifier useEffect calls (prevents Promise-cleanup crash)', () => {
  // Find useEffect( followed by optional whitespace, followed by a letter/underscore
  // (start of identifier) – NOT followed by '(' (arrow function) or 'function' / 'async'
  // This catches: useEffect(load, …)  useEffect(loadGames, …)
  // Allows:      useEffect(() => …)  useEffect(function() …)  useEffect(async () …
  const badUseEffect = /useEffect\s*\(\s*[a-zA-Z_]/g
  const matches = []
  let m
  while ((m = badUseEffect.exec(src)) !== null) {
    // Look at what comes after useEffect(
    const after = src.slice(m.index, m.index + 40)
    // Allow useEffect(() =>   useEffect(function   useEffect(async
    if (
      after.match(/useEffect\s*\(\s*\(\s*\)/) || // useEffect(() =>
      after.match(/useEffect\s*\(\s*function/) ||
      after.match(/useEffect\s*\(\s*async/)
    ) {
      continue
    }
    // Otherwise, it's useEffect(identifier, …) – BAD
    // Get line number for error message
    const line = src.slice(0, m.index).split('\n').length
    const snippet = src.slice(m.index, m.index + 30).replace(/\n/g, ' ')
    matches.push(`line ${line}: ${snippet}…`)
  }

  assert.equal(
    matches.length,
    0,
    `Found ${matches.length} bare-identifier useEffect call(s) in App.jsx – ` +
    `these can return Promises that React stores as cleanup functions, ` +
    `causing "TypeError: n is not a function" on unmount (ErrorBoundary won't catch).\n` +
    `Fix by wrapping: useEffect(() => { load() }, deps) instead of useEffect(load, deps)\n` +
    `Offenders:\n  - ` + matches.join('\n  - ')
  )
})

test('App.jsx – QuestionsTab and MembersTab useEffect calls are wrapped (specific regression check)', () => {
  // Extra specific check – ensure the two components that had the bug
  // still have the fix applied. Look for the load function definitions
  // near useEffect calls.
  //
  // QuestionsTab load: api(`/api/games/${gameId}/questions?status=${status}`)
  // MembersTab load:  api(`/api/games/${gameId}/members?include_deleted=${showDeleted}`)
  //
  // Both should be called via useEffect(() => { load() }, […])
  // NOT via useEffect(load, […])

  // Simple check – count occurrences of the buggy pattern in the whole file
  // (already done above), plus verify the fixed pattern exists at least twice
  // (once for QuestionsTab, once for MembersTab)
  const wrappedLoadPattern = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*load\(\)\s*\}\s*,\s*\[/g
  const wrappedMatches = src.match(wrappedLoadPattern) || []
  
  assert.ok(
    wrappedMatches.length >= 2,
    `Expected at least 2 instances of useEffect(() => { load() }, […]) ` +
    `in App.jsx (QuestionsTab + MembersTab), found ${wrappedMatches.length}. ` +
    `The useEffect cleanup crash fix may have regressed.`
  )
})

test('App() – no hooks after conditional early return (React #310)', () => {
  // Regression test for React error #310: "Rendered more hooks than during the previous render"
  // Bug (commit 2d25e44, fixed in 65f0875): isOwner bounce useEffect was placed AFTER
  //   if (!user) return (<SignIn />)
  // Result: first render (user=null) runs 0 hooks past the early return,
  //         second render (user={...}) runs useEffect → hook count mismatch → crash, blank page.
  //
  // Rules of Hooks: hooks must be called unconditionally, in the same order every render.
  // Any useState/useEffect/useMemo/etc. AFTER an early return violates this.
  //
  // This test scans the App() function body and ensures ALL hook calls occur
  // BEFORE the first conditional early return.

  // Extract App() function body (export default function App() { ... })
  const appStart = src.indexOf('export default function App()')
  assert.ok(appStart >= 0, 'Could not find App() function')
  const braceOpen = src.indexOf('{', appStart)
  assert.ok(braceOpen >= 0)

  // Find matching closing brace for App() – it's the first top-level function, next is "function GameList"
  const gameListStart = src.indexOf('\nfunction GameList', braceOpen)
  assert.ok(gameListStart >= 0, 'Could not find GameList – App() body end detection failed')
  const appBody = src.slice(braceOpen, gameListStart)

  const lines = appBody.split('\n')
  let firstEarlyReturnLine = -1
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Track brace depth to only catch top-level returns in App(), not nested functions
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    // Check for early return BEFORE updating depth (so we catch "if (…) return" at depth 1)
    if (depth === 1) {
      // Match: if (!user) return (   /   if (!game) return
      // Allow leading whitespace
      if (/^\s*if\s*\([^)]+\)\s*return\b/.test(line)) {
        firstEarlyReturnLine = i
        break
      }
    }
    depth += opens - closes
  }

  assert.ok(firstEarlyReturnLine >= 0, 'Could not find conditional early return in App() – test needs updating if App structure changed')

  // Now check for hook calls AFTER firstEarlyReturnLine
  const hookPattern = /\b(useState|useEffect|useMemo|useCallback|useRef|useContext|useReducer|useLayoutEffect)\s*\(/
  const offenders = []
  for (let i = firstEarlyReturnLine; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(hookPattern)
    if (m) {
      offenders.push(`line ~${i + 1} in App() body: ${line.trim().slice(0, 60)}`)
    }
  }

  assert.equal(
    offenders.length,
    0,
    `Found ${offenders.length} hook call(s) AFTER a conditional early return in App(). ` +
    `This violates React Rules of Hooks and causes error #310 "Rendered more hooks than during the previous render" – blank white page on login.\n` +
    `Move ALL hooks to the top of the component, before ANY conditional returns.\n` +
    `Offenders:\n  - ` + offenders.join('\n  - ')
  )
})
