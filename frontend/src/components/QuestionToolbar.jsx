export function QuestionToolbar({
  status, setStatus, loading, qsCount,
  archived,
  newText, setNewText, adding, addQuestion,
  busy, seedQuestions, showImport, setShowImport,
  importText, setImportText, doImport, doExport,
  shuffleQuestions, qsLength
}) {
  return (
    <div className="bg-surface rounded-xl shadow-sm border border-default p-3 sm:p-4">
      <div className="flex items-center gap-4 border-b border-default pb-3 mb-3">
        {['upcoming','used','graveyard'].map(s => (
          <button type="button" key={s} onClick={()=>setStatus(s)} disabled={loading}
            className={`pb-1 -mb-3 border-b-2 text-sm capitalize transition-colors ${status===s ? 'border-primary-strong font-semibold text-foreground' : 'border-transparent text-muted hover:text-foreground'} disabled:opacity-50`}>{s}</button>
        ))}
        <span className="ml-auto text-xs text-subtle">{loading ? '…' : qsCount}</span>
      </div>

      {status === 'upcoming' && !archived && (
        <>
          <div className="flex gap-2 mb-3">
            <input value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a question…"
              maxLength={500} disabled={adding}
              className="flex-1 border border-strong rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-muted"
              onKeyDown={e=>e.key==='Enter'&&addQuestion()} />
            <button type="button" onClick={addQuestion} disabled={adding || !newText.trim()}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover whitespace-nowrap disabled:opacity-60">
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={seedQuestions} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg hover:bg-surface-muted disabled:opacity-50">📦 Load starter pack</button>
            <button type="button" onClick={()=>setShowImport(v=>!v)} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg hover:bg-surface-muted disabled:opacity-50">📥 Import</button>
            <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg hover:bg-surface-muted disabled:opacity-50">📤 Export</button>
            {qsLength > 1 && <button type="button" onClick={shuffleQuestions} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg hover:bg-surface-muted ml-auto disabled:opacity-50">🔀 Shuffle</button>}
          </div>
          {Boolean(showImport) && (
            <div className="mt-3 p-3 bg-surface-muted rounded-lg border border-default">
              <div className="text-xs font-medium text-secondary mb-1.5">Paste questions, one per line</div>
              <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                placeholder={"What scares you?\nWhat's your fondest memory?\n…"} disabled={busy}
                className="w-full border border-strong rounded-lg px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-hover" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={doImport} disabled={busy} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover disabled:opacity-50">Import</button>
                <button type="button" onClick={()=>{setShowImport(false); setImportText('')}} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg text-xs hover:bg-surface disabled:opacity-50">Cancel</button>
                <span className="text-[11px] text-subtle ml-auto self-center">Tags auto-classified · duplicates skipped</span>
              </div>
            </div>
          )}
        </>
      )}
      {status !== 'upcoming' && (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={doExport} disabled={busy} className="px-3 py-1.5 border border-strong rounded-lg hover:bg-surface-muted disabled:opacity-50">📤 Export {status}</button>
        </div>
      )}
    </div>
  )
}
