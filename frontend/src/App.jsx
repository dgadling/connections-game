import { useEffect, useState, useRef, useCallback, Component } from 'react'
import toast from 'react-hot-toast'

function csrf() {
  return document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || ''
}

function toastErr(e) {
  const msg = e?.message || String(e || 'Request failed')
  toast.error(msg)
  // also log for debugging
  console.error(e)
}

async function api(path, opts={}) {
  const headers = { ...(opts.headers||{}) }
  if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf()
  let r
  try {
    r = await fetch(path, { credentials: 'include', ...opts, headers })
  } catch (e) {
    throw new Error('Network error – check your connection')
  }
  if (r.status === 401 && !path.startsWith('/auth/')) {
    // session expired - force re-auth (but not for /auth/* endpoints where 401 means "not logged in")
    window.location.href = '/'
    throw new Error('Session expired – redirecting to login')
  }
  if (!r.ok) {
    const txt = await r.text().catch(()=>'')
    throw new Error(txt || `Request failed (${r.status})`)
  }
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('json')) return await r.json()
  return await r.text()
}

const TAGS = ['warm','secretive','reflective','tension','vulnerable','loyal']
const TAG_COLORS = {
  warm: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
  secretive: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200',
  reflective: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200',
  tension: 'bg-rose-100 text-rose-900 ring-1 ring-rose-200',
  vulnerable: 'bg-pink-100 text-pink-900 ring-1 ring-pink-200',
  loyal: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
}
const TAG_ICONS = {
  warm: '☀️',
  secretive: '🤫',
  reflective: '🔮',
  tension: '⚡',
  vulnerable: '💧',
  loyal: '🛡️',
}

const arr = (d) => Array.isArray(d) ? d : []

function TagPicker({ tag, onChange, disabled }) {
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
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0 cursor-pointer transition-all ${TAG_COLORS[tag]||'bg-neutral-100 text-neutral-700'} ${disabled ? 'opacity-60 cursor-default' : ''}`}
        aria-label={`Change tag: ${tag}`}
      >
        {TAG_ICONS[tag] || '•'}
      </button>
      {Boolean(open) && (
        <div
          className="absolute z-50 mt-1 left-0 bg-white border border-neutral-200 rounded-xl shadow-lg w-[170px] py-1"
          onClick={e => e.stopPropagation()}
        >
          {TAGS.map(t => (
            <button type="button"
              key={t}
              onClick={(e) => { e.stopPropagation(); onChange(t); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-neutral-50 transition-colors ${tag === t ? TAG_COLORS[t] : ''}`}
            >
              <span className="text-[16px]">{TAG_ICONS[t]}</span>
              <span className="font-medium text-neutral-800">{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(p){ super(p); this.state = { err: null } }
  static getDerivedStateFromError(err){ return { err } }
  componentDidCatch(err, info){ console.error('💥 React crash:', err, info.componentStack); toast.error('Something crashed – see details below') }
  render(){
    if (this.state.err) {
      return <div className="p-4 bg-red-50 border border-red-300 rounded-xl text-sm max-w-2xl mx-auto my-8">
        <div className="font-bold text-red-800 mb-2">Something went wrong</div>
        <pre className="whitespace-pre-wrap text-xs text-red-900/80">{String(this.state.err.message || this.state.err)}</pre>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={()=>this.setState({err:null})} className="px-3 py-1.5 bg-white border border-red-300 rounded text-xs hover:bg-red-50">Try again</button>
          <button type="button" onClick={()=>window.location.reload()} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">Reload page</button>
        </div>
      </div>
    }
    return this.props.children
  }
}
export { ErrorBoundary }

export default function App() {
  const [user, setUser] = useState(undefined)
  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [game, setGame] = useState(null)
  const [tab, setTab] = useState('ask')
  const [signingIn, setSigningIn] = useState(false)

  const doLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch(e) { toastErr(e) }
    setUser(null); setGame(null)
  }

  useEffect(() => {
    api('/auth/me').then(setUser).catch(async () => {
      // try silent refresh via discord_id_hint cookie
      const match = document.cookie.split('; ').find(c => c.startsWith('discord_id_hint='))
      const discord_id = match ? match.split('=')[1] : null
      if (discord_id) {
        try {
          const u = await api('/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discord_id })
          })
          setUser(u)
          return
        } catch (e) {
          // refresh failed, fall through
        }
      }
      setUser(null)
    })
  }, [])

  const loadGames = useCallback(async () => {
    if (!user) return
    setGamesLoading(true)
    try {
      const d = await api('/api/games')
      setGames(arr(d))
    } catch (e) {
      toastErr(e)
      setGames([])
    } finally {
      setGamesLoading(false)
    }
  }, [user])
  useEffect(() => { loadGames() }, [loadGames])

  // Refresh games list whenever returning to the GameList view (game becomes null)
  // Fixes stale archived_at in the games list after archiving/unarchiving
  useEffect(() => {
    if (!game) loadGames()
  }, [game, loadGames])

  // Auto-join from ?invite=TOKEN in URL
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    const inviteToken = params.get('invite')
    if (!inviteToken) return
    // Clear the URL immediately to prevent double-join on refresh
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, '', cleanUrl)
    ;(async () => {
      try {
        const res = await api('/api/games/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_token: inviteToken })
        })
        // Refresh game list, then navigate to joined game
        await loadGames()
        setGame({ id: res.game_id, name: res.name || '', archived_at: res.archived_at || null, discord_role_id: res.discord_role_id || null })
        toast.success('Joined game!')
      } catch (e) {
        toastErr(e)
        loadGames()
      }
    })()
  }, [user, loadGames])

  if (user === undefined) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="text-center">
        <div className="text-4xl mb-2 animate-pulse">🤝</div>
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    </div>
  )

  if (user === null) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4">
      <div className="text-center max-w-sm w-full">
        {signingIn ? (
          <>
            <div className="text-5xl mb-3 animate-pulse">🤝</div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-2">Signing in with Discord…</h1>
            <p className="text-neutral-600 text-sm">Redirecting you to Discord</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3">🤝</div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-2">Connections</h1>
            <p className="text-neutral-600 text-sm mb-6">The character bonding game for your table</p>
            <button type="button"
              onClick={async () => {
                setSigningIn(true)
                try {
                  const redirect_after = window.location.pathname + window.location.search
                  const r = await fetch(`/auth/discord/start?redirect_after=${encodeURIComponent(redirect_after)}`, {method:'POST', credentials:'include', headers:{'X-CSRF-Token':csrf()}})
                  const {auth_url} = await r.json()
                  window.location = auth_url
                } catch (e) {
                  setSigningIn(false)
                  toastErr(e)
                }
              }}
              disabled={signingIn}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-60"
            >{signingIn ? 'Signing in…' : 'Sign in with Discord'}</button>
          </>
        )}
      </div>
    </div>
  )

  if (!game) return <GameList user={user} games={games} gamesLoading={gamesLoading} setGame={setGame} onRefresh={loadGames} onLogout={doLogout} />

  const tabs = [
    ['ask','Ask', '💬'],
    ['questions','Questions', '❓'],
    ['members','Members', '👥'],
    ['history','History', '📜'],
    ['admin','Admin', '⚙️'],
  ]

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={()=>setGame(null)} className="text-sm text-neutral-500 hover:text-neutral-900">← games</button>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 truncate">{game.name}</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
            <span>{user.global_name || user.username}</span>
            <button type="button" onClick={doLogout} title="Log out" aria-label="Log out"
              className="px-1.5 py-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors text-base leading-none">
              ⍈
            </button>
          </div>
        </div>
      </header>

      {Boolean(game.archived_at) && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 text-center">
          📦 This game is archived – read-only
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-3">
        <nav className="flex gap-0.5 sm:gap-2 text-[11px] sm:text-sm overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-0 border-b border-neutral-200">
          {tabs.map(([t,label,icon]) => (
            <button type="button" key={t} onClick={()=>setTab(t)}
              className={`flex items-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 py-2 sm:py-2.5 whitespace-nowrap rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab===t ? 'border-indigo-600 text-indigo-700 font-semibold bg-white' : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-4 sm:py-6 pb-20 sm:pb-6">
        <ErrorBoundary>
          {tab === 'ask' && <RoundTab gameId={game.id} game={game} archived={!!game.archived_at} />}
          {tab === 'questions' && <QuestionsTab gameId={game.id} archived={!!game.archived_at} />}
          {tab === 'members' && <MembersTab gameId={game.id} archived={!!game.archived_at} />}
          {tab === 'history' && <HistoryTab gameId={game.id} game={game} />}
          {tab === 'admin' && <AdminTab gameId={game.id} game={game} onGameUpdate={g => setGame({...game, ...g})} onGamesRefresh={loadGames} onGameDeleted={()=>setGame(null)} currentUserDiscordId={user?.discord_id} />}
        </ErrorBoundary>
      </main>
    </div>
  )
}

function GameList({ user, games, gamesLoading, setGame, onRefresh, onLogout }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const createGame = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const g = await api('/api/games', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: name.trim()})})
      setName(''); await onRefresh()
      setGame({id: g.id, name: g.name, archived_at: g.archived_at, discord_role_id: g.discord_role_id || null})
      toast.success('Game created')
    } catch (e) { toastErr(e) } finally { setCreating(false) }
  }
  // Fetch fresh game details before navigating – prevents stale archived_at
  const openGame = async (gameId) => {
    if (openingId) return
    setOpeningId(gameId)
    try {
      const g = await api(`/api/games/${gameId}`)
      setGame({ id: g.id, name: g.name, archived_at: g.archived_at, discord_role_id: g.discord_role_id || null })
    } catch (e) {
      toastErr(e)
      // Fall back to list data if fetch fails
      const fallback = arr(games).find(x => x.id === gameId)
      if (fallback) setGame({ id: fallback.id, name: fallback.name, archived_at: fallback.archived_at, discord_role_id: fallback.discord_role_id || null })
    } finally {
      setOpeningId(null)
    }
  }
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">🤝 Connections</h1>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span>{user.global_name || user.username}</span>
            {Boolean(onLogout) && (
              <button type="button" onClick={onLogout} title="Log out" aria-label="Log out"
                className="px-1.5 py-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors text-base leading-none">
                ⍈
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm text-neutral-600">{gamesLoading ? 'Loading…' : `${arr(games).filter(g=>!g.archived_at).length} active game${arr(games).filter(g=>!g.archived_at).length===1?"":"s"}`}</div>
        </div>
        <div className="space-y-2 mb-6">
          {arr(games).filter(g=>!g.archived_at).map(g => (
            <button type="button" key={g.id} onClick={()=>openGame(g.id)} disabled={!!openingId}
              className="w-full text-left bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:border-indigo-300 transition-colors disabled:opacity-60">
              <div className="font-medium">{g.name}{openingId===g.id ? ' …' : ''}</div>
            </button>
          ))}
          {!gamesLoading && arr(games).filter(g=>!g.archived_at).length===0 && <div className="text-neutral-500 text-sm bg-white rounded-xl shadow-sm border border-neutral-200 p-4">No active games — create one below, or follow an invite link to join.</div>}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5 mb-5">
          <div className="font-semibold mb-2">New game</div>
          <div className="flex gap-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Campaign name…" disabled={creating}
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50"
              onKeyDown={e=>e.key==='Enter'&&createGame()} />
            <button type="button" onClick={createGame} disabled={creating || !name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap disabled:opacity-60">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>

        {arr(games).filter(g=>g.archived_at).length > 0 && (
          <>
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mt-6 mb-2 px-1">Archived</div>
            <div className="space-y-2">
              {arr(games).filter(g=>g.archived_at).map(g => (
                <button type="button" key={g.id} onClick={()=>openGame(g.id)} disabled={!!openingId}
                  className="w-full text-left bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:border-neutral-300 transition-colors opacity-75 disabled:opacity-40">
                  <div className="font-medium text-neutral-700">{g.name}{openingId===g.id ? ' …' : ''}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// --- Round Tab ---
function RoundTab({ gameId, game, archived }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/games/${gameId}/round`)
      setData(d)
    } catch (e) {
      toastErr(e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [gameId])
  useEffect(() => { load() }, [load])
  const complete = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await api(`/api/games/${gameId}/round/complete`, {method:'POST'})
      toast.success('Round marked complete')
      await load()
    } catch (e) { toastErr(e) } finally { setCompleting(false) }
  }

  const formatDiscordMention = (id, name) => {
    // Role mode: suppress individual mentions, use plain name
    if (game?.discord_role_id) return name || null
    if (!id) return name || null
    if (/^\d{17,20}$/.test(id)) return `<@${id}>`
    return id.startsWith('@') ? id : '@' + id
  }

  const copyDiscord = () => {
    if (!data) return
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const lines = []
    if (game?.discord_role_id) {
      lines.push(`<@&${game.discord_role_id}>`)
    }
    const qTag = data.question?.tag
    const qEmoji = TAG_ICONS[qTag] || ''
    const qText = data.question?.text || '(no question)'
    lines.push(`🤝 Connections — ${dateStr}`, '', `> ${qEmoji}${qText}`, '')
    arr(data.pairings).forEach(p => {
      const asker = formatDiscordMention(p.asker_discord_id, p.asker_name)
      const target = formatDiscordMention(p.target_discord_id, p.target_name)
      lines.push(`• ${asker} answers about ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n')).then(()=>toast.success('Copied to clipboard')).catch(()=>toastErr(new Error('Copy failed')))
    setCopied(true); setTimeout(()=>setCopied(false), 1500)
  }

  if (loading) return <div className="text-neutral-500">Loading…</div>
  if (!data) return <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 text-sm text-red-700">Failed to load round. <button type="button" onClick={load} className="underline">Retry</button></div>

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900 text-sm text-neutral-500">{todayStr}</h2>
          <button type="button" onClick={copyDiscord} disabled={!data.question || arr(data.pairings).length === 0} className="text-xs px-2.5 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed">{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        {data.question ? (
          <>
            <div className="flex items-start gap-2 mb-4">
              <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${TAG_COLORS[data.question.tag]||'bg-neutral-100 text-neutral-700'}`}>{data.question.tag}</span>
            </div>
            <div className="text-[17px] sm:text-lg text-neutral-900 leading-relaxed mb-4">{data.question.text}</div>
          </>
        ) : (
          <div className="text-neutral-500 mb-4">No question set — add questions in the Questions tab.</div>
        )}
        <div className="space-y-2">
          {arr(data.pairings).map(p => (
            <div key={`${p.asker_id}-${p.target_id}`} className="flex items-center gap-2 text-sm py-2 px-3 bg-neutral-50 rounded-lg">
              <span className="font-medium">{p.asker_name}</span>
              <span className="text-neutral-400">→</span>
              <span className="text-neutral-700">{p.target_name}</span>
            </div>
          ))}
          {arr(data.pairings).length === 0 && <div className="text-sm text-neutral-500">No pairings yet — add 3+ members.</div>}
        </div>
        {Boolean(data.question && arr(data.pairings).length > 0 && !archived) && (
          <button type="button" onClick={complete} disabled={completing}
            className="mt-4 w-full sm:w-auto px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60">
            {completing ? 'Saving…' : 'Mark round complete'}
          </button>
        )}
      </div>
    </div>
  )
}

function QuestionItem({ q, idx, status, editing, editText, setEditText, onSaveEdit, onCancelEdit, onSetTag, onRevertTag, onEditStart, onOpenHistory, onGraveyard, onRestore, onDelete, dragIdx, onDragStart, onDragOver, onDragEnd, onGripTouch, saving }) {
  const isDragging = dragIdx === idx
  return (
    <div
      data-q-idx={idx}
      draggable={status === 'upcoming' && editing !== q.id && !saving}
      onDragStart={status === 'upcoming' ? onDragStart(idx) : undefined}
      onDragOver={status === 'upcoming' ? onDragOver(idx) : undefined}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg shadow-sm border border-neutral-200 px-3 py-2.5 transition-all ${isDragging ? 'opacity-40' : ''}`}>
      {editing === q.id ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={500} placeholder="Edit question…" disabled={saving}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50" autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={()=>onSaveEdit(q)} disabled={saving}
              className="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onCancelEdit} disabled={saving}
              className="flex-1 sm:flex-initial px-3 py-2 border border-neutral-300 rounded-lg text-sm disabled:opacity-60">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          {status==='upcoming' ? (
            <span
              onTouchStart={onGripTouch(idx)}
              style={{ touchAction: 'none' }}
              className="text-neutral-300 hover:text-neutral-500 shrink-0 cursor-grab active:cursor-grabbing select-none text-[14px] leading-snug pt-0.5"
              title="Drag to reorder">⋮⋮</span>
          ) : null}
          {status==='upcoming' ? (
            <TagPicker tag={q.tag} onChange={tag => onSetTag(q, tag)} disabled={saving} />
          ) : null}
          {status!=='upcoming' ? (
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0 ${TAG_COLORS[q.tag]||'bg-neutral-100 text-neutral-700'}`} title={q.tag}>
              {TAG_ICONS[q.tag] || '•'}
            </span>
          ) : null}
          {!q.tag_auto ? <button type="button" onClick={()=>onRevertTag(q)} disabled={saving} title="Revert to auto" className="text-[10px] text-neutral-400 hover:text-neutral-600 shrink-0 pt-0.5 disabled:opacity-50">↺</button> : null}
          <span className="flex-1 text-[14px] leading-snug text-neutral-900 min-w-0">{q.text}</span>
          <div className="flex items-start gap-3 text-[13px] text-neutral-500 shrink-0 pl-2 pt-0.5">
            <button type="button" onClick={()=>onEditStart(q)} disabled={saving} className="hover:text-neutral-900 disabled:opacity-50" title="Edit">✏️</button>
            {q.edit_count > 0 ? <button type="button" onClick={()=>onOpenHistory(q)} disabled={saving} className="hover:text-neutral-900 disabled:opacity-50" title="History">🕓</button> : null}
            {(status==='upcoming' || status==='used') ? <button type="button" onClick={()=>onGraveyard(q)} disabled={saving} className="hover:text-neutral-900 disabled:opacity-50" title="Graveyard">💀</button> : null}
            {status==='graveyard' ? <>
              <button type="button" onClick={()=>onRestore(q)} disabled={saving} className="hover:text-neutral-900 disabled:opacity-50" title="Restore">♻️</button>
              <button type="button" onClick={()=>onDelete(q)} disabled={saving} className="hover:text-red-600 disabled:opacity-50" title="Delete permanently">✕</button>
            </> : null}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Questions Tab ---
function QuestionsTab({ gameId, archived }) {
  const [status, setStatus] = useState('upcoming')
  const [qs, setQs] = useState([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [historyQ, setHistoryQ] = useState(null)
  const [history, setHistory] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [usedCount, setUsedCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/games/${gameId}/questions?status=${status}`)
      const a = arr(d); setQs(a)
      if (status === 'upcoming') {
        if (a.length === 0) {
          try {
            const u = await api(`/api/games/${gameId}/questions?status=used`)
            setUsedCount(arr(u).length)
          } catch { setUsedCount(0) }
        } else { setUsedCount(0) }
      }
    } catch (e) {
      toastErr(e); setQs([])
    } finally {
      setLoading(false)
    }
  }, [gameId, status])
  useEffect(() => { load() }, [load])

  const addQuestion = async () => {
    if (!newText.trim() || adding) return
    setAdding(true)
    try {
      await api(`/api/games/${gameId}/questions`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText.trim()})})
      setNewText('')
      toast.success('Question added')
      load()
    } catch (e) { toastErr(e) } finally { setAdding(false) }
  }

  const wrapSaving = async (id, fn) => {
    setSavingId(id)
    try { await fn(); await load() } catch (e) { toastErr(e) } finally { setSavingId(null) }
  }

  const setTag = async (q, tag) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag, tag_auto: false})}))

  const revertTag = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag_auto: true})}))

  const saveEdit = async (q) => {
    setSavingId(q.id)
    try {
      await api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: editText})})
      setEditing(null)
      toast.success('Saved')
      await load()
    } catch (e) { toastErr(e) } finally { setSavingId(null) }
  }

  const openHistory = async (q) => {
    try {
      const h = await api(`/api/games/${gameId}/questions/${q.id}/history`)
      setHistory(arr(h)); setHistoryQ(q)
    } catch(e) { toastErr(e); setHistory([]); setHistoryQ(q) }
  }

  const graveyard = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}/graveyard`, {method:'POST'}))
  const restore = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}/restore`, {method:'POST'}))
  const del = async (q) => { if (!confirm('Delete permanently?')) return; await wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'DELETE'})) }

  // drag reorder – native HTML5 + touch, ported from Corvessa Space
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const questionListRef = useRef(null)

  const showDropLine = (pos) =>
    dragIdx !== null && dropIdx === pos && pos !== dragIdx && pos !== dragIdx + 1

  const performReorder = async (fromIdx, toIdx) => {
    const ids = qs.map(q => q.id)
    const [moved] = ids.splice(fromIdx, 1)
    const adj = toIdx > fromIdx ? toIdx - 1 : toIdx
    ids.splice(adj, 0, moved)
    try {
      await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids: ids})})
      await load()
    } catch (e) { toastErr(e) }
  }

  const onDragStart = (idx) => (e) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(idx))
  }

  const onDragOver = (idx) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    setDropIdx(e.clientY < rect.top + rect.height / 2 ? idx : idx + 1)
  }

  const finishDrag = () => {
    if (dragIdx !== null && dropIdx !== null && dropIdx !== dragIdx && dropIdx !== dragIdx + 1) {
      performReorder(dragIdx, dropIdx)
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  const onGripTouch = (idx) => (e) => {
    e.stopPropagation()
    setDragIdx(idx)
  }

  const onListTouchMove = (e) => {
    if (dragIdx === null || !questionListRef.current) return
    const y = e.touches[0].clientY
    const items = questionListRef.current.querySelectorAll("[data-q-idx]")
    let pos = 0
    items.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (y > rect.top + rect.height / 2) pos = Number(el.dataset.qIdx) + 1
    })
    setDropIdx(pos)
  }

  const onListTouchEnd = () => finishDrag()


  const shuffleQuestions = async () => {
    // Balanced shuffle: group by tag, round-robin interleave to prevent tag repetition
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
    qs.forEach(q => {
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
    const question_ids = shuffled.map(q => q.id)
    setBusy(true)
    try {
      await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids})})
      toast.success('Shuffled')
      await load()
    } catch (e) { toastErr(e) } finally { setBusy(false) }
  }

  const seedQuestions = async () => {
    if (!confirm('Load the 38-question Corvessa starter pack? Duplicates will be skipped.')) return
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/seed`, {method:'POST'})
      toast.success(`Added ${r.inserted} questions` + (r.inserted === 0 ? ' (all already present)' : ''))
      load()
    } catch(e) { toastErr(e) }
    finally { setBusy(false) }
  }

  const doImport = async () => {
    const lines = importText.split('\n').map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) { toast.error('Paste at least one question (one per line).'); return }
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/import`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({questions: lines})})
      toast.success(`Imported ${r.inserted} questions` + (r.skipped ? `, ${r.skipped} skipped` : ''))
      setImportText(''); setShowImport(false); load()
    } catch(e) { toastErr(e) }
    finally { setBusy(false) }
  }

  const doExport = async () => {
    try {
      const rows = await api(`/api/games/${gameId}/questions/export?status=${status === 'graveyard' ? 'graveyard' : 'all'}`)
      const blob = new Blob([JSON.stringify(rows, null, 2)], {type: 'application/json'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `connections-questions-${status}-${new Date().toISOString().slice(0,10)}.json`
      a.click(); URL.revokeObjectURL(url)
      toast.success('Exported')
    } catch(e) { toastErr(e) }
  }

  const recycleQuestions = async () => {
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/recycle`, {method:'POST'})
      if (r.recycled_count === 0) { toast('No used questions to recycle.'); return }
      toast.success(`Recycled ${r.recycled_count} questions`)
      load()
    } catch(e) { toastErr(e) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* status tabs + tools */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3 sm:p-4">
        <div className="flex items-center gap-4 border-b border-neutral-200 pb-3 mb-3">
          {['upcoming','used','graveyard'].map(s => (
            <button type="button" key={s} onClick={()=>setStatus(s)} disabled={loading}
              className={`pb-1 -mb-3 border-b-2 text-sm capitalize transition-colors ${status===s ? 'border-indigo-600 font-semibold text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'} disabled:opacity-50`}>{s}</button>
          ))}
          <span className="ml-auto text-xs text-neutral-500">{loading ? '…' : qs.length}</span>
        </div>

        {status === 'upcoming' && !archived && (
          <>
            <div className="flex gap-2 mb-3">
              <input value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a question…"
                maxLength={500} disabled={adding}
                className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50"
                onKeyDown={e=>e.key==='Enter'&&addQuestion()} />
              <button type="button" onClick={addQuestion} disabled={adding || !newText.trim()}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap disabled:opacity-60">
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={seedQuestions} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📦 Load starter pack</button>
              <button type="button" onClick={()=>setShowImport(v=>!v)} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📥 Import</button>
              <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📤 Export</button>
              {qs.length > 1 && <button type="button" onClick={shuffleQuestions} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 ml-auto disabled:opacity-50">🔀 Shuffle</button>}
            </div>
            {Boolean(showImport) && (
              <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="text-xs font-medium text-neutral-700 mb-1.5">Paste questions, one per line</div>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  placeholder={"What scares you?\nWhat's your fondest memory?\n…"} disabled={busy}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-100" />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={doImport} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">Import</button>
                  <button type="button" onClick={()=>{setShowImport(false); setImportText('')}} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs hover:bg-white disabled:opacity-50">Cancel</button>
                  <span className="text-[11px] text-neutral-500 ml-auto self-center">Tags auto-classified · duplicates skipped</span>
                </div>
              </div>
            )}
          </>
        )}
        {status !== 'upcoming' && (
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📤 Export {status}</button>
          </div>
        )}
      </div>

      {/* question list */}
      <div
        ref={questionListRef}
        className="space-y-1.5"
        onDragOver={e => e.preventDefault()}
        onDrop={finishDrag}
        onTouchMove={onListTouchMove}
        onTouchEnd={onListTouchEnd}
      >
        {loading ? <div className="text-sm text-neutral-500 px-1">Loading…</div> : null}
        {!loading && qs.map((q, idx) => (
          <div key={q.id}>
            {showDropLine(idx) && (
              <div className="h-0.5 mx-3 rounded-full bg-indigo-600" />
            )}
            <QuestionItem
              q={q}
              idx={idx}
              status={status}
              editing={editing}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              onSetTag={setTag}
              onRevertTag={revertTag}
              onEditStart={(qq) => { setEditing(qq.id); setEditText(qq.text) }}
              onOpenHistory={openHistory}
              onGraveyard={graveyard}
              onRestore={restore}
              onDelete={del}
              dragIdx={dragIdx}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={finishDrag}
              onGripTouch={onGripTouch}
              saving={savingId === q.id}
            />
          </div>
        ))}
        {showDropLine(qs.length) && (
          <div className="h-0.5 mx-3 rounded-full bg-indigo-600" />
        )}
        {!loading && qs.length===0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-neutral-700 font-medium mb-1">No {status} questions yet</div>
            {status === 'upcoming' && !archived && (
              usedCount > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-neutral-500">{usedCount} question{usedCount===1?'':'s'} in used pool</div>
                  <button type="button" onClick={recycleQuestions} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">♻️ Recycle used questions ({usedCount})</button>
                </div>
              ) : (
                <div className="text-sm text-neutral-500">Add one above, or load the 38-question starter pack.</div>
              )
            )}
          </div>
        )}
      </div>

      {Boolean(historyQ) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40" onClick={()=>setHistoryQ(null)}>
          <div role="dialog" aria-label="Edit history" className="bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-lg w-full text-sm" onClick={e=>e.stopPropagation()}>
            <div className="font-semibold mb-3">Edit history</div>
            <div className="text-xs text-neutral-500 mb-2 truncate">Current: [{historyQ.tag}] {historyQ.text}</div>
            {arr(history).length===0 ? <div className="text-neutral-500">No edits yet.</div> : (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {arr(history).slice().reverse().map((h, i, rev) => {
                  const newer = i === 0 ? historyQ : { text: rev[i-1].old_text, tag: rev[i-1].old_tag }
                  const changedText = h.old_text !== newer.text
                  const changedTag = h.old_tag !== newer.tag
                  return <li key={h.id} className="border-b border-neutral-100 pb-2 text-xs">
                    <div className="text-neutral-500">{h.edited_at ? new Date(h.edited_at).toLocaleString() : ''} · {h.edited_by_name || h.edited_by}</div>
                    <div className="text-neutral-700">
                      {changedText ? <span><span className="text-neutral-400">&quot;{h.old_text}&quot;</span><span className="mx-1">→</span><span>&quot;{newer.text}&quot;</span></span> : null}
                      {!changedText && changedTag ? <span><span className="text-neutral-400">tag {h.old_tag}</span><span className="mx-1">→</span><span>{newer.tag}</span></span> : null}
                      {!changedText && !changedTag ? <span className="text-neutral-400">[{h.old_tag}] {h.old_text}</span> : null}
                    </div>
                  </li>
                })}
              </ul>
            )}
            <button type="button" onClick={()=>setHistoryQ(null)} className="mt-3 px-3 py-2 border border-neutral-300 rounded-lg text-sm w-full sm:w-auto">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Members Tab ---
function MembersTab({ gameId, archived }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [name, setName] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDiscord, setEditDiscord] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/games/${gameId}/members?include_deleted=${showDeleted}`)
      setMembers(arr(d))
    } catch (e) { toastErr(e); setMembers([]) } finally { setLoading(false) }
  }, [gameId, showDeleted])
  useEffect(() => { load() }, [load])

  const addMember = async () => {
    if (!name.trim() || adding) return
    setAdding(true)
    const body = { name: name.trim() }
    const disc = discordId.trim()
    if (disc) body.discord_id = disc
    try {
      await api(`/api/games/${gameId}/members`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
      setName(''); setDiscordId('')
      toast.success('Member added')
      load()
    } catch(e) { toastErr(e) } finally { setAdding(false) }
  }

  const saveEdit = async (m) => {
    if (saving) return
    setSaving(true)
    const body = {}
    if (editName !== m.name) body.name = editName
    const disc = editDiscord.trim()
    if (disc !== (m.discord_id||'')) body.discord_id = disc || null
    try {
      await api(`/api/games/${gameId}/members/${m.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
      setEditing(null); toast.success('Saved'); load()
    } catch(e) { toastErr(e) } finally { setSaving(false) }
  }

  const delMember = async (m) => {
    try { await api(`/api/games/${gameId}/members/${m.id}`, {method:'DELETE'}); toast.success('Member deleted'); load() } catch(e) { toastErr(e) }
  }
  const restore = async (m) => { try { await api(`/api/games/${gameId}/members/${m.id}/restore`, {method:'POST'}); toast.success('Restored'); load() } catch(e) { toastErr(e) } }

  const memberList = arr(members)
  const active = memberList.filter(m=>!m.deleted_at)
  const deleted = memberList.filter(m=>m.deleted_at)

  return (
    <div className="space-y-4">
{!archived && <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Add member</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Character name" required disabled={adding}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50" />
          <input value={discordId} onChange={e=>setDiscordId(e.target.value)} placeholder="Discord username (optional)" disabled={adding}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50" />
          <button type="button" onClick={addMember} disabled={adding || !name.trim()} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">{adding ? 'Adding…' : 'Add'}</button>
        </div>
        <div className="text-xs text-neutral-500 mt-2">Used for @mentions in Copy-to-Discord (when no role is set). Leave blank to use character name only.</div>
      </div>}

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 divide-y divide-neutral-100">
        {loading ? <div className="p-4 text-neutral-500 text-sm">Loading…</div> : null}
        {!loading && active.map(m => (
          <div key={m.id} className="p-3 sm:p-4">
            {editing === m.id ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={editName} onChange={e=>setEditName(e.target.value)} required disabled={saving} className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm disabled:bg-neutral-50" />
                <input value={editDiscord} onChange={e=>setEditDiscord(e.target.value)} placeholder="Discord username (optional)" disabled={saving} className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm disabled:bg-neutral-50" />
                <div className="flex gap-2">
                  <button type="button" onClick={()=>saveEdit(m)} disabled={saving} className="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={()=>setEditing(null)} disabled={saving} className="flex-1 sm:flex-initial px-3 py-2 border border-neutral-300 rounded-lg text-sm disabled:opacity-60">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-neutral-900">{m.name}</span>
                  {Boolean(m.discord_id) && <span className="text-neutral-500 text-sm ml-2">@{m.discord_id.replace(/^@/, '')}</span>}
                </div>
                {!archived && <div className="flex gap-4 text-xs text-neutral-500">
                  <button type="button" onClick={()=>{setEditing(m.id); setEditName(m.name); setEditDiscord(m.discord_id||'')}} className="hover:text-neutral-900 py-1">Edit</button>
                  <button type="button" onClick={()=>delMember(m)} className="hover:text-red-600 py-1">Delete</button>
                </div>}
              </div>
            )}
          </div>
        ))}
        {!loading && active.length===0 && <div className="p-4 text-neutral-500 text-sm">No members yet.</div>}
      </div>

      {deleted.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <label className="text-xs text-neutral-600 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)} />
            Show deleted ({deleted.length})
          </label>
          {Boolean(showDeleted) && (
            <ul className="mt-2 space-y-1 text-sm text-neutral-500">
              {deleted.map(m => <li key={m.id} className="flex justify-between py-1.5 border-t border-neutral-100"><span>{m.name}</span><button type="button" onClick={()=>restore(m)} className="text-xs hover:text-neutral-800">Restore</button></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}


// --- History Tab ---
function HistoryTab({ gameId, game }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedRound, setCopiedRound] = useState(null)
  useEffect(()=>{ (async()=>{
    setLoading(true)
    try { const d = await api(`/api/games/${gameId}/history`); setRows(arr(d)) } catch(e){ toastErr(e); setRows([]) } finally { setLoading(false) }
  })() }, [gameId])
  const rowList = arr(rows)

  const formatDiscordMention = (id, name) => {
    if (game?.discord_role_id) return name || null
    if (!id) return name || null
    if (/^\d{17,20}$/.test(id)) return `<@${id}>`
    return id.startsWith('@') ? id : '@' + id
  }

  const copyDiscord = (r) => {
    const dateStr = r.played_at ? new Date(r.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const lines = []
    if (game?.discord_role_id) {
      lines.push(`<@&${game.discord_role_id}>`)
    }
    const qEmoji = TAG_ICONS[r.question_tag] || ''
    const qText = r.question_text || '(no question)'
    lines.push(`🤝 Connections${dateStr ? ' — ' + dateStr : ''}`, '', `> ${qEmoji}${qText}`, '')
    arr(r.pairings).forEach(p => {
      const asker = formatDiscordMention(p.asker_discord_id, p.asker_name)
      const target = formatDiscordMention(p.target_discord_id, p.target_name)
      lines.push(`• ${asker} answers about ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n')).then(()=>toast.success('Copied')).catch(()=>toastErr(new Error('Copy failed')))
    setCopiedRound(r.round_num); setTimeout(()=>setCopiedRound(null), 1500)
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600">{loading ? 'Loading…' : `${rowList.length} played`}</div>
      {rowList.map(r => (
        <div key={r.round_num} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex justify-between items-start mb-2 gap-2">
            <div className="font-semibold text-neutral-900">{r.played_at ? new Date(r.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
            <button type="button" onClick={()=>copyDiscord(r)} className="text-xs px-2.5 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 whitespace-nowrap shrink-0">{copiedRound === r.round_num ? 'Copied!' : 'Copy'}</button>
          </div>
          <div className="flex items-start gap-2 mb-2">
            {Boolean(r.question_tag) && <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${TAG_COLORS[r.question_tag]||'bg-neutral-100'}`}>{r.question_tag}</span>}
            <span className="text-neutral-800 flex-1">{r.question_text || <em>question deleted</em>}</span>
          </div>
          {arr(r.pairings).length > 0 && (
            <ul className="text-xs text-neutral-600 space-y-0.5 mb-1 bg-neutral-50 rounded-lg px-3 py-2">
              {arr(r.pairings).map(p => <li key={p.asker_id}>{p.asker_name} → {p.target_name}</li>)}
            </ul>
          )}
          {Boolean(r.played_by_username) && <div className="text-xs text-neutral-500">by {r.played_by_username}</div>}
        </div>
      ))}
      {!loading && rowList.length===0 && <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-500 text-sm">No rounds played yet.</div>}
    </div>
  )
}

// --- Admin Tab ---
function AdminTab({ gameId, game, onGameUpdate, onGamesRefresh, onGameDeleted, currentUserDiscordId }) {
  const [invites, setInvites] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteUrl, setInviteUrl] = useState('')
  const [rename, setRename] = useState(game.name)
  const [roleId, setRoleId] = useState(game.discord_role_id || '')
  const [savingRename, setSavingRename] = useState(false)
  const [savingRole, setSavingRole] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadInvites = useCallback(async () => {
    try { const d = await api(`/api/games/${gameId}/invites`); setInvites(arr(d)) } catch(e){ toastErr(e); setInvites([]) }
  }, [gameId])
  const loadAdmins = useCallback(async () => {
    try { const d = await api(`/api/games/${gameId}/admins`); setAdmins(arr(d)) } catch(e){ toastErr(e); setAdmins([]) }
  }, [gameId])
  useEffect(()=>{ (async()=>{ setLoading(true); await Promise.all([loadInvites(), loadAdmins()]); setLoading(false) })() }, [loadInvites, loadAdmins])
  useEffect(()=>{ setRoleId(game.discord_role_id || '') }, [game.discord_role_id])

  const createInvite = async () => {
    if (busy) return; setBusy(true)
    try {
      const res = await api(`/api/games/${gameId}/invites`, {method:'POST'})
      setInviteUrl(window.location.origin + '/?invite=' + res.invite_token)
      toast.success('Invite created')
      loadInvites()
    } catch(e){ toastErr(e) } finally { setBusy(false) }
  }
  const revokeInvite = async (id) => {
    try { await api(`/api/games/${gameId}/invites/${id}`, {method:'DELETE'}); toast.success('Revoked'); loadInvites() } catch(e){ toastErr(e) }
  }
  const revokeAdmin = async (discord_id) => {
    if (!confirm('Revoke admin access?')) return
    try { await api(`/api/games/${gameId}/admins/${discord_id}`, {method:'DELETE'}); toast.success('Revoked'); loadAdmins() } catch(e){ toastErr(e) }
  }
  const doRename = async () => {
    if (!rename.trim() || rename === game.name || savingRename) return
    setSavingRename(true)
    try {
      await api(`/api/games/${gameId}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: rename.trim()})})
      onGameUpdate({name: rename.trim()}); if (onGamesRefresh) onGamesRefresh(); toast.success('Renamed')
    } catch(e){ toastErr(e) } finally { setSavingRename(false) }
  }
  const doSaveRole = async () => {
    if (savingRole) return
    setSavingRole(true)
    const v = roleId.trim()
    try {
      await api(`/api/games/${gameId}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({discord_role_id: v || null})})
      onGameUpdate({discord_role_id: v || null})
      toast.success('Role saved')
    } catch(e) { toastErr(e) } finally { setSavingRole(false) }
  }
  const doArchive = async (archived) => {
    try {
      await api(`/api/games/${gameId}/${archived ? 'archive' : 'unarchive'}`, {method:'POST'})
      onGameUpdate({archived_at: archived ? new Date().toISOString() : null})
      if (onGamesRefresh) onGamesRefresh()
      toast.success(archived ? 'Archived' : 'Unarchived')
    } catch(e){ toastErr(e) }
  }
  const doDelete = async () => {
    if (!confirm(`Delete ${game.name} permanently? This cannot be undone. All questions, members, and history will be lost.`)) return
    try {
      await api(`/api/games/${gameId}`, {method:'DELETE'})
      toast.success('Game deleted')
      if (onGamesRefresh) onGamesRefresh()
      if (onGameDeleted) onGameDeleted()
    } catch(e){ toastErr(e) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Game settings</div>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input value={rename} onChange={e=>setRename(e.target.value)} disabled={savingRename}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50" />
          <button type="button" onClick={doRename} disabled={savingRename || !rename.trim() || rename===game.name}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50 disabled:opacity-60">
            {savingRename ? 'Saving…' : 'Rename'}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input value={roleId} onChange={e=>setRoleId(e.target.value)} placeholder="Discord role ID (optional)" disabled={savingRole}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50" />
          <button type="button" onClick={doSaveRole} disabled={savingRole}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50 disabled:opacity-60">
            {savingRole ? 'Saving…' : 'Save role'}
          </button>
        </div>
        <div className="text-xs text-neutral-500 mb-3">When set, Copy-to-Discord uses plain character names and prepends a role ping. Leave blank to use individual @mentions.</div>
        <div className="flex flex-wrap gap-2">
        {!game.archived_at
          ? <button type="button" onClick={()=>doArchive(true)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50">Archive game</button>
          : <>
              <button type="button" onClick={()=>doArchive(false)} className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm hover:bg-amber-100">Unarchive game</button>
              <button type="button" onClick={doDelete} className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Delete game permanently</button>
            </>
        }
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Invite links</div>
        <button type="button" onClick={createInvite} disabled={busy}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mb-3 disabled:opacity-60">
          {busy ? 'Generating…' : 'Generate invite'}
        </button>
        {Boolean(inviteUrl) && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <div className="font-mono break-all mb-1">{inviteUrl}</div>
            <div className="flex gap-3">
              <button type="button" onClick={()=>{navigator.clipboard.writeText(inviteUrl).then(()=>toast.success('Copied')).catch(()=>toastErr(new Error('Copy failed')))}} className="underline">copy</button>
              <button type="button" onClick={()=>setInviteUrl('')} className="underline">hide</button>
              <span className="text-neutral-600 ml-auto">single-use · 1 day</span>
            </div>
          </div>
        )}
        <ul className="space-y-1 text-xs divide-y divide-neutral-100">
          {loading ? <li className="text-neutral-500 py-2">Loading…</li> : null}
          {!loading && arr(invites).map(inv => (
            <li key={inv.id} className="flex justify-between py-2">
              <span className="text-neutral-600">{inv.token_prefix}… · expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : ''}</span>
              <button type="button" onClick={()=>revokeInvite(inv.id)} className="text-red-600 hover:underline">revoke</button>
            </li>
          ))}
          {!loading && arr(invites).length===0 && <li className="text-neutral-500 py-2">No pending invites.</li>}
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Admins</div>
        <ul className="space-y-2 text-sm divide-y divide-neutral-100">
          {loading ? <li className="text-neutral-500 py-2">Loading…</li> : null}
          {!loading && arr(admins).map(a => (
            <li key={a.discord_id} className="flex justify-between py-2">
              <span>{a.global_name || a.username}</span>
              {Boolean(currentUserDiscordId && a.discord_id !== currentUserDiscordId) && (
                <button type="button" onClick={()=>revokeAdmin(a.discord_id)} className="text-xs text-red-600 hover:underline">revoke</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="text-xs text-neutral-500 px-1">
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline hover:text-neutral-700">Privacy Policy</a>
      </div>
    </div>
  )
}

export { QuestionsTab, MembersTab, RoundTab }
