import { useEffect, useState, Component } from 'react'

function csrf() {
  return document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || ''
}

async function api(path, opts={}) {
  const headers = { ...(opts.headers||{}) }
  if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf()
  const r = await fetch(path, { credentials: 'include', ...opts, headers })
  if (!r.ok) {
    const txt = await r.text().catch(()=>'')
    throw new Error(`${r.status} ${txt}`)
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

const arr = (d) => Array.isArray(d) ? d : []

class ErrorBoundary extends Component {
  constructor(p){ super(p); this.state = { err: null } }
  static getDerivedStateFromError(err){ return { err } }
  componentDidCatch(err, info){ console.error('💥 React crash:', err, info.componentStack) }
  render(){
    if (this.state.err) {
      return <div className="p-4 bg-red-50 border border-red-300 rounded-xl text-sm">
        <div className="font-bold text-red-800 mb-2">Render crash caught</div>
        <pre className="whitespace-pre-wrap text-xs">{String(this.state.err.stack || this.state.err)}</pre>
        <button onClick={()=>this.setState({err:null})} className="mt-2 px-2 py-1 border rounded text-xs">Retry</button>
      </div>
    }
    return this.props.children
  }
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [games, setGames] = useState([])
  const [game, setGame] = useState(null)
  const [tab, setTab] = useState('round')
  const [signingIn, setSigningIn] = useState(false)

  const doLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch(e) { /* ignore */ }
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

  const loadGames = () => {
    if (user) api('/api/games').then(d => setGames(arr(d))).catch(()=>setGames([]))
  }
  useEffect(() => { loadGames() }, [user])

  // Auto-join from ?invite=TOKEN in URL
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    const inviteToken = params.get('invite')
    if (!inviteToken) return
    // Clear the URL immediately to prevent double-join on refresh
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, '', cleanUrl)
    api('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_token: inviteToken })
    }).then(res => {
      // Refresh game list, then navigate to joined game
      loadGames()
      setGame({ id: res.game_id, name: '' })
    }).catch(e => {
      alert('Invite join failed: ' + e.message)
      loadGames()
    })
  }, [user])

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
            <button
              onClick={async () => {
                setSigningIn(true)
                try {
                  const redirect_after = window.location.pathname + window.location.search
                  const r = await fetch(`/auth/discord/start?redirect_after=${encodeURIComponent(redirect_after)}`, {method:'POST', credentials:'include', headers:{'X-CSRF-Token':csrf()}})
                  const {auth_url} = await r.json()
                  window.location = auth_url
                } catch (e) {
                  setSigningIn(false)
                  alert('Sign-in failed: ' + e.message)
                }
              }}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm"
            >Sign in with Discord</button>
          </>
        )}
      </div>
    </div>
  )

  if (!game) return <GameList user={user} games={games} setGame={setGame} onRefresh={loadGames} onLogout={doLogout} />

  const tabs = [
    ['round','Round', '🎲'],
    ['questions','Questions', '❓'],
    ['members','Members', '👥'],
    ['history','History', '📜'],
    ['admin','Admin', '⚙️'],
  ]

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={()=>setGame(null)} className="text-sm text-neutral-500 hover:text-neutral-900">← games</button>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 truncate">{game.name}</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
            <span className="hidden sm:inline">{user.global_name || user.username}</span>
            <button onClick={doLogout} title="Log out" aria-label="Log out"
              className="px-1.5 py-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors text-base leading-none">
              ⍈
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-3">
        <nav className="flex gap-0.5 sm:gap-2 text-[11px] sm:text-sm overflow-x-hidden sm:overflow-visible pb-0 border-b border-neutral-200">
          {tabs.map(([t,label,icon]) => (
            <button key={t} onClick={()=>setTab(t)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 whitespace-nowrap rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab===t ? 'border-indigo-600 text-indigo-700 font-semibold bg-white' : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}>
              <span>{icon}</span><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-4 sm:py-6 pb-20 sm:pb-6">
        <ErrorBoundary>
          {tab === 'round' && <RoundTab gameId={game.id} />}
          {tab === 'questions' && <QuestionsTab gameId={game.id} />}
          {tab === 'members' && <MembersTab gameId={game.id} />}
          {tab === 'history' && <HistoryTab gameId={game.id} />}
          {tab === 'admin' && <AdminTab gameId={game.id} game={game} onGameUpdate={g => setGame({...game, ...g})} />}
        </ErrorBoundary>
      </main>
    </div>
  )
}

function GameList({ user, games, setGame, onRefresh, onLogout }) {
  const [name, setName] = useState('')
  const createGame = async () => {
    if (!name.trim()) return
    const g = await api('/api/games', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: name.trim()})})
    setName(''); onRefresh()
    setGame({id: g.id, name: g.name})
  }
  const [inviteCode, setInviteCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const joinGame = async () => {
    if (!inviteCode.trim()) return
    setJoinError('')
    try {
      const res = await api('/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_token: inviteCode.trim() })
      })
      setInviteCode('')
      onRefresh()
      setGame({ id: res.game_id, name: '' })
    } catch (e) {
      setJoinError(e.message || 'Join failed')
    }
  }
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">🤝 Connections</h1>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span>{user.global_name || user.username}</span>
            {onLogout && (
              <button onClick={onLogout} title="Log out" aria-label="Log out"
                className="px-1.5 py-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors text-base leading-none">
                ⍈
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5 mb-5">
          <div className="font-semibold mb-2">New game</div>
          <div className="flex gap-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Campaign name…" className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onKeyDown={e=>e.key==='Enter'&&createGame()} />
            <button onClick={createGame} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap">Create</button>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5 mb-5">
          <div className="font-semibold mb-2">Join with invite code</div>
          <div className="flex gap-2">
            <input value={inviteCode} onChange={e=>{setInviteCode(e.target.value); setJoinError('')}} placeholder="Paste invite code…" className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onKeyDown={e=>e.key==='Enter'&&joinGame()} />
            <button onClick={joinGame} className="px-4 py-2 bg-neutral-800 text-white rounded-lg text-sm font-medium hover:bg-neutral-900 whitespace-nowrap">Join</button>
          </div>
          {joinError && <div className="text-sm text-red-600 mt-2">{joinError}</div>}
        </div>
        <div className="space-y-2">
          {arr(games).map(g => (
            <button key={g.id} onClick={()=>setGame({id: g.id, name: g.name})}
              className="w-full text-left bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:border-indigo-300 transition-colors">
              <div className="font-medium">{g.name}</div>
            </button>
          ))}
          {arr(games).length===0 && <div className="text-neutral-500 text-sm bg-white rounded-xl shadow-sm border border-neutral-200 p-4">No games yet — create one or join with an invite code above.</div>}
        </div>
      </main>
    </div>
  )
}

// --- Round Tab ---
function RoundTab({ gameId }) {
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  const load = () => api(`/api/games/${gameId}/round`).then(setData).catch(()=>setData(null))
  useEffect(() => { load() }, [gameId])
  const complete = async () => { await api(`/api/games/${gameId}/round/complete`, {method:'POST'}); load() }

  const copyDiscord = () => {
    if (!data) return
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const lines = [`🤝 Connections — Round ${data.round_num} — ${dateStr}`, '', `> ${data.question?.text || '(no question)'}`, '']
    arr(data.pairings).forEach(p => {
      const asker = p.asker_discord_id ? `<@${p.asker_discord_id}>` : p.asker_name
      const target = p.target_discord_id ? `<@${p.target_discord_id}>` : p.target_name
      lines.push(`• ${asker} answers about ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true); setTimeout(()=>setCopied(false), 1500)
  }

  if (!data) return <div className="text-neutral-500">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900">Round {data.round_num}</h2>
          <div className="flex items-center gap-2">
            <button onClick={copyDiscord} disabled={!data.question || arr(data.pairings).length === 0} className="text-xs px-2.5 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed">{copied ? 'Copied!' : 'Copy'}</button>
            <button onClick={load} className="text-xs text-neutral-500 hover:text-neutral-700">↻ refresh</button>
          </div>
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
        {data.question && arr(data.pairings).length > 0 && (
          <button onClick={complete} className="mt-4 w-full sm:w-auto px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700">Mark round complete</button>
        )}
      </div>
    </div>
  )
}

// --- Questions Tab ---
function QuestionsTab({ gameId }) {
  const [status, setStatus] = useState('upcoming')
  const [qs, setQs] = useState([])
  const [newText, setNewText] = useState('')
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [historyQ, setHistoryQ] = useState(null)
  const [history, setHistory] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [usedCount, setUsedCount] = useState(0)

  const load = () => api(`/api/games/${gameId}/questions?status=${status}`).then(d => { const a = arr(d); setQs(a); if (status === 'upcoming') { if (a.length === 0) { api(`/api/games/${gameId}/questions?status=used`).then(u => setUsedCount(arr(u).length)).catch(()=>setUsedCount(0)) } else { setUsedCount(0) } } }).catch(e => { console.error('questions load failed', e); setQs([]) })
  useEffect(() => { load() }, [gameId, status])

  const addQuestion = async () => {
    if (!newText.trim()) return
    await api(`/api/games/${gameId}/questions`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText.trim()})})
    setNewText('')
    load()
  }

  const cycleTag = async (q) => {
    const idx = TAGS.indexOf(q.tag)
    const nextTag = TAGS[(idx + 1) % TAGS.length]
    await api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag: nextTag, tag_auto: false})})
    load()
  }

  const revertTag = async (q) => {
    await api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag_auto: true})})
    load()
  }

  const saveEdit = async (q) => {
    await api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: editText})})
    setEditing(null)
    load()
  }

  const openHistory = async (q) => {
    try {
      const h = await api(`/api/games/${gameId}/questions/${q.id}/history`)
      setHistory(arr(h)); setHistoryQ(q)
    } catch(e) { setHistory([]); setHistoryQ(q) }
  }

  const graveyard = async (q) => { await api(`/api/games/${gameId}/questions/${q.id}/graveyard`, {method:'POST'}); load() }
  const restore = async (q) => { await api(`/api/games/${gameId}/questions/${q.id}/restore`, {method:'POST'}); load() }
  const del = async (q) => { if (!confirm('Delete permanently?')) return; await api(`/api/games/${gameId}/questions/${q.id}`, {method:'DELETE'}); load() }

  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const reorderQuestions = async (newQs) => {
    const question_ids = newQs.map(q => q.id)
    await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids})})
    load()
  }

  const handleDragStart = (idx) => { setDragIdx(idx) }
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx) }
  const handleDragLeave = () => { setDragOverIdx(null) }
  const handleDrop = async (e, dropIdx) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return }
    const newQs = [...qs]
    const [item] = newQs.splice(dragIdx, 1)
    newQs.splice(dropIdx, 0, item)
    setDragIdx(null); setDragOverIdx(null)
    setQs(newQs)
    await reorderQuestions(newQs)
  }
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

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
    await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids})})
    load()
  }

  const seedQuestions = async () => {
    if (!confirm('Load the 38-question Corvessa starter pack? Duplicates will be skipped.')) return
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/seed`, {method:'POST'})
      alert(`Added ${r.inserted} questions.` + (r.inserted === 0 ? ' (all already present)' : ''))
      load()
    } catch(e) { alert('Seed failed: ' + e.message) }
    finally { setBusy(false) }
  }

  const doImport = async () => {
    const lines = importText.split('\n').map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) { alert('Paste at least one question (one per line).'); return }
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/import`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({questions: lines})})
      alert(`Imported ${r.inserted} questions` + (r.skipped ? `, ${r.skipped} skipped (duplicate / too long / empty)` : ''))
      setImportText(''); setShowImport(false); load()
    } catch(e) { alert('Import failed: ' + e.message) }
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
    } catch(e) { alert('Export failed: ' + e.message) }
  }

  const recycleQuestions = async () => {
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/recycle`, {method:'POST'})
      if (r.recycled_count === 0) { alert('No used questions to recycle.'); return }
      load()
    } catch(e) { alert('Recycle failed: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* status tabs + tools */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3 sm:p-4">
        <div className="flex items-center gap-4 border-b border-neutral-200 pb-3 mb-3">
          {['upcoming','used','graveyard'].map(s => (
            <button key={s} onClick={()=>setStatus(s)}
              className={`pb-1 -mb-3 border-b-2 text-sm capitalize transition-colors ${status===s ? 'border-indigo-600 font-semibold text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}>{s}</button>
          ))}
          <span className="ml-auto text-xs text-neutral-500">{qs.length}</span>
        </div>

        {status === 'upcoming' && (
          <>
            <div className="flex gap-2 mb-3">
              <input value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a question…"
                maxLength={500}
                className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={e=>e.key==='Enter'&&addQuestion()} />
              <button onClick={addQuestion} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap">Add</button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={seedQuestions} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📦 Load starter pack</button>
              <button onClick={()=>setShowImport(v=>!v)} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50">📥 Import</button>
              <button onClick={doExport} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50">📤 Export</button>
              {qs.length > 1 && <button onClick={shuffleQuestions} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 ml-auto">🔀 Shuffle</button>}
            </div>
            {showImport && (
              <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="text-xs font-medium text-neutral-700 mb-1.5">Paste questions, one per line</div>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  placeholder={"What scares you?\nWhat's your fondest memory?\n…"}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <div className="flex gap-2 mt-2">
                  <button onClick={doImport} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">Import</button>
                  <button onClick={()=>{setShowImport(false); setImportText('')}} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs hover:bg-white">Cancel</button>
                  <span className="text-[11px] text-neutral-500 ml-auto self-center">Tags auto-classified · duplicates skipped</span>
                </div>
              </div>
            )}
          </>
        )}
        {status !== 'upcoming' && (
          <div className="flex gap-2 text-xs">
            <button onClick={doExport} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50">📤 Export {status}</button>
          </div>
        )}
      </div>

      {/* question list */}
      <div className="space-y-1.5">
        {qs.map((q, idx) => {
          const isDragging = dragIdx === idx
          const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx
          return (
          <div key={q.id}
            draggable={status==='upcoming' && editing !== q.id}
            onDragStart={()=> status==='upcoming' && handleDragStart(idx)}
            onDragOver={(e)=> status==='upcoming' && handleDragOver(e, idx)}
            onDragLeave={()=> status==='upcoming' && handleDragLeave()}
            onDrop={(e)=> status==='upcoming' && handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            className={`bg-white rounded-lg shadow-sm border border-neutral-200 px-3 py-2.5 transition-all ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-indigo-400 ring-offset-1' : ''} ${status==='upcoming' ? 'cursor-grab active:cursor-grabbing' : ''}`}>
            {editing === q.id ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={500} className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
                <div className="flex gap-2">
                  <button onClick={()=>saveEdit(q)} className="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Save</button>
                  <button onClick={()=>setEditing(null)} className="flex-1 sm:flex-initial px-3 py-2 border border-neutral-300 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                {status==='upcoming' && (
                  <span className="text-neutral-300 hover:text-neutral-500 shrink-0 cursor-grab select-none text-[14px] leading-snug pt-0.5" title="Drag to reorder" draggable={false} onMouseDown={e=>e.stopPropagation()}>⋮⋮</span>
                )}
                <button onClick={()=>cycleTag(q)} title="Click to change tag"
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${TAG_COLORS[q.tag]||'bg-neutral-100 text-neutral-700'}`}>
                  {q.tag}
                </button>
                {!q.tag_auto && <button onClick={()=>revertTag(q)} title="Revert to auto" className="text-[10px] text-neutral-400 hover:text-neutral-600 shrink-0 pt-0.5">↺</button>}
                <span className="flex-1 text-[14px] leading-snug text-neutral-900 min-w-0">{q.text}</span>
                <div className="flex items-start gap-3 text-[13px] text-neutral-500 shrink-0 pl-2 pt-0.5">
                  <button onClick={()=>{setEditing(q.id); setEditText(q.text)}} className="hover:text-neutral-900" title="Edit">✏️</button>
                  {q.edit_count > 0 && <button onClick={()=>openHistory(q)} className="hover:text-neutral-900" title="History">🕓</button>}
                  {(status==='upcoming' || status==='used') && <button onClick={()=>graveyard(q)} className="hover:text-neutral-900" title="Graveyard">💀</button>}
                  {status==='graveyard' && <>
                    <button onClick={()=>restore(q)} className="hover:text-neutral-900" title="Restore">♻️</button>
                    <button onClick={()=>del(q)} className="hover:text-red-600" title="Delete permanently">✕</button>
                  </>}
                </div>
              </div>
            )}
          </div>
        )})}
        {qs.length===0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-neutral-700 font-medium mb-1">No {status} questions yet</div>
            {status === 'upcoming' && (
              usedCount > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-neutral-500">{usedCount} question{usedCount===1?'':'s'} in used pool</div>
                  <button onClick={recycleQuestions} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">♻️ Recycle used questions ({usedCount})</button>
                </div>
              ) : (
                <div className="text-sm text-neutral-500">Add one above, or load the 38-question starter pack.</div>
              )
            )}
          </div>
        )}
      </div>

      {historyQ && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40" onClick={()=>setHistoryQ(null)}>
          <div className="bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-lg w-full text-sm" onClick={e=>e.stopPropagation()}>
            <div className="font-semibold mb-3">Edit history</div>
            <div className="text-xs text-neutral-500 mb-2 truncate">{historyQ.text}</div>
            {arr(history).length===0 ? <div className="text-neutral-500">No edits yet.</div> : (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {arr(history).map(h => <li key={h.id} className="border-b border-neutral-100 pb-2 text-xs"><div className="text-neutral-500">{h.edited_at ? new Date(h.edited_at).toLocaleString() : ''} · {h.edited_by}</div><div className="text-neutral-700"><span className="text-neutral-400">was:</span> [{h.old_tag}] {h.old_text}</div></li>)}
              </ul>
            )}
            <button onClick={()=>setHistoryQ(null)} className="mt-3 px-3 py-2 border border-neutral-300 rounded-lg text-sm w-full sm:w-auto">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Members Tab ---
function MembersTab({ gameId }) {
  const [members, setMembers] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [name, setName] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDiscord, setEditDiscord] = useState('')

  const load = () => api(`/api/games/${gameId}/members?include_deleted=${showDeleted}`).then(d => setMembers(arr(d))).catch(()=>setMembers([]))
  useEffect(() => { load() }, [gameId, showDeleted])

  const addMember = async () => {
    if (!name.trim()) return
    const body = { name: name.trim() }
    if (discordId.trim()) body.discord_id = discordId.trim()
    try {
      await api(`/api/games/${gameId}/members`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
      setName(''); setDiscordId('')
      load()
    } catch(e) { alert('Add failed: ' + e.message) }
  }

  const saveEdit = async (m) => {
    const body = {}
    if (editName !== m.name) body.name = editName
    const disc = editDiscord.trim()
    if (disc !== (m.discord_id||'')) body.discord_id = disc || null
    try {
      await api(`/api/games/${gameId}/members/${m.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
      setEditing(null); load()
    } catch(e) { alert('Save failed: ' + e.message) }
  }

  const unclaim = async (m) => {
    if (!confirm(`Unclaim ${m.name}? They'll become an unclaimed slot.`)) return
    await api(`/api/games/${gameId}/members/${m.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({discord_id: null})})
    load()
  }
  const delMember = async (m) => { await api(`/api/games/${gameId}/members/${m.id}`, {method:'DELETE'}); load() }
  const restore = async (m) => { try { await api(`/api/games/${gameId}/members/${m.id}/restore`, {method:'POST'}); load() } catch(e) { alert('Restore failed: ' + e.message) } }

  const memberList = arr(members)
  const active = memberList.filter(m=>!m.deleted_at)
  const deleted = memberList.filter(m=>m.deleted_at)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Add member</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Character name"
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input value={discordId} onChange={e=>setDiscordId(e.target.value)} placeholder="Discord ID (optional)"
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={addMember} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Add</button>
        </div>
        <div className="text-xs text-neutral-500 mt-2">Leave Discord ID blank for an unclaimed character slot. Numeric snowflake only (17–20 digits).</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 divide-y divide-neutral-100">
        {active.map(m => (
          <div key={m.id} className="p-3 sm:p-4">
            {editing === m.id ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={editName} onChange={e=>setEditName(e.target.value)} className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
                <input value={editDiscord} onChange={e=>setEditDiscord(e.target.value)} placeholder="Discord ID or blank" className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono" />
                <div className="flex gap-2">
                  <button onClick={()=>saveEdit(m)} className="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Save</button>
                  <button onClick={()=>setEditing(null)} className="flex-1 sm:flex-initial px-3 py-2 border border-neutral-300 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-neutral-900">{m.name}</span>
                  {m.discord_id ? <span className="text-xs text-emerald-700 ml-2">✓ claimed</span> : <span className="text-xs text-neutral-500 ml-2">unclaimed</span>}
                </div>
                <div className="flex gap-4 text-xs text-neutral-500">
                  <button onClick={()=>{setEditing(m.id); setEditName(m.name); setEditDiscord(m.discord_id||'')}} className="hover:text-neutral-900 py-1">Edit</button>
                  {m.discord_id && <button onClick={()=>unclaim(m)} className="hover:text-neutral-900 py-1">Unclaim</button>}
                  <button onClick={()=>delMember(m)} className="hover:text-red-600 py-1">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {active.length===0 && <div className="p-4 text-neutral-500 text-sm">No members yet.</div>}
      </div>

      {deleted.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <label className="text-xs text-neutral-600 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)} />
            Show deleted ({deleted.length})
          </label>
          {showDeleted && (
            <ul className="mt-2 space-y-1 text-sm text-neutral-500">
              {deleted.map(m => <li key={m.id} className="flex justify-between py-1.5 border-t border-neutral-100"><span>{m.name}</span><button onClick={()=>restore(m)} className="text-xs hover:text-neutral-800">Restore</button></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// --- History Tab ---
function HistoryTab({ gameId }) {
  const [rows, setRows] = useState([])
  const [copiedRound, setCopiedRound] = useState(null)
  useEffect(()=>{ api(`/api/games/${gameId}/history`).then(d => setRows(arr(d))).catch(()=>setRows([])) }, [gameId])
  const rowList = arr(rows)

  const copyDiscord = (r) => {
    const dateStr = r.played_at ? new Date(r.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const lines = [`🤝 Connections — Round ${r.round_num}${dateStr ? ' — ' + dateStr : ''}`, '', `> ${r.question_text || '(no question)'}`, '']
    arr(r.pairings).forEach(p => {
      const asker = p.asker_discord_id ? `<@${p.asker_discord_id}>` : p.asker_name
      const target = p.target_discord_id ? `<@${p.target_discord_id}>` : p.target_name
      lines.push(`• ${asker} answers about ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedRound(r.round_num); setTimeout(()=>setCopiedRound(null), 1500)
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600">{rowList.length} rounds played</div>
      {rowList.map(r => (
        <div key={r.round_num} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex justify-between items-start mb-2 gap-2">
            <div className="font-semibold text-neutral-900">Round {r.round_num} <span className="text-neutral-500 font-normal text-sm">· {r.played_at ? new Date(r.played_at).toLocaleDateString() : ''}</span></div>
            <button onClick={()=>copyDiscord(r)} className="text-xs px-2.5 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 whitespace-nowrap shrink-0">{copiedRound === r.round_num ? 'Copied!' : 'Copy'}</button>
          </div>
          <div className="flex items-start gap-2 mb-2">
            {r.question_tag && <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${TAG_COLORS[r.question_tag]||'bg-neutral-100'}`}>{r.question_tag}</span>}
            <span className="text-neutral-800 flex-1">{r.question_text || <em>question deleted</em>}</span>
          </div>
          {arr(r.pairings).length > 0 && (
            <ul className="text-xs text-neutral-600 space-y-0.5 mb-1 bg-neutral-50 rounded-lg px-3 py-2">
              {arr(r.pairings).map(p => <li key={p.asker_id}>{p.asker_name} → {p.target_name}</li>)}
            </ul>
          )}
          {r.played_by_username && <div className="text-xs text-neutral-500">by {r.played_by_username}</div>}
        </div>
      ))}
      {rowList.length===0 && <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-500 text-sm">No rounds played yet.</div>}
    </div>
  )
}

// --- Admin Tab ---
function AdminTab({ gameId, game, onGameUpdate }) {
  const [invites, setInvites] = useState([])
  const [admins, setAdmins] = useState([])
  const [inviteUrl, setInviteUrl] = useState('')
  const [rename, setRename] = useState(game.name)

  const loadInvites = () => api(`/api/games/${gameId}/invites`).then(d => setInvites(arr(d))).catch(()=>setInvites([]))
  const loadAdmins = () => api(`/api/games/${gameId}/admins`).then(d => setAdmins(arr(d))).catch(()=>setAdmins([]))
  useEffect(()=>{ loadInvites(); loadAdmins() }, [gameId])

  const createInvite = async () => {
    const res = await api(`/api/games/${gameId}/invites`, {method:'POST'})
    setInviteUrl(window.location.origin + '/?invite=' + res.invite_token)
    loadInvites()
  }
  const revokeInvite = async (id) => { await api(`/api/games/${gameId}/invites/${id}`, {method:'DELETE'}); loadInvites() }
  const revokeAdmin = async (discord_id) => {
    if (!confirm('Revoke admin access? Their character will become unclaimed.')) return
    await api(`/api/games/${gameId}/admins/${discord_id}`, {method:'DELETE'}); loadAdmins()
  }
  const doRename = async () => {
    if (!rename.trim() || rename === game.name) return
    await api(`/api/games/${gameId}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: rename.trim()})})
    onGameUpdate({name: rename.trim()}); alert('Renamed.')
  }
  const doArchive = async (archived) => {
    await api(`/api/games/${gameId}/${archived ? 'archive' : 'unarchive'}`, {method:'POST'})
    onGameUpdate({archived_at: archived ? new Date().toISOString() : null})
    alert(archived ? 'Archived.' : 'Unarchived.')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Game settings</div>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input value={rename} onChange={e=>setRename(e.target.value)} className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={doRename} className="px-4 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50">Rename</button>
        </div>
        {!game.archived_at
          ? <button onClick={()=>doArchive(true)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50">Archive game</button>
          : <button onClick={()=>doArchive(false)} className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm hover:bg-amber-100">Unarchive game</button>
        }
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Invite links</div>
        <button onClick={createInvite} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mb-3">Generate invite</button>
        {inviteUrl && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <div className="font-mono break-all mb-1">{inviteUrl}</div>
            <div className="flex gap-3">
              <button onClick={()=>{navigator.clipboard.writeText(inviteUrl); alert('Copied')}} className="underline">copy</button>
              <button onClick={()=>setInviteUrl('')} className="underline">hide</button>
              <span className="text-neutral-600 ml-auto">single-use · 1 day</span>
            </div>
          </div>
        )}
        <ul className="space-y-1 text-xs divide-y divide-neutral-100">
          {arr(invites).map(inv => (
            <li key={inv.id} className="flex justify-between py-2">
              <span className="text-neutral-600">{inv.token_prefix}… · expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : ''}</span>
              <button onClick={()=>revokeInvite(inv.id)} className="text-red-600 hover:underline">revoke</button>
            </li>
          ))}
          {arr(invites).length===0 && <li className="text-neutral-500 py-2">No invites yet.</li>}
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-5">
        <div className="font-semibold mb-3 text-neutral-900">Admins</div>
        <ul className="space-y-2 text-sm divide-y divide-neutral-100">
          {arr(admins).map(a => (
            <li key={a.discord_id} className="flex justify-between py-2">
              <span>{a.global_name || a.username}</span>
              <button onClick={()=>revokeAdmin(a.discord_id)} className="text-xs text-red-600 hover:underline">revoke</button>
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
