export const TAGS = ['warm','secretive','reflective','tension','vulnerable','loyal']

export const TAG_COLORS = {
  warm: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
  secretive: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200',
  reflective: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200',
  tension: 'bg-rose-100 text-rose-900 ring-1 ring-rose-200',
  vulnerable: 'bg-pink-100 text-pink-900 ring-1 ring-pink-200',
  loyal: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
}

export const TAG_ICONS = {
  warm: '☀️',
  secretive: '🤫',
  reflective: '🔮',
  tension: '⚡',
  vulnerable: '💧',
  loyal: '🤝',
}

export function TagBadge({ tag, className = '' }) {
  if (!tag) return null
  const colorClass = TAG_COLORS[tag] || 'bg-neutral-100 text-neutral-700'
  return (
    <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${colorClass} ${className}`}>
      {tag}
    </span>
  )
}

export function TagIcon({ tag, className = 'w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0' }) {
  const colorClass = TAG_COLORS[tag] || 'bg-neutral-100 text-neutral-700'
  const icon = TAG_ICONS[tag] || '•'
  return (
    <span className={`${className} ${colorClass}`} title={tag}>
      {icon}
    </span>
  )
}
