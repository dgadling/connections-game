import { useState, useRef, useEffect } from 'react'
import { switchTheme, ALLOWED_THEMES } from '../theme.js'

const THEME_META = {
  default:   { label: 'Default',   swatch: 'bg-surface border-2 border-default' },
  tavern:    { label: 'Tavern',    swatch: 'bg-amber-100 border-amber-900' },
  discord:   { label: 'Discord',   swatch: 'bg-[#313338] border-[#5865F2]' },
  tarot:     { label: 'Tarot',     swatch: 'bg-[#1a1028] border-[#c9a84c]' },
  campfire:  { label: 'Campfire',  swatch: 'bg-orange-100 border-orange-600' },
  brutalist: { label: 'Brutalist', swatch: 'bg-white border-black border-2' },
}

function getAvatarUrl(discord_id, avatar_hash) {
  if (!discord_id || !avatar_hash) return null
  const ext = avatar_hash.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${discord_id}/${avatar_hash}.${ext}?size=64`
}

function getInitials(user) {
  const name = user.global_name || user.username || '?'
  return name.slice(0, 2).toUpperCase()
}

export function UserMenu({ user, setUser, onLogout }) {
  const [open, setOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  const currentTheme = user?.theme || 'default'
  const avatarUrl = getAvatarUrl(user?.discord_id, user?.avatar_hash)
  const initials = getInitials(user || {})
  const displayName = user?.global_name || user?.username || 'User'

  // Reset imgError when avatar changes
  useEffect(() => {
    setImgError(false)
  }, [avatarUrl])

  // Click outside / Esc close
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const handleThemeSelect = async (theme) => {
    if (theme === currentTheme) {
      setOpen(false)
      return
    }
    const result = await switchTheme(theme)
    if (result.ok) {
      // Keep user state in sync
      if (setUser) {
        setUser(prev => ({ ...prev, theme }))
      }
      setOpen(false)
    }
    // On error: switchTheme already reverted + toasted
  }

  const handleLogout = () => {
    setOpen(false)
    if (onLogout) onLogout()
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-hover transition-colors"
      >
        <div className="w-7 h-7 rounded-full overflow-hidden bg-surface-muted flex items-center justify-center text-xs font-semibold text-secondary flex-shrink-0">
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt={`${displayName} avatar`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <span className="text-sm text-subtle hidden sm:inline max-w-[120px] truncate">{displayName}</span>
        <span className="text-faint text-xs" aria-hidden="true">▼</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-surface rounded-xl shadow-lg border border-default py-1 z-50"
        >
          <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
            Theme
          </div>
          {ALLOWED_THEMES.map(theme => {
            const meta = THEME_META[theme] || { label: theme, swatch: 'bg-surface-muted border-default' }
            const active = theme === currentTheme
            return (
              <button
                key={theme}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleThemeSelect(theme)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-surface-hover transition-colors ${active ? 'text-foreground font-medium' : 'text-secondary'}`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex-shrink-0 ${meta.swatch}`}
                  aria-hidden="true"
                />
                <span className="flex-1 text-left">{meta.label}</span>
                {active ? <span className="text-primary" aria-hidden="true">✓</span> : null}
              </button>
            )
          })}
          <div className="border-t border-default my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full px-3 py-2 text-left text-sm text-secondary hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}
