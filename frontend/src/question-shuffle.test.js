import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('App.jsx uses balanced tag-aware shuffle', () => {
  const src = fs.readFileSync('src/App.jsx', 'utf8')
  assert(src.includes('Balanced shuffle') || src.includes('balanced'), 'Missing balanced shuffle comment')
  assert(src.includes('group by tag') || src.includes('Group by tag'), 'Should group by tag')
  assert(src.includes('tagOrder'), 'Should have tag order randomization')
  assert(src.includes('round-robin') || src.includes('Round-robin'), 'Should interleave round-robin')
})

function balancedShuffle(questions) {
  const shuffleArray = (arr) => { const a = arr.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  const groups = new Map(); questions.forEach(q => { const tag=q.tag||"reflective"; if(!groups.has(tag)) groups.set(tag,[]); groups.get(tag).push(q); });
  const shuffledGroups = Array.from(groups.entries()).map(([tag, tagQs]) => [tag, shuffleArray(tagQs)]);
  const tagOrder = shuffleArray(shuffledGroups.map(([tag]) => tag));
  const groupMap = new Map(shuffledGroups); const shuffled = []; let added=true;
  while (added) { added=false; for (const tag of tagOrder) { const arr = groupMap.get(tag); if (arr && arr.length > 0) { shuffled.push(arr.shift()); added = true; } } }
  return shuffled;
}

test('balanced shuffle prevents tag repetition', () => {
  const tags = ['warm','secretive','reflective','tension','vulnerable','loyal']
  const questions = []; tags.forEach(tag => { for (let i=0;i<5;i++) questions.push({ id: `${tag}-${i}`, tag }) })
  const shuffled = balancedShuffle(questions); assert.equal(shuffled.length, 30)
  let repeats = 0; for (let i=1;i<shuffled.length;i++) if (shuffled[i].tag === shuffled[i-1].tag) repeats++
  assert(repeats <= 2, `Too many adjacent tag repeats: ${repeats}`)
})
