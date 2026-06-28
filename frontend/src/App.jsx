import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api, csrf, toastErr } from './api.js'
import { applyTheme } from './theme.js'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { GameList } from './components/GameList.jsx'
import { UserMenu } from './components/UserMenu.jsx'
import { RoundTab } from './tabs/RoundTab.jsx'
import { QuestionsTab } from './tabs/QuestionsTab.jsx'
import { MembersTab } from './tabs/MembersTab.jsx'
import { HistoryTab } from './tabs/HistoryTab.jsx'
import { AdminTab } from './tabs/AdminTab.jsx'

const arr = (d) => Array.isArray(d) ? d : []

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

  // Apply theme from user profile (per-user theme preference)
  useEffect(() => {
    if (user?.theme) {
      applyTheme(user.theme)
    } else {
      applyTheme('default')
    }
  }, [user?.theme])

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
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="text-center">
        <div className="text-4xl mb-2 animate-pulse">🤝</div>
        <p className="text-sm text-subtle">Loading…</p>
      </div>
    </div>
  )

  if (user === null) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle px-4">
      <div className="text-center max-w-sm w-full">
        {signingIn ? (
          <>
            <div className="text-5xl mb-3 animate-pulse">🤝</div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">Signing in with Discord…</h1>
            <p className="text-muted text-sm">Redirecting you to Discord</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3">🤝</div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">Connections</h1>
            <p className="text-muted text-sm mb-6">The character bonding game for your table</p>
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
              className="w-full px-4 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover font-medium shadow-sm disabled:opacity-60"
            >{signingIn ? 'Signing in…' : 'Sign in with Discord'}</button>
          </>
        )}
      </div>
    </div>
  )

  if (!game) return <GameList user={user} setUser={setUser} games={games} gamesLoading={gamesLoading} setGame={setGame} onRefresh={loadGames} onLogout={doLogout} />

  const tabs = [
    ['ask','Ask', '💬'],
    ['questions','Questions', '❓'],
    ['members','Members', '👥'],
    ['history','History', '📜'],
    ['admin','Admin', '⚙️'],
  ]

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="bg-surface border-b border-default sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={()=>setGame(null)} className="text-sm text-subtle hover:text-foreground">← games</button>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{game.name}</h1>
          <div className="ml-auto">
            <UserMenu user={user} setUser={setUser} onLogout={doLogout} />
          </div>
        </div>
      </header>

      {Boolean(game.archived_at) && (
        <div className="bg-warning-subtle border-b border-warning text-warning text-sm px-4 py-2 text-center">
          📦 This game is archived – read-only
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-3">
        <nav className="flex gap-0.5 sm:gap-2 text-[11px] sm:text-sm overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-0 border-b border-default">
          {tabs.map(([t,label,icon]) => (
            <button type="button" key={t} onClick={()=>setTab(t)}
              className={`flex items-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 py-2 sm:py-2.5 whitespace-nowrap rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab===t ? 'border-primary-strong text-primary font-semibold bg-surface' : 'border-transparent text-muted hover:text-foreground'
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
