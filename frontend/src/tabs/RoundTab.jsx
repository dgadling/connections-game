import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api, toastErr } from '../api.js'
import { TAG_COLORS, TAG_ICONS } from '../components/TagBadge.jsx'
import { formatDiscordMention } from '../utils/discord.js'
import { writeClipboard } from '../utils/clipboard.js'

const arr = (d) => Array.isArray(d) ? d : []

export function RoundTab({ gameId, game, archived }) {
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
    lines.push(`🤝 Connections — ${dateStr}`, '', `> ${qEmoji ? qEmoji + ' ' : ''}${qText}`, '')
    arr(data.pairings).forEach(p => {
      const asker = formatDiscordMention(p.asker_discord_id, p.asker_name, game?.discord_role_id)
      const target = formatDiscordMention(p.target_discord_id, p.target_name, game?.discord_role_id)
      lines.push(`• ${asker} answers about ${target}`)
    })
    writeClipboard(lines.join('\n')).then(()=>toast.success('Copied to clipboard')).catch(()=>toastErr(new Error('Copy failed')))
    setCopied(true); setTimeout(()=>setCopied(false), 1500)
  }

  if (loading) return <div className="text-subtle">Loading…</div>
  if (!data) return <div className="bg-surface rounded-xl shadow-sm border border-danger p-4 text-sm text-danger">Failed to load round. <button type="button" onClick={load} className="underline">Retry</button></div>

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-xl shadow-sm border border-default p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground text-sm text-subtle">{todayStr}</h2>
          <button type="button" onClick={copyDiscord} disabled={!data.question || arr(data.pairings).length === 0} className="text-xs px-2.5 py-1.5 border border-strong rounded-lg hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed">{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        {data.question ? (
          <>
            <div className="flex items-start gap-2 mb-4">
              <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${TAG_COLORS[data.question.tag]||'bg-surface-hover text-secondary'}`}>{data.question.tag}</span>
            </div>
            <div className="text-[17px] sm:text-lg text-foreground leading-relaxed mb-4">{data.question.text}</div>
          </>
        ) : (
          <div className="text-subtle mb-4">No question set — add questions in the Questions tab.</div>
        )}
        <div className="space-y-2">
          {arr(data.pairings).map(p => (
            <div key={`${p.asker_id}-${p.target_id}`} className="flex items-center gap-2 text-sm py-2 px-3 bg-surface-muted rounded-lg">
              <span className="font-medium">{p.asker_name}</span>
              <span className="text-faint">→</span>
              <span className="text-secondary">{p.target_name}</span>
            </div>
          ))}
          {arr(data.pairings).length === 0 && <div className="text-sm text-subtle">No pairings yet — add 3+ members.</div>}
        </div>
        {Boolean(data.question && arr(data.pairings).length > 0 && !archived) && (
          <button type="button" onClick={complete} disabled={completing}
            className="mt-4 w-full sm:w-auto px-4 py-2.5 bg-success text-white rounded-lg font-medium hover:bg-success-hover disabled:opacity-60">
            {completing ? 'Saving…' : 'Mark round complete'}
          </button>
        )}
      </div>
    </div>
  )
}
