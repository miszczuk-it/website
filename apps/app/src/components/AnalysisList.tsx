import { useState } from 'react'
import type { SessionListItem } from '../types.js'
import { SESSION_STATUS_LABELS, STAGE_LABELS } from '../lib/workflow-labels.js'

// §3/§4 of the VS1 UX redesign task: the landing view is "Moje analizy"
// first -- an existing-analyses list plus a "+ Nowa analiza" action. The
// create form is hidden until that button is clicked, never open by
// default (the previous "Utwórz Session" panel was always expanded).
type Props = {
  sessions: SessionListItem[]
  busy: boolean
  onOpen: (sessionId: string) => void
  onCreate: (input: { projectName: string; goal: string }) => Promise<void>
}

export function AnalysisList({ sessions, busy, onOpen, onCreate }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [projectName, setProjectName] = useState('Nowa analiza')
  const [goal, setGoal] = useState('Zakres integracji z systemem X')

  const submit = async () => {
    await onCreate({ projectName, goal })
    setFormOpen(false)
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
          {sessions.map((session) => <li key={session.sessionId}>
            <button type="button" className="analysis-row" disabled={busy} onClick={() => onOpen(session.sessionId)}>
              <span className="analysis-name">{session.projectName ?? 'Analiza bez nazwy'}</span>
              <span className="analysis-stage">
                {session.currentTaskType ? STAGE_LABELS[session.currentTaskType] : 'Nie rozpoczęto'}
              </span>
              <span className={`status status-${session.status.toLowerCase()}`}>{SESSION_STATUS_LABELS[session.status]}</span>
              <span className="analysis-meta">
                {session.updatedAt ? `Ostatnia aktywność: ${new Date(session.updatedAt).toLocaleString('pl-PL')}` : ''}
              </span>
            </button>
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
  </>
}
