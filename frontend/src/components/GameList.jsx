import { useState } from 'react'
import toast from 'react-hot-toast'
import { api, toastErr } from '../api.js'

const arr = (d) => Array.isArray(d) ? d : []

export function GameList({ user, games, gamesLoading, setGame, onRefresh, onLogout }) {
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
    <div className="min-h-screen bg-surface-muted">
      <header className="bg-surface border-b border-default">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">🤝 Connections</h1>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{user.global_name || user.username}</span>
            {Boolean(onLogout) && (
              <button type="button" onClick={onLogout} title="Log out" aria-label="Log out"
                className="px-1.5 py-1 rounded hover:bg-surface-hover text-faint hover:text-secondary transition-colors text-base leading-none">
                ⍈
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm text-muted">{gamesLoading ? 'Loading…' : `${arr(games).filter(g=>!g.archived_at).length} active game${arr(games).filter(g=>!g.archived_at).length===1?"":"s"}`}</div>
        </div>
        <div className="space-y-2 mb-6">
          {arr(games).filter(g=>!g.archived_at).map(g => (
            <button type="button" key={g.id} onClick={()=>openGame(g.id)} disabled={!!openingId}
              className="w-full text-left bg-surface rounded-xl shadow-sm border border-default p-4 hover:border-primary transition-colors disabled:opacity-60">
              <div className="font-medium">{g.name}{openingId===g.id ? ' …' : ''}</div>
            </button>
          ))}
          {!gamesLoading && arr(games).filter(g=>!g.archived_at).length===0 && <div className="text-subtle text-sm bg-surface rounded-xl shadow-sm border border-default p-4">No active games — create one below, or follow an invite link to join.</div>}
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-default p-4 sm:p-5 mb-5">
          <div className="font-semibold mb-2">New game</div>
          <div className="flex gap-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Campaign name…" disabled={creating}
              className="flex-1 border border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-muted"
              onKeyDown={e=>e.key==='Enter'&&createGame()} />
            <button type="button" onClick={createGame} disabled={creating || !name.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover whitespace-nowrap disabled:opacity-60">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>

        {arr(games).filter(g=>g.archived_at).length > 0 && (
          <>
            <div className="text-xs font-semibold text-subtle uppercase tracking-wider mt-6 mb-2 px-1">Archived</div>
            <div className="space-y-2">
              {arr(games).filter(g=>g.archived_at).map(g => (
                <button type="button" key={g.id} onClick={()=>openGame(g.id)} disabled={!!openingId}
                  className="w-full text-left bg-surface rounded-xl shadow-sm border border-default p-4 hover:border-strong transition-colors opacity-75 disabled:opacity-40">
                  <div className="font-medium text-secondary">{g.name}{openingId===g.id ? ' …' : ''}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
