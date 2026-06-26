import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api, toastErr } from '../api.js'

const arr = (d) => Array.isArray(d) ? d : []

export function AdminTab({ gameId, game, onGameUpdate, onGamesRefresh, onGameDeleted, currentUserDiscordId }) {
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
