import { useEffect, useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api, toastErr } from '../api.js'
import { QuestionItem } from '../components/QuestionItem.jsx'
import { QuestionHistoryModal } from '../components/QuestionHistoryModal.jsx'
import { QuestionToolbar } from '../components/QuestionToolbar.jsx'
import { balancedShuffle } from '../utils/questionShuffle.js'

const arr = (d) => Array.isArray(d) ? d : []

export function QuestionsTab({ gameId, archived }) {
  const [status, setStatus] = useState('upcoming')
  const [qs, setQs] = useState([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [historyQ, setHistoryQ] = useState(null)
  const [history, setHistory] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [usedCount, setUsedCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/games/${gameId}/questions?status=${status}`)
      const a = arr(d); setQs(a)
      if (status === 'upcoming') {
        if (a.length === 0) {
          try {
            const u = await api(`/api/games/${gameId}/questions?status=used`)
            setUsedCount(arr(u).length)
          } catch { setUsedCount(0) }
        } else { setUsedCount(0) }
      }
    } catch (e) {
      toastErr(e); setQs([])
    } finally {
      setLoading(false)
    }
  }, [gameId, status])
  useEffect(() => { load() }, [load])

  const addQuestion = async () => {
    if (!newText.trim() || adding) return
    setAdding(true)
    try {
      await api(`/api/games/${gameId}/questions`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText.trim()})})
      setNewText('')
      toast.success('Question added')
      load()
    } catch (e) { toastErr(e) } finally { setAdding(false) }
  }

  const wrapSaving = async (id, fn) => {
    setSavingId(id)
    try { await fn(); await load() } catch (e) { toastErr(e) } finally { setSavingId(null) }
  }

  const setTag = async (q, tag) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag, tag_auto: false})}))

  const revertTag = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tag_auto: true})}))

  const saveEdit = async (q) => {
    setSavingId(q.id)
    try {
      await api(`/api/games/${gameId}/questions/${q.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: editText})})
      setEditing(null)
      toast.success('Saved')
      await load()
    } catch (e) { toastErr(e) } finally { setSavingId(null) }
  }

  const openHistory = async (q) => {
    try {
      const h = await api(`/api/games/${gameId}/questions/${q.id}/history`)
      setHistory(arr(h)); setHistoryQ(q)
    } catch(e) { toastErr(e); setHistory([]); setHistoryQ(q) }
  }

  const graveyard = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}/graveyard`, {method:'POST'}))
  const restore = async (q) => wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}/restore`, {method:'POST'}))
  const del = async (q) => { if (!confirm('Delete permanently?')) return; await wrapSaving(q.id, () => api(`/api/games/${gameId}/questions/${q.id}`, {method:'DELETE'})) }

  // drag reorder – native HTML5 + touch
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const questionListRef = useRef(null)

  const showDropLine = (pos) =>
    dragIdx !== null && dropIdx === pos && pos !== dragIdx && pos !== dragIdx + 1

  const performReorder = async (fromIdx, toIdx) => {
    const ids = qs.map(q => q.id)
    const [moved] = ids.splice(fromIdx, 1)
    const adj = toIdx > fromIdx ? toIdx - 1 : toIdx
    ids.splice(adj, 0, moved)
    try {
      await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids: ids})})
      await load()
    } catch (e) { toastErr(e) }
  }

  const onDragStart = (idx) => (e) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(idx))
  }

  const onDragOver = (idx) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    setDropIdx(e.clientY < rect.top + rect.height / 2 ? idx : idx + 1)
  }

  const finishDrag = () => {
    if (dragIdx !== null && dropIdx !== null && dropIdx !== dragIdx && dropIdx !== dragIdx + 1) {
      performReorder(dragIdx, dropIdx)
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  const onGripTouch = (idx) => (e) => {
    e.stopPropagation()
    setDragIdx(idx)
  }

  const onListTouchMove = (e) => {
    if (dragIdx === null || !questionListRef.current) return
    const y = e.touches[0].clientY
    const items = questionListRef.current.querySelectorAll("[data-q-idx]")
    let pos = 0
    items.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (y > rect.top + rect.height / 2) pos = Number(el.dataset.qIdx) + 1
    })
    setDropIdx(pos)
  }

  const onListTouchEnd = () => finishDrag()

  const shuffleQuestions = async () => {
    const shuffled = balancedShuffle(qs)
    const question_ids = shuffled.map(q => q.id)
    setBusy(true)
    try {
      await api(`/api/games/${gameId}/questions/reorder`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question_ids})})
      toast.success('Shuffled')
      await load()
    } catch (e) { toastErr(e) } finally { setBusy(false) }
  }

  const seedQuestions = async () => {
    if (!confirm('Load the 38-question Corvessa starter pack? Duplicates will be skipped.')) return
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/seed`, {method:'POST'})
      toast.success(`Added ${r.inserted} questions` + (r.inserted === 0 ? ' (all already present)' : ''))
      load()
    } catch(e) { toastErr(e) }
    finally { setBusy(false) }
  }

  const doImport = async () => {
    const lines = importText.split('\n').map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) { toast.error('Paste at least one question (one per line).'); return }
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/import`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({questions: lines})})
      toast.success(`Imported ${r.inserted} questions` + (r.skipped ? `, ${r.skipped} skipped` : ''))
      setImportText(''); setShowImport(false); load()
    } catch(e) { toastErr(e) }
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
      toast.success('Exported')
    } catch(e) { toastErr(e) }
  }

  const recycleQuestions = async () => {
    setBusy(true)
    try {
      const r = await api(`/api/games/${gameId}/questions/recycle`, {method:'POST'})
      if (r.recycled_count === 0) { toast('No used questions to recycle.'); return }
      toast.success(`Recycled ${r.recycled_count} questions`)
      load()
    } catch(e) { toastErr(e) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <QuestionToolbar
        status={status} setStatus={setStatus} loading={loading} qsCount={qs.length}
        archived={archived}
        newText={newText} setNewText={setNewText} adding={adding} addQuestion={addQuestion}
        busy={busy} seedQuestions={seedQuestions}
        showImport={showImport} setShowImport={setShowImport}
        importText={importText} setImportText={setImportText} doImport={doImport}
        doExport={doExport} shuffleQuestions={shuffleQuestions} qsLength={qs.length}
      />

      {/* question list */}
      <div
        ref={questionListRef}
        className="space-y-1.5"
        onDragOver={e => e.preventDefault()}
        onDrop={finishDrag}
        onTouchMove={onListTouchMove}
        onTouchEnd={onListTouchEnd}
      >
        {loading ? <div className="text-sm text-neutral-500 px-1">Loading…</div> : null}
        {!loading && qs.map((q, idx) => (
          <div key={q.id}>
            {showDropLine(idx) && (
              <div className="h-0.5 mx-3 rounded-full bg-indigo-600" />
            )}
            <QuestionItem
              q={q}
              idx={idx}
              status={status}
              editing={editing}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              onSetTag={setTag}
              onRevertTag={revertTag}
              onEditStart={(qq) => { setEditing(qq.id); setEditText(qq.text) }}
              onOpenHistory={openHistory}
              onGraveyard={graveyard}
              onRestore={restore}
              onDelete={del}
              dragIdx={dragIdx}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={finishDrag}
              onGripTouch={onGripTouch}
              saving={savingId === q.id}
            />
          </div>
        ))}
        {showDropLine(qs.length) && (
          <div className="h-0.5 mx-3 rounded-full bg-indigo-600" />
        )}
        {!loading && qs.length===0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-neutral-700 font-medium mb-1">No {status} questions yet</div>
            {status === 'upcoming' && !archived && (
              usedCount > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-neutral-500">{usedCount} question{usedCount===1?'':'s'} in used pool</div>
                  <button type="button" onClick={recycleQuestions} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">♻️ Recycle used questions ({usedCount})</button>
                </div>
              ) : (
                <div className="text-sm text-neutral-500">Add one above, or load the 38-question starter pack.</div>
              )
            )}
          </div>
        )}
      </div>

      {Boolean(historyQ) && (
        <QuestionHistoryModal question={historyQ} history={history} onClose={()=>setHistoryQ(null)} />
      )}
    </div>
  )
}
