import { useState } from 'react'
import type { SessionListItem } from '../types.js'
import { SESSION_STATUS_LABELS, STAGE_LABELS } from '../lib/workflow-labels.js'
import { ConfirmDialog } from './ConfirmDialog.js'

// §3/§4 of the VS1 UX redesign task: the landing view is "Moje analizy"
// first -- an existing-analyses list plus a "+ Nowa analiza" action. The
// create form is hidden until that button is clicked, never open by
// default (the previous "Utwórz Session" panel was always expanded).
type Props = {
  sessions: SessionListItem[]
  busy: boolean
  // Owner UX Follow-up (GAP-017): the "..." delete menu only renders when
  // the backend-reported permissions actually allow it (session.archive_own
  // for OWNER, session.archive_any for ADMIN) -- OBSERVER never sees it.
  // The backend is still the authority; this only avoids offering an action
  // that would just come back 403.
  canDelete: boolean
  onOpen: (sessionId: string) => void
  onCreate: (input: { projectName: string; goal: string }) => Promise<void>
  onDelete: (session: SessionListItem) => Promise<void>
}

export function AnalysisList({ sessions, busy, canDelete, onOpen, onCreate, onDelete }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [projectName, setProjectName] = useState('Nowa analiza')
  const [goal, setGoal] = useState('Zakres integracji z systemem X')
  const [pendingDelete, setPendingDelete] = useState<SessionListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const submit = async () => {
    await onCreate({ projectName, goal })
    setFormOpen(false)
  }

  const confirmDelete = async () => {
    const session = pendingDelete
    if (!session || deleting) return
    setDeleting(true)
    try { await onDelete(session) } finally { setDeleting(false); setPendingDelete(null) }
  }

  return <>
    <section className="panel">
      <div className="panel-header-row">
        <h2>Moje analizy</h2>
        <button className="primary" type="button" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? 'Anuluj' : '+ Nowa analiza'}
        </button>
      </div>
      {sessions.length === 0
        ? <p>Brak analiz. Utwórz pierwszą, aby rozpocząć.</p>
        : <ul className="analysis-list">
          {sessions.map((session) => <li key={session.sessionId} className="analysis-row">
            <button type="button" className="analysis-open" disabled={busy} onClick={() => onOpen(session.sessionId)}>
              <span className="analysis-name">{session.projectName ?? 'Analiza bez nazwy'}</span>
              <span className="analysis-stage">
                {session.currentTaskType ? STAGE_LABELS[session.currentTaskType] : 'Nie rozpoczęto'}
              </span>
              <span className={`status status-${session.status.toLowerCase()}`}>{SESSION_STATUS_LABELS[session.status]}</span>
              <span className="analysis-meta">
                {session.updatedAt ? `Ostatnia aktywność: ${new Date(session.updatedAt).toLocaleString('pl-PL')}` : ''}
              </span>
            </button>
            {canDelete && <div className="analysis-menu">
              <details>
                <summary aria-label="Więcej akcji">⋯</summary>
                <div className="analysis-menu-content">
                  <button type="button" disabled={busy} onClick={() => setPendingDelete(session)}>Usuń analizę</button>
                </div>
              </details>
            </div>}
          </li>)}
        </ul>}
    </section>
    {formOpen && <section className="panel">
      <h2>Nowa analiza</h2>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label>Nazwa analizy<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
        <label>Cel<textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Tworzenie…' : 'Utwórz analizę'}</button>
      </form>
    </section>}
    {pendingDelete && <ConfirmDialog
      title="Usunąć analizę?"
      body={`„${pendingDelete.projectName ?? 'Analiza bez nazwy'}”\n\nTa operacja usunie analizę z listy.`}
      confirmLabel={deleting ? 'Usuwanie…' : 'Usuń analizę'}
      onConfirm={() => void confirmDelete()}
      onCancel={() => setPendingDelete(null)}
    />}
  </>
}
