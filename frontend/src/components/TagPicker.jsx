import { useEffect, useState, useRef } from 'react'
import { TAGS, TAG_COLORS, TAG_ICONS } from './TagBadge.jsx'

export function TagPicker({ tag, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={wrapperRef}>
      <button type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o) }}
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0 cursor-pointer transition-all ${TAG_COLORS[tag]||'bg-surface-hover text-secondary'} ${disabled ? 'opacity-60 cursor-default' : ''}`}
        aria-label={`Change tag: ${tag}`}
      >
        {TAG_ICONS[tag] || '•'}
      </button>
      {Boolean(open) && (
        <div
          className="absolute z-50 mt-1 left-0 bg-surface border border-default rounded-xl shadow-lg w-[170px] py-1"
          onClick={e => e.stopPropagation()}
        >
          {TAGS.map(t => (
            <button type="button"
              key={t}
              onClick={(e) => { e.stopPropagation(); onChange(t); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-surface-muted transition-colors ${tag === t ? TAG_COLORS[t] : ''}`}
            >
              <span className="text-[16px]">{TAG_ICONS[t]}</span>
              <span className="font-medium text-secondary">{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
