import { useEffect, useState } from 'react'

function csrf() {
  return document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || ''
}

async function api(path, opts={}) {
  const headers = { ...(opts.headers||{}) }
  if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf()
  const r = await fetch(path, { credentials: 'include', ...opts, headers })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text()
}

export default function App() {
  const [user, setUser] = useState(null)
  const [games, setGames] = useState([])
  const [game, setGame] = useState(null)
  const [tab, setTab] = useState('round')

  useEffect(() => {
    api('/auth/me').then(setUser).catch(()=>setUser(null))
  }, [])

  useEffect(() => {
    if (user) api('/api/games').then(setGames).catch(()=>{})
  }, [user])

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Connections Game</h1>
        <button
          onClick={async () => {
            const {auth_url} = await api('/auth/discord/start', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({})})
            window.location = auth_url
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >Sign in with Discord</button>
      </div>
    </div>
  )

  if (!game) return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between mb-4"><h1 className="text-xl font-bold">Your Games</h1><span className="text-sm text-neutral-600">{user.global_name || user.username}</span></div>
      <ul className="space-y-2">
        {games.map(g => <li key={g.game_id}><button onClick={()=>setGame(g)} className="w-full text-left px-3 py-2 border rounded hover:bg-neutral-50">{g.name}</button></li>)}
        {games.length === 0 && <li className="text-neutral-500">No games yet.</li>}
      </ul>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={()=>setGame(null)} className="text-sm text-neutral-600">← back</button>
        <h1 className="text-xl font-bold">{game.name}</h1>
      </div>
      <div className="border-b mb-4 flex gap-4 text-sm">
        {['round','questions','members'].map(t => (
          <button key={t} onClick={()=>setTab(t)} className={`pb-2 ${tab===t ? 'border-b-2 border-indigo-600 font-semibold' : 'text-neutral-600'}`}>
            {t === 'round' ? 'Current Round' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'round' && <RoundTab gameId={game.game_id} />}
      {tab === 'questions' && <QuestionsTab gameId={game.game_id} />}
      {tab === 'members' && <MembersTab gameId={game.game_id} />}
    </div>
  )
}

function RoundTab({ gameId }) {
  const [data, setData] = useState(null)
  useEffect(() => { api(`/api/games/${gameId}/round`).then(setData).catch(()=>{}) }, [gameId])
  if (!data) return <div>Loading…</div>
  const copyDiscord = () => {
    const d = new Date().toLocaleDateString()
    const lines = [`Connections — ${d}`, '', data.question?.text || '(no question)', '']
    data.pairings.forEach(p => {
      const asker = p.asker_discord_id ? `<@${p.asker_discord_id}>` : p.asker_name
      const target = p.target_discord_id ? `<@${p.target_discord_id}>` : p.target_name
      lines.push(`${asker} → ${target}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
  }
  return (
    <div>
      <div className="mb-3 flex justify-between items-center">
        <div className="text-sm text-neutral-600">Round {data.round_num}</div>
        <button onClick={copyDiscord} className="text-sm px-3 py-1 border rounded">Copy to Discord</button>
      </div>
      <div className="mb-4 p-3 bg-neutral-50 rounded">{data.question?.text || 'No question set'}</div>
      <ul className="space-y-1 text-sm">
        {data.pairings.map(p => <li key={p.asker_id}>{p.asker_name} → {p.target_name} {p.asker_discord_id && <span className="text-neutral-500">✓</span>}</li>)}
      </ul>
      <button onClick={async()=>{ await api(`/api/games/${gameId}/round/complete`, {method:'POST'}); location.reload() }} className="mt-4 px-3 py-1 bg-indigo-600 text-white rounded text-sm">Mark Complete</button>
    </div>
  )
}

function QuestionsTab({ gameId }) {
  const [qs, setQs] = useState([])
  useEffect(() => { api(`/api/games/${gameId}/questions?status=upcoming`).then(setQs).catch(()=>{}) }, [gameId])
  return (
    <div>
      <div className="text-sm text-neutral-600 mb-2">{qs.length} upcoming questions</div>
      <ul className="space-y-2 text-sm">
        {qs.map(q => <li key={q.id} className="border p-2 rounded"><span className="text-xs px-1 bg-neutral-100 rounded mr-2">{q.tag}</span>{q.text}</li>)}
      </ul>
      <p className="text-xs text-neutral-500 mt-4">Question editor (tag override, history) – wiring in progress (Steps 11-13).</p>
    </div>
  )
}

function MembersTab({ gameId }) {
  const [members, setMembers] = useState([])
  useEffect(() => { api(`/api/games/${gameId}/members`).then(setMembers).catch(()=>{}) }, [gameId])
  return (
    <div>
      <ul className="space-y-1 text-sm">
        {members.filter(m=>!m.deleted_at).map(m => <li key={m.id} className="flex justify-between border-b py-1"><span>{m.name}</span><span className="text-neutral-500">{m.discord_id ? '✓ claimed' : 'unclaimed'}</span></li>)}
      </ul>
      <p className="text-xs text-neutral-500 mt-4">Member manager (claim/unclaim, Discord ID validation, soft delete) – wiring in progress (Steps 11-13).</p>
    </div>
  )
}
