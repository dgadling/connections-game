export const TAGS = ['warm','secretive','reflective','tension','vulnerable','loyal']

export const TAG_COLORS = {
  warm: 'tag-warm ring-1',
  secretive: 'tag-secretive ring-1',
  reflective: 'tag-reflective ring-1',
  tension: 'tag-tension ring-1',
  vulnerable: 'tag-vulnerable ring-1',
  loyal: 'tag-loyal ring-1',
}

export const TAG_ICONS = {
  warm: '🥰',
  secretive: '🤫',
  reflective: '🤔',
  tension: '⚡',
  vulnerable: '🥺',
  loyal: '🤝',
}

export function TagBadge({ tag, className = '' }) {
  if (!tag) return null
  const colorClass = TAG_COLORS[tag] || 'tag-default'
  return (
    <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${colorClass} ${className}`}>
      {tag}
    </span>
  )
}

export function TagIcon({ tag, className = 'w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0' }) {
  const colorClass = TAG_COLORS[tag] || 'tag-default'
  const icon = TAG_ICONS[tag] || '•'
  return (
    <span className={`${className} ${colorClass}`} title={tag}>
      {icon}
    </span>
  )
}
