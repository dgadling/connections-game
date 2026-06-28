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
    <div className="space-y-3 text-foreground">
      <div className="text-sm text-muted">{loading ? 'Loading…' : `${rowList.length} played`}</div>
      {rowList.map(r => (
        <div key={r.round_num} className="bg-surface rounded-xl shadow-sm border border-default p-4 text-foreground">
          <div className="flex justify-between items-start mb-2 gap-2">
            <div className="font-semibold text-foreground">{r.played_at ? new Date(r.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
            <button type="button" onClick={()=>copyDiscord(r)} className="text-xs px-2.5 py-1.5 border border-strong rounded-lg hover:bg-surface-muted whitespace-nowrap shrink-0 text-foreground">{copiedRound === r.round_num ? 'Copied!' : 'Copy'}</button>
          </div>
          <div className="flex items-start gap-2 mb-2">
            {Boolean(r.question_tag) && <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${TAG_COLORS[r.question_tag]||'bg-surface-hover text-secondary'}`}>{r.question_tag}</span>}
            <span className="text-secondary flex-1">{r.question_text || <em>question deleted</em>}</span>
          </div>
          {arr(r.pairings).length > 0 && (
            <ul className="text-xs text-muted space-y-0.5 mb-1 bg-surface-muted rounded-lg px-3 py-2">
              {arr(r.pairings).map(p => <li key={p.asker_id}>{p.asker_name} → {p.target_name}</li>)}
            </ul>
          )}
          {Boolean(r.played_by_username) && <div className="text-xs text-subtle">by {r.played_by_username}</div>}
        </div>
      ))}
      {!loading && rowList.length===0 && <div className="bg-surface rounded-xl shadow-sm border border-default p-8 text-center text-subtle text-sm">No rounds played yet.</div>}
    </div>
  )
}
