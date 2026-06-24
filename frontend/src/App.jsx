import { useEffect, useState } from 'react'

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
  warm: 'bg-amber-100 text-amber-800',
  secretive: 'bg-purple-100 text-purple-800',
  reflective: 'bg-blue-100 text-blue-800',
  tension: 'bg-red-100 text-red-800',
  vulnerable: 'bg-pink-100 text-pink-800',
  loyal: 'bg-green-100 text-green-800',
}

const arr = (d) => Array.isArray(d) ? d : []

export default function App() {
  const [user, setUser] = useState(null)
  const [games, setGames] = useState([])
  const [game, setGame] = useState(null)
  const [tab, setTab] = useState('round')
  const [claimNeeded, setClaimNeeded] = useState(null)

  useEffect(() => {
    api('/auth/me').then(setUser).catch(()=>setUser(null))
  }, [])

  const loadGames = () => {
    if (user) api('/api/games').then(d => setGames(arr(d))).catch(()=>setGames([]))
  }
  useEffect(loadGames, [user])

  // check claim status when entering a game
  useEffect(() => {
    if (!game || !user) return
    api(`/api/games/${game.game_id}/members`).then(d => {
      const members = arr(d)
      const claimed = members.find(m => !m.deleted_at && m.discord_id === user.discord_id)
      if (!claimed) {
        api(`/api/games/${game.game_id}/members/unclaimed`).then(u => {
          setClaimNeeded({ unclaimed: arr(u) })
        }).catch(()=> setClaimNeeded(null))
      } else {
        setClaimNeeded(null)
      }
    }).catch(()=>{})
  }, [game, user])

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Connections Game</h1>
        <button
          onClick={async () => {
            const redirect_after = window.location.pathname + window.location.search
            const r = await fetch(`/auth/discord/start?redirect_after=${encodeURIComponent(redirect_after)}`, {method:'POST', credentials:'include', headers:{'X-CSRF-Token':csrf()}})
            const {auth_url} = await r.json()
            window.location = auth_url
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >Sign in with Discord</button>
      </div>
    </div>
  )

  if (!game) return <GameList user={user} games={games} setGame={setGame} onRefresh={loadGames} />

  if (claimNeeded) return <ClaimGate gameId={game.game_id} gameName={game.name} unclaimed={claimNeeded.unclaimed} onDone={()=>setClaimNeeded(null)} />

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={()=>setGame(null)} className="text-sm text-neutral-600 hover:text-neutral-900">← games</button>
        <h1 className="text-xl font-bold">{game.name}</h1>
        <span className="text-xs text-neutral-500 ml-auto">{user.global_name || user.username}</span>
      </div>
      <div className="border-b mb-4 flex gap-4 text-sm overflow-x-auto">
        {[
          ['round','Current Round'],
          ['questions','Questions'],
          ['members','Members'],
          ['history','History'],
          ['admin','Admin'],
        ].map(([t,label]) => (
          <button key={t} onClick={()=>setTab(t)} className={`pb-2 whitespace-nowrap ${tab===t ? 'border-b-2 border-indigo-600 font-semibold' : 'text-neutral-600 hover:text-neutral-900'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'round' && <RoundTab gameId={game.game_id} gameName={game.name} />}
      {tab === 'questions' && <QuestionsTab gameId={game.game_id} />}
      {tab === 'members' && <MembersTab gameId={game.game_id} />}
      {tab === 'history' && <HistoryTab gameId={game.game_id} />}
      {tab === 'admin' && <AdminTab gameId={game.game_id} game={game} onGameUpdate={g => setGame({...game, ...g})} />}
    </div>
  )
}

function GameList({ user, games, setGame, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  const [joining, setJoining] = useState(false)

  const createGame = async () => {
    if (!name.trim()) return
    const g = await api('/api/games', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: name.trim()})})
    setShowCreate(false); setName('')
    onRefresh()
    // find full game object
    const list = await api('/api/games').then(arr).catch(()=>[])
    const full = list.find(x => x.slug === g.slug)
    if (full) setGame(full)
  }

  const joinGame = async () => {
    if (!inviteToken.trim() || joining) return
    setJoining(true)
    try {
      const res = await api('/api/games/join', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({invite_token: inviteToken.trim()})})
      setShowJoin(false); setInviteToken('')
      onRefresh()
      // navigate to game
      const list = await api('/api/games').then(arr).catch(()=>[])
      const full = list.find(x => x.game_id === res.game_id)
      if (full) setGame(full)
    } catch(e) {
      alert('Join failed: ' + e.message)
    } finally { setJoining(false) }
  }

  const gameList = arr(games)
  const activeGames = gameList.filter(g=>!g.archived_at)
  const archivedCount = gameList.filter(g=>g.archived_at).length

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Your Games</h1>
        <span className="text-sm text-neutral-600">{user.global_name || user.username}</span>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={()=>setShowCreate(!showCreate)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">+ New game</button>
        <button onClick={()=>setShowJoin(!showJoin)} className="px-3 py-1.5 border rounded text-sm">Join with invite</button>
      </div>
      {showCreate && (
        <div className="mb-4 p-3 border rounded bg-neutral-50 flex gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Game name" className="flex-1 px-2 py-1 border rounded text-sm" onKeyDown={e=>e.key==='Enter'&&createGame()} autoFocus />
          <button onClick={createGame} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Create</button>
          <button onClick={()=>setShowCreate(false)} className="px-3 py-1 border rounded text-sm">Cancel</button>
        </div>
      )}
      {showJoin && (
        <div className="mb-4 p-3 border rounded bg-neutral-50 flex gap-2">
          <input value={inviteToken} onChange={e=>setInviteToken(e.target.value)} placeholder="Paste invite token" className="flex-1 px-2 py-1 border rounded text-sm font-mono" />
          <button onClick={joinGame} disabled={joining} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">{joining?'…':'Join'}</button>
          <button onClick={()=>setShowJoin(false)} className="px-3 py-1 border rounded text-sm">Cancel</button>
        </div>
      )}
      <ul className="space-y-2">
        {activeGames.map(g => <li key={g.game_id}><button onClick={()=>setGame(g)} className="w-full text-left px-3 py-2 border rounded hover:bg-neutral-50">{g.name} <span className="text-xs text-neutral-500 ml-2">{g.role}</span></button></li>)}
        {activeGames.length === 0 && <li className="text-neutral-500 text-sm">No games yet – create one or join with an invite.</li>}
      </ul>
      {archivedCount > 0 && <div className="mt-6 text-xs text-neutral-500">{archivedCount} archived game(s) hidden</div>}
    </div>
  )
}

function ClaimGate({ gameId, gameName, unclaimed, onDone }) {
  const [selected, setSelected] = useState('')
  const [newName, setNewName] = useState('')
  const unclaimedList = arr(unclaimed)
  const [mode, setMode] = useState(unclaimedList.length > 0 ? 'claim' : 'new')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'claim' && selected) {
        await api(`/api/games/${gameId}/members/claim`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({member_id: parseInt(selected)})})
      } else if (mode === 'new' && newName.trim()) {
        await api(`/api/games/${gameId}/members/claim`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: newName.trim()})})
      } else return
      onDone()
    } catch(e) { alert('Claim failed: ' + e.message); setBusy(false) }
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-12">
      <h1 className="text-xl font-bold mb-2">Welcome to {gameName}</h1>
      <p className="text-sm text-neutral-600 mb-4">Claim your character or add yourself as a new player.</p>
      {unclaimedList.length > 0 && (
        <div className="mb-3">
          <label className="flex items-center gap-2 mb-2"><input type="radio" checked={mode==='claim'} onChange={()=>setMode('claim')} /> Claim an existing character</label>
          {mode==='claim' && (
            <select value={selected} onChange={e=>setSelected(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">— pick —</option>
              {unclaimedList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="mb-4">
        <label className="flex items-center gap-2 mb-2"><input type="radio" checked={mode==='new'} onChange={()=>setMode('new')} /> Add yourself as new player</label>
        {mode==='new' && <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Your character / player name" className="w-full border rounded px-2 py-1.5 text-sm" />}
      </div>
      <button onClick={submit} disabled={busy || (mode==='claim' && !selected) || (mode==='new' && !newName.trim())} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">{busy?'…':'Continue'}</button>
    </div>
  )
}

function RoundTab({ gameId, gameName }) {
  const [data, setData] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => api(`/api/games/${gameId}/round`).then(d => setData(d || {})).catch(()=>setData({pairings:[]}))
  useEffect(() => { load() }, [gameId])

  if (!data) return <div>Loading…</div>
  const pairings = arr(data.pairings)

  const copyDiscord = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const lines = [
      `🤝 Connections — ${gameName} — ${dateStr}`,
      '',
      `> ${data.question?.text || '(no question)'}`,
      '',
    ]
    pairings.forEach(p => {
      const asker = p.asker_discord_id ? `<@${p.asker_discord_id}>` : p.asker_name
      const target = p.target_discord_id ? `<@${p.target_discord_id}>` : p.target_name
      lines.push(`• ${asker} answers about ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(()=>setCopied(false), 1500)
  }

  const complete = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await api(`/api/games/${gameId}/round/complete`, {method:'POST'})
      await load()
    } catch(e) {
      alert('Complete failed: ' + e.message)
    } finally { setCompleting(false) }
  }

  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })

  return (
    <div>
      <div className="mb-3 flex justify-between items-center flex-wrap gap-2">
        <div className="text-sm text-neutral-600">{dateStr}</div>
        <button onClick={copyDiscord} className="text-sm px-3 py-1 border rounded hover:bg-neutral-50">{copied ? 'Copied!' : 'Copy to Discord'}</button>
      </div>
      <div className="mb-4 p-3 bg-neutral-50 rounded text-[15px]">{data.question?.text || 'No question set – add questions in the Questions tab.'}</div>
      {pairings.length === 0 ? (
        <div className="text-sm text-neutral-500">No pairings yet – add at least 3 members.</div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {pairings.map(p => (
            <li key={p.asker_id} className="flex items-center gap-2">
              <span className="font-medium">{p.asker_name}</span>
              <span className="text-neutral-500">answers about</span>
              <span className="font-medium">{p.target_name}</span>
              {p.asker_discord_id && <span className="text-xs text-neutral-400">✓</span>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={complete} disabled={completing || pairings.length===0} className="mt-4 px-4 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
        {completing ? '…' : 'Mark Complete'}
      </button>
    </div>
  )
}

function QuestionsTab({ gameId }) {
  const [status, setStatus] = useState('upcoming')
  const [qs, setQs] = useState([])
  const [newText, setNewText] = useState('')
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [historyQ, setHistoryQ] = useState(null)
  const [history, setHistory] = useState([])

  const load = () => api(`/api/games/${gameId}/questions?status=${status}`).then(d => setQs(arr(d))).catch(e => { console.error('questions load failed', e); setQs([]) })
  useEffect(load, [gameId, status])

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
  const restore = async (q) => { await api(`/api/games/${gameId}/questions/${q.id}/restore`, {method:'POST'}); setStatus('upcoming'); load() }
  const del = async (q) => { if (!confirm('Delete permanently?')) return; await api(`/api/games/${gameId}/questions/${q.id}`, {method:'DELETE'}); load() }

  return (
    <div>
      <div className="flex gap-3 text-sm border-b mb-3">
        {['upcoming','used','graveyard'].map(s => (
          <button key={s} onClick={()=>setStatus(s)} className={`pb-1.5 capitalize ${status===s ? 'border-b-2 border-indigo-600 font-semibold' : 'text-neutral-600'}`}>{s}</button>
        ))}
        <span className="ml-auto text-neutral-500 text-xs pt-1">{qs.length} questions</span>
      </div>

      {status === 'upcoming' && (
        <div className="mb-4 flex gap-2">
          <input value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a new question… (max 500 chars)" maxLength={500} className="flex-1 border rounded px-2 py-1.5 text-sm" onKeyDown={e=>e.key==='Enter'&&addQuestion()} />
          <button onClick={addQuestion} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">Add</button>
        </div>
      )}

      <ul className="space-y-2">
        {qs.map(q => (
          <li key={q.id} className="border rounded p-3 text-sm">
            {editing === q.id ? (
              <div className="flex gap-2">
                <input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={500} className="flex-1 border rounded px-2 py-1 text-sm" />
                <button onClick={()=>saveEdit(q)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Save</button>
                <button onClick={()=>setEditing(null)} className="px-2 py-1 border rounded text-xs">Cancel</button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 mb-1">
                  <button onClick={()=>cycleTag(q)} title="Click to override tag" className={`text-[11px] px-1.5 py-0.5 rounded ${TAG_COLORS[q.tag]||'bg-neutral-100'}`}>{q.tag}</button>
                  {!q.tag_auto && <button onClick={()=>revertTag(q)} title="Revert to auto-tag" className="text-[11px] text-neutral-500 hover:text-neutral-800">↺</button>}
                  <span className="flex-1">{q.text}</span>
                </div>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <button onClick={()=>{setEditing(q.id); setEditText(q.text)}} className="hover:text-neutral-800">Edit</button>
                  <button onClick={()=>openHistory(q)} className="hover:text-neutral-800">History</button>
                  {status==='upcoming' && <button onClick={()=>graveyard(q)} className="hover:text-neutral-800">Graveyard</button>}
                  {status==='graveyard' && <><button onClick={()=>restore(q)} className="hover:text-neutral-800">Restore</button><button onClick={()=>del(q)} className="hover:text-red-600">Delete</button></>}
                </div>
              </>
            )}
          </li>
        ))}
        {qs.length===0 && <li className="text-neutral-500 text-sm">No {status} questions.</li>}
      </ul>

      {historyQ && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4" onClick={()=>setHistoryQ(null)}>
          <div className="bg-white rounded p-4 max-w-lg w-full text-sm" onClick={e=>e.stopPropagation()}>
            <div className="font-semibold mb-2">Edit history – {historyQ.text.slice(0,40)}…</div>
            {arr(history).length===0 ? <div className="text-neutral-500">No edits yet.</div> : (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {arr(history).map(h => <li key={h.id} className="border-b pb-1"><div className="text-neutral-500 text-xs">{h.edited_at ? new Date(h.edited_at).toLocaleString() : ''} – {h.edited_by}</div><div><span className="text-neutral-500">was:</span> [{h.old_tag}] {h.old_text}</div></li>)}
              </ul>
            )}
            <button onClick={()=>setHistoryQ(null)} className="mt-3 px-3 py-1 border rounded text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MembersTab({ gameId }) {
  const [members, setMembers] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [name, setName] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDiscord, setEditDiscord] = useState('')

  const load = () => api(`/api/games/${gameId}/members?include_deleted=${showDeleted}`).then(d => setMembers(arr(d))).catch(()=>setMembers([]))
  useEffect(load, [gameId, showDeleted])

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
      setEditing(null)
      load()
    } catch(e) { alert('Save failed: ' + e.message) }
  }

  const unclaim = async (m) => {
    if (!confirm(`Unclaim ${m.name}? They'll become an unclaimed slot.`)) return
    await api(`/api/games/${gameId}/members/${m.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({discord_id: null})})
    load()
  }

  const delMember = async (m) => {
    await api(`/api/games/${gameId}/members/${m.id}`, {method:'DELETE'})
    load()
  }
  const restore = async (m) => {
    try {
      await api(`/api/games/${gameId}/members/${m.id}/restore`, {method:'POST'})
      load()
    } catch(e) { alert('Restore failed: ' + e.message) }
  }

  const memberList = arr(members)
  const active = memberList.filter(m=>!m.deleted_at)
  const deleted = memberList.filter(m=>m.deleted_at)

  return (
    <div>
      <div className="mb-4 p-3 border rounded bg-neutral-50 space-y-2 text-sm">
        <div className="font-medium">Add member</div>
        <div className="flex gap-2 flex-wrap">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" className="flex-1 min-w-[140px] border rounded px-2 py-1" />
          <input value={discordId} onChange={e=>setDiscordId(e.target.value)} placeholder="Discord ID (optional – leave blank for unclaimed)" className="flex-1 min-w-[220px] border rounded px-2 py-1 font-mono text-xs" />
          <button onClick={addMember} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Add</button>
        </div>
        <div className="text-xs text-neutral-500">Discord ID = numeric snowflake only (17–20 digits). <a href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID" target="_blank" className="underline">How to find it?</a> Leave blank to create an unclaimed character slot.</div>
      </div>

      <ul className="space-y-1 text-sm">
        {active.map(m => (
          <li key={m.id} className="border-b py-2">
            {editing === m.id ? (
              <div className="flex gap-2 flex-wrap items-center">
                <input value={editName} onChange={e=>setEditName(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <input value={editDiscord} onChange={e=>setEditDiscord(e.target.value)} placeholder="Discord ID or blank" className="border rounded px-2 py-1 text-sm font-mono" />
                <button onClick={()=>saveEdit(m)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Save</button>
                <button onClick={()=>setEditing(null)} className="px-2 py-1 border rounded text-xs">Cancel</button>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2">
                <div><span className="font-medium">{m.name}</span> {m.discord_id ? <span className="text-xs text-green-700 ml-2">✓ claimed <span className="font-mono text-neutral-500">{m.discord_id.slice(0,6)}…</span></span> : <span className="text-xs text-neutral-500 ml-2">unclaimed</span>}</div>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <button onClick={()=>{setEditing(m.id); setEditName(m.name); setEditDiscord(m.discord_id||'')}} className="hover:text-neutral-800">Edit</button>
                  {m.discord_id && <button onClick={()=>unclaim(m)} className="hover:text-neutral-800">Unclaim</button>}
                  <button onClick={()=>delMember(m)} className="hover:text-red-600">Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {active.length===0 && <li className="text-neutral-500">No members yet.</li>}
      </ul>

      {deleted.length > 0 && (
        <div className="mt-4">
          <label className="text-xs text-neutral-600 flex items-center gap-2"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)} /> Show deleted ({deleted.length})</label>
          {showDeleted && (
            <ul className="mt-2 space-y-1 text-sm text-neutral-500">
              {deleted.map(m => <li key={m.id} className="flex justify-between border-b py-1"><span>{m.name} <em>deleted</em></span><button onClick={()=>restore(m)} className="text-xs hover:text-neutral-800">Restore</button></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryTab({ gameId }) {
  const [rows, setRows] = useState([])
  useEffect(()=>{ api(`/api/games/${gameId}/history`).then(d => setRows(arr(d))).catch(()=>setRows([])) }, [gameId])
  const rowList = arr(rows)
  return (
    <div>
      <div className="text-sm text-neutral-600 mb-2">{rowList.length} rounds played</div>
      <ul className="space-y-2 text-sm">
        {rowList.map(r => (
          <li key={r.round_num} className="border rounded p-2">
            <div className="font-medium">Round {r.round_num} – {r.played_at ? new Date(r.played_at).toLocaleDateString() : ''}</div>
            <div className="text-neutral-700">{r.question_text || <em>question deleted</em>}</div>
          </li>
        ))}
        {rowList.length===0 && <li className="text-neutral-500">No rounds played yet.</li>}
      </ul>
    </div>
  )
}

function AdminTab({ gameId, game, onGameUpdate }) {
  const [invites, setInvites] = useState([])
  const [admins, setAdmins] = useState([])
  const [inviteToken, setInviteToken] = useState('')
  const [rename, setRename] = useState(game.name)
  const [busy, setBusy] = useState(false)

  const loadInvites = () => api(`/api/games/${gameId}/invites`).then(d => setInvites(arr(d))).catch(()=>setInvites([]))
  const loadAdmins = () => api(`/api/games/${gameId}/admins`).then(d => setAdmins(arr(d))).catch(()=>setAdmins([]))

  useEffect(()=>{ loadInvites(); loadAdmins() }, [gameId])

  const createInvite = async () => {
    const res = await api(`/api/games/${gameId}/invites`, {method:'POST'})
    setInviteToken(res.invite_token)
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
    onGameUpdate({name: rename.trim()})
    alert('Renamed.')
  }
  const doArchive = async (archived) => {
    await api(`/api/games/${gameId}/${archived ? 'archive' : 'unarchive'}`, {method:'POST'})
    onGameUpdate({archived_at: archived ? new Date().toISOString() : null})
    alert(archived ? 'Archived.' : 'Unarchived.')
  }
  const downloadBackup = () => {
    window.open(`/api/games/${gameId}/backup`, '_blank')
  }

  const inviteList = arr(invites)
  const adminList = arr(admins)

  return (
    <div className="space-y-6 text-sm">
      <div>
        <div className="font-semibold mb-2">Game settings</div>
        <div className="flex gap-2 mb-2">
          <input value={rename} onChange={e=>setRename(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" />
          <button onClick={doRename} className="px-3 py-1 border rounded text-sm">Rename</button>
        </div>
        <div className="flex gap-2">
          {!game.archived_at ? (
            <button onClick={()=>doArchive(true)} className="px-3 py-1 border rounded text-sm">Archive game</button>
          ) : (
            <button onClick={()=>doArchive(false)} className="px-3 py-1 border rounded text-sm bg-amber-50">Unarchive game</button>
          )}
          <button onClick={downloadBackup} className="px-3 py-1 border rounded text-sm">Download Backup</button>
        </div>
      </div>

      <div>
        <div className="font-semibold mb-2">Invite links</div>
        <button onClick={createInvite} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm mb-2">Generate invite</button>
        {inviteToken && (
          <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs font-mono break-all">
            {inviteToken}
            <button onClick={()=>{navigator.clipboard.writeText(inviteToken); alert('Copied')}} className="ml-2 underline">copy</button>
            <button onClick={()=>setInviteToken('')} className="ml-2 underline">hide</button>
            <div className="text-neutral-600 font-sans mt-1">Share this token out-of-band. Single-use, expires in 7 days.</div>
          </div>
        )}
        <ul className="space-y-1 text-xs">
          {inviteList.map(inv => (
            <li key={inv.id} className="flex justify-between border-b py-1">
              <span>{inv.token_prefix}… – {inv.used_by ? `used by ${inv.used_by}` : inv.revoked_at ? 'revoked' : `expires ${inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : ''}`}</span>
              {!inv.used_by && !inv.revoked_at && <button onClick={()=>revokeInvite(inv.id)} className="text-red-600 hover:underline">revoke</button>}
            </li>
          ))}
          {inviteList.length===0 && <li className="text-neutral-500">No invites yet.</li>}
        </ul>
      </div>

      <div>
        <div className="font-semibold mb-2">Admins</div>
        <ul className="space-y-1">
          {adminList.map(a => (
            <li key={a.discord_id} className="flex justify-between border-b py-1">
              <span>{a.global_name || a.username} <span className="text-neutral-500 text-xs">({a.role})</span></span>
              {a.role !== 'owner' && <button onClick={()=>revokeAdmin(a.discord_id)} className="text-xs text-red-600 hover:underline">revoke access</button>}
            </li>
          ))}
        </ul>
      </div>

      <div className="text-xs text-neutral-500 pt-4 border-t">
        <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>
      </div>
    </div>
  )
}
