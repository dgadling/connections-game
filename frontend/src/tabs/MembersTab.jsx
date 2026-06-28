import { useEffect, useState, useCallback } from 'react'
import { api, toastErr } from '../api.js'
import toast from 'react-hot-toast'

const arr = (d) => Array.isArray(d) ? d : []

export function MembersTab({ gameId, archived }) {
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
    <div className="space-y-4 text-foreground">
{!archived && <div className="bg-surface rounded-xl shadow-sm border border-default p-4 sm:p-5 text-foreground">
        <div className="font-semibold mb-3 text-foreground">Add member</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Character name" required disabled={adding}
            className="flex-1 border border-strong rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-muted text-foreground bg-surface" />
          <input value={discordId} onChange={e=>setDiscordId(e.target.value)} placeholder="Discord username (optional)" disabled={adding}
            className="flex-1 border border-strong rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-muted text-foreground bg-surface" />
          <button type="button" onClick={addMember} disabled={adding || !name.trim()} className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60">{adding ? 'Adding…' : 'Add'}</button>
        </div>
        <div className="text-xs text-subtle mt-2">Used for @mentions in Copy-to-Discord (when no role is set). Leave blank to use character name only.</div>
      </div>}

      <div className="bg-surface rounded-xl shadow-sm border border-default divide-y divide-default text-foreground">
        {loading ? <div className="p-4 text-subtle text-sm">Loading…</div> : null}
        {!loading && active.map(m => (
          <div key={m.id} className="p-3 sm:p-4">
            {editing === m.id ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={editName} onChange={e=>setEditName(e.target.value)} required disabled={saving} className="flex-1 border border-strong rounded-lg px-3 py-2 text-sm disabled:bg-surface-muted text-foreground bg-surface" />
                <input value={editDiscord} onChange={e=>setEditDiscord(e.target.value)} placeholder="Discord username (optional)" disabled={saving} className="flex-1 border border-strong rounded-lg px-3 py-2 text-sm disabled:bg-surface-muted text-foreground bg-surface" />
                <div className="flex gap-2">
                  <button type="button" onClick={()=>saveEdit(m)} disabled={saving} className="flex-1 sm:flex-initial px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={()=>setEditing(null)} disabled={saving} className="flex-1 sm:flex-initial px-3 py-2 border border-strong rounded-lg text-sm disabled:opacity-60 text-foreground hover:bg-surface-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-foreground">{m.name}</span>
                  {Boolean(m.discord_id) && <span className="text-subtle text-sm ml-2">@{m.discord_id.replace(/^@/, '')}</span>}
                </div>
                {!archived && <div className="flex gap-4 text-xs text-subtle">
                  <button type="button" onClick={()=>{setEditing(m.id); setEditName(m.name); setEditDiscord(m.discord_id||'')}} className="hover:text-foreground py-1 text-subtle">Edit</button>
                  <button type="button" onClick={()=>delMember(m)} className="hover:text-danger py-1 text-subtle">Delete</button>
                </div>}
              </div>
            )}
          </div>
        ))}
        {!loading && active.length===0 && <div className="p-4 text-subtle text-sm">No members yet.</div>}
      </div>

      {deleted.length > 0 && (
        <div className="bg-surface rounded-xl shadow-sm border border-default p-4 text-foreground">
          <label className="text-xs text-muted flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)} />
            Show deleted ({deleted.length})
          </label>
          {Boolean(showDeleted) && (
            <ul className="mt-2 space-y-1 text-sm text-subtle">
              {deleted.map(m => <li key={m.id} className="flex justify-between py-1.5 border-t border-faint"><span>{m.name}</span><button type="button" onClick={()=>restore(m)} className="text-xs hover:text-secondary text-subtle">Restore</button></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
