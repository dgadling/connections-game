import { test, expect } from 'vitest'
import { balancedShuffle } from './questionShuffle.js'

test('balanced shuffle prevents tag repetition', () => {
  const tags = ['warm','secretive','reflective','tension','vulnerable','loyal']
  const questions = []
  tags.forEach(tag => { for (let i=0;i<5;i++) questions.push({ id: `${tag}-${i}`, tag }) })
  const shuffled = balancedShuffle(questions)
  expect(shuffled.length).toBe(30)
  let repeats = 0
  for (let i=1;i<shuffled.length;i++) if (shuffled[i].tag === shuffled[i-1].tag) repeats++
  expect(repeats).toBeLessThanOrEqual(2)
})

test('balanced shuffle preserves all questions', () => {
  const questions = [
    { id: 'a', tag: 'warm' },
    { id: 'b', tag: 'tension' },
    { id: 'c', tag: 'warm' },
  ]
  const shuffled = balancedShuffle(questions)
  expect(shuffled.length).toBe(3)
  const ids = shuffled.map(q => q.id).sort()
  expect(ids).toEqual(['a', 'b', 'c'])
})

test('balanced shuffle handles missing tags', () => {
  const questions = [
    { id: 'a' },
    { id: 'b', tag: null },
    { id: 'c', tag: '' },
  ]
  const shuffled = balancedShuffle(questions)
  expect(shuffled.length).toBe(3)
  // missing/null/empty tags default to 'reflective'
  expect(shuffled.every(q => q.id)).toBe(true)
})
