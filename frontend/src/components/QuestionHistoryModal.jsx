const arr = (d) => Array.isArray(d) ? d : []

export function QuestionHistoryModal({ question, history, onClose }) {
  if (!question) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40" onClick={onClose}>
      <div role="dialog" aria-label="Edit history" className="bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-lg w-full text-sm" onClick={e=>e.stopPropagation()}>
        <div className="font-semibold mb-3">Edit history</div>
        <div className="text-xs text-neutral-500 mb-2 truncate">Current: [{question.tag}] {question.text}</div>
        {arr(history).length===0 ? <div className="text-neutral-500">No edits yet.</div> : (
          <ul className="space-y-2 max-h-64 overflow-auto">
            {arr(history).slice().reverse().map((h, i, rev) => {
              const newer = i === 0 ? question : { text: rev[i-1].old_text, tag: rev[i-1].old_tag }
              const changedText = h.old_text !== newer.text
              const changedTag = h.old_tag !== newer.tag
              return <li key={h.id} className="border-b border-neutral-100 pb-2 text-xs">
                <div className="text-neutral-500">{h.edited_at ? new Date(h.edited_at).toLocaleString() : ''} · {h.edited_by_name || h.edited_by}</div>
                <div className="text-neutral-700">
                  {changedText ? <span><span className="text-neutral-400">&quot;{h.old_text}&quot;</span><span className="mx-1">→</span><span>&quot;{newer.text}&quot;</span></span> : null}
                  {!changedText && changedTag ? <span><span className="text-neutral-400">tag {h.old_tag}</span><span className="mx-1">→</span><span>{newer.tag}</span></span> : null}
                  {!changedText && !changedTag ? <span className="text-neutral-400">[{h.old_tag}] {h.old_text}</span> : null}
                </div>
              </li>
            })}
          </ul>
        )}
        <button type="button" onClick={onClose} className="mt-3 px-3 py-2 border border-neutral-300 rounded-lg text-sm w-full sm:w-auto">Close</button>
      </div>
    </div>
  )
}
