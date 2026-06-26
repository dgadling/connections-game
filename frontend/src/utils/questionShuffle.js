// Balanced shuffle: group by tag, round-robin interleave to prevent tag repetition
export function balancedShuffle(questions) {
  const shuffleArray = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // Group by tag
  const groups = new Map();
  questions.forEach(q => {
    const tag = q.tag || "reflective";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(q);
  });
  // Shuffle within each tag group
  const shuffledGroups = Array.from(groups.entries()).map(([tag, tagQs]) => [tag, shuffleArray(tagQs)]);
  // Randomize tag order for variety each shuffle
  const tagOrder = shuffleArray(shuffledGroups.map(([tag]) => tag));
  const groupMap = new Map(shuffledGroups);
  const shuffled = [];
  let added = true;
  while (added) {
    added = false;
    for (const tag of tagOrder) {
      const arr = groupMap.get(tag);
      if (arr && arr.length > 0) {
        shuffled.push(arr.shift());
        added = true;
      }
    }
  }
  return shuffled;
}
