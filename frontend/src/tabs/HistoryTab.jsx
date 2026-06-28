import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api, toastErr } from '../api.js'
import { TAG_COLORS, TAG_ICONS } from '../components/TagBadge.jsx'
import { formatDiscordMention } from '../utils/discord.js'
import { writeClipboard } from '../utils/clipboard.js'

const arr = (d) => Array.isArray(d) ? d : []

export function HistoryTab({ gameId, game }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedRound, setCopiedRound] = useState(null)
  useEffect(()=>{ (async()=>{
    setLoading(true)
    try { const d = await api(`/api/games/${gameId}/history`); setRows(arr(d)) } catch(e){ toastErr(e); setRows([]) } finally { setLoading(false) }
  })() }, [gameId])
  const rowList = arr(rows)

  const copyDiscord = (r) => {
    const dateStr = r.played_at ? new Date(r.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const lines = []
    if (game?.discord_role_id) {
      lines.push(`<@&${game.discord_role_id}>`)
    }
    const qEmoji = TAG_ICONS[r.question_tag] || ''
    const qText = r.question_text || '(no question)'
    lines.push(`🤝 Connections${dateStr ? ' — ' + dateStr : ''}`, '', `> ${qEmoji ? qEmoji + ' ' : ''}${qText}`, '')
    arr(r.pairings).forEach(p => {
      const asker = formatDiscordMention(p.asker_discord_id, p.asker_name, game?.discord_role_id)
      const target = formatDiscordMention(p.target_discord_id, p.target_name, game?.discord_role_id)
      lines.push(`• ${asker} answers about ${target}`)
    })
    writeClipboard(lines.join('\n')).then(()=>toast.success('Copied')).catch(()=>toastErr(new Error('Copy failed')))
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
