import { TAG_COLORS, TAG_ICONS } from './TagBadge.jsx'
import { TagPicker } from './TagPicker.jsx'

export function QuestionItem({ q, idx, status, editing, editText, setEditText, onSaveEdit, onCancelEdit, onSetTag, onRevertTag, onEditStart, onOpenHistory, onGraveyard, onRestore, onDelete, dragIdx, onDragStart, onDragOver, onDragEnd, onGripTouch, saving }) {
  const isDragging = dragIdx === idx
  return (
    <div
      data-q-idx={idx}
      draggable={status === 'upcoming' && editing !== q.id && !saving}
      onDragStart={status === 'upcoming' ? onDragStart(idx) : undefined}
      onDragOver={status === 'upcoming' ? onDragOver(idx) : undefined}
      onDragEnd={onDragEnd}
      className={`bg-surface rounded-lg shadow-sm border border-default px-3 py-2.5 transition-all ${isDragging ? 'opacity-40' : ''}`}>
      {editing === q.id ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={500} placeholder="Edit question…" disabled={saving}
            className="flex-1 border border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-muted" autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={()=>onSaveEdit(q)} disabled={saving}
              className="flex-1 sm:flex-initial px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onCancelEdit} disabled={saving}
              className="flex-1 sm:flex-initial px-3 py-2 border border-strong rounded-lg text-sm disabled:opacity-60">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          {status==='upcoming' ? (
            <span
              onTouchStart={onGripTouch(idx)}
              style={{ touchAction: 'none' }}
              className="text-faint hover:text-subtle shrink-0 cursor-grab active:cursor-grabbing select-none text-[14px] leading-snug pt-0.5"
              title="Drag to reorder">⋮⋮</span>
          ) : null}
          {status==='upcoming' ? (
            <TagPicker tag={q.tag} onChange={tag => onSetTag(q, tag)} disabled={saving} />
          ) : null}
          {status!=='upcoming' ? (
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] shrink-0 ${TAG_COLORS[q.tag]||'bg-surface-hover text-secondary'}`} title={q.tag}>
              {TAG_ICONS[q.tag] || '•'}
            </span>
          ) : null}
          {!q.tag_auto ? <button type="button" onClick={()=>onRevertTag(q)} disabled={saving} title="Revert to auto" className="text-[10px] text-faint hover:text-muted shrink-0 pt-0.5 disabled:opacity-50">↺</button> : null}
          <span className="flex-1 text-[14px] leading-snug text-foreground min-w-0">{q.text}</span>
          <div className="flex items-start gap-3 text-[13px] text-subtle shrink-0 pl-2 pt-0.5">
            <button type="button" onClick={()=>onEditStart(q)} disabled={saving} className="hover:text-foreground disabled:opacity-50" title="Edit">✏️</button>
            {q.edit_count > 0 ? <button type="button" onClick={()=>onOpenHistory(q)} disabled={saving} className="hover:text-foreground disabled:opacity-50" title="History">🕓</button> : null}
            {(status==='upcoming' || status==='used') ? <button type="button" onClick={()=>onGraveyard(q)} disabled={saving} className="hover:text-foreground disabled:opacity-50" title="Graveyard">💀</button> : null}
            {status==='graveyard' ? <>
              <button type="button" onClick={()=>onRestore(q)} disabled={saving} className="hover:text-foreground disabled:opacity-50" title="Restore">♻️</button>
              <button type="button" onClick={()=>onDelete(q)} disabled={saving} className="hover:text-danger disabled:opacity-50" title="Delete permanently">✕</button>
            </> : null}
          </div>
        </div>
      )}
    </div>
  )
}
