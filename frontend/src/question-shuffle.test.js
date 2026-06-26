import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { balancedShuffle } from './utils/questionShuffle.js'

test('questionShuffle.js exports balanced tag-aware shuffle', () => {
  const src = fs.readFileSync('src/utils/questionShuffle.js', 'utf8')
  assert(src.includes('Balanced shuffle') || src.includes('balanced'), 'Missing balanced shuffle comment')
  assert(src.includes('group by tag') || src.includes('Group by tag'), 'Should group by tag')
  assert(src.includes('tagOrder'), 'Should have tag order randomization')
  assert(src.includes('round-robin') || src.includes('Round-robin'), 'Should interleave round-robin')
})

test('QuestionsTab imports balancedShuffle from utils', () => {
  const src = fs.readFileSync('src/tabs/QuestionsTab.jsx', 'utf8')
  assert.match(src, /import.*balancedShuffle.*from.*utils\/questionShuffle/, 'QuestionsTab must import balancedShuffle from utils/questionShuffle.js')
})

test('balanced shuffle prevents tag repetition', () => {
  const tags = ['warm','secretive','reflective','tension','vulnerable','loyal']
  const questions = []; tags.forEach(tag => { for (let i=0;i<5;i++) questions.push({ id: `${tag}-${i}`, tag }) })
  const shuffled = balancedShuffle(questions); assert.equal(shuffled.length, 30)
  let repeats = 0; for (let i=1;i<shuffled.length;i++) if (shuffled[i].tag === shuffled[i-1].tag) repeats++
  assert(repeats <= 2, `Too many adjacent tag repeats: ${repeats}`)
})
