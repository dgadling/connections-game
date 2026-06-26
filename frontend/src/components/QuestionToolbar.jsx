export function QuestionToolbar({
  status, setStatus, loading, qsCount,
  archived,
  newText, setNewText, adding, addQuestion,
  busy, seedQuestions, showImport, setShowImport,
  importText, setImportText, doImport, doExport,
  shuffleQuestions, qsLength
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3 sm:p-4">
      <div className="flex items-center gap-4 border-b border-neutral-200 pb-3 mb-3">
        {['upcoming','used','graveyard'].map(s => (
          <button type="button" key={s} onClick={()=>setStatus(s)} disabled={loading}
            className={`pb-1 -mb-3 border-b-2 text-sm capitalize transition-colors ${status===s ? 'border-indigo-600 font-semibold text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'} disabled:opacity-50`}>{s}</button>
        ))}
        <span className="ml-auto text-xs text-neutral-500">{loading ? '…' : qsCount}</span>
      </div>

      {status === 'upcoming' && !archived && (
        <>
          <div className="flex gap-2 mb-3">
            <input value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a question…"
              maxLength={500} disabled={adding}
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-50"
              onKeyDown={e=>e.key==='Enter'&&addQuestion()} />
            <button type="button" onClick={addQuestion} disabled={adding || !newText.trim()}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap disabled:opacity-60">
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={seedQuestions} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📦 Load starter pack</button>
            <button type="button" onClick={()=>setShowImport(v=>!v)} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📥 Import</button>
            <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📤 Export</button>
            {qsLength > 1 && <button type="button" onClick={shuffleQuestions} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 ml-auto disabled:opacity-50">🔀 Shuffle</button>}
          </div>
          {Boolean(showImport) && (
            <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="text-xs font-medium text-neutral-700 mb-1.5">Paste questions, one per line</div>
              <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                placeholder={"What scares you?\nWhat's your fondest memory?\n…"} disabled={busy}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-100" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={doImport} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">Import</button>
                <button type="button" onClick={()=>{setShowImport(false); setImportText('')}} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs hover:bg-white disabled:opacity-50">Cancel</button>
                <span className="text-[11px] text-neutral-500 ml-auto self-center">Tags auto-classified · duplicates skipped</span>
              </div>
            </div>
          )}
        </>
      )}
      {status !== 'upcoming' && (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">📤 Export {status}</button>
        </div>
      )}
    </div>
  )
}
