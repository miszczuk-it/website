import { useState } from 'react'
import { CONTEXT_SECTION_LABELS, CONTEXT_SECTION_ORDER } from '../lib/workflow-labels.js'
import type { AnalysisContextEntry, AnalysisContextResponse, ContextSection, ContextVersionSummary } from '../types.js'

// ADR-009 / GAP-018 completion (task §24-§28): "Kontekst analizy" gains a
// real write model in the UI -- add a finding, edit one (creates a new
// Context version, never an in-place overwrite), approve/reject a
// specialist's proposal, and a minimal version history list. Purely
// presentational (mirrors SettingsSpecialists.tsx: data-fetching and the
// actual API calls live in the parent, VerticalSliceWorkspace).
//
// Visibility is `status === 'ACTIVE'` only -- `classification` is
// provenance, never visibility (matches the backend's own isEntryVisible;
// an approved AGENT_PROPOSED entry keeps that classification forever).
function isVisible(entry: AnalysisContextEntry): boolean { return entry.status === 'ACTIVE' }

type Props = {
  context: AnalysisContextResponse | null
  versions: ContextVersionSummary[] | null
  canMutate: boolean
  busy: boolean
  error: string | null
  notice: string | null
  onAdd: (section: ContextSection, content: string) => Promise<void>
  onEdit: (entry: AnalysisContextEntry, newContent: string) => Promise<void>
  onApprove: (entryId: string) => Promise<void>
  onReject: (entryId: string) => Promise<void>
}

export function SharedContextPanel({ context, versions, canMutate, busy, error, notice, onAdd, onEdit, onApprove, onReject }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [addSection, setAddSection] = useState<ContextSection>('GOAL')
  const [addContent, setAddContent] = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!context) return null

  const visibleBySection = CONTEXT_SECTION_ORDER
    .map((section) => [section, context.entries.filter((entry) => entry.section === section && isVisible(entry))] as const)
    .filter(([, entries]) => entries.length > 0)
  const proposals = context.entries.filter((entry) => entry.classification === 'AGENT_PROPOSED' && entry.status === 'PENDING')

  const submitAdd = async () => {
    if (addContent.trim() === '') return
    await onAdd(addSection, addContent.trim())
    setAddContent('')
    setAddOpen(false)
  }

  const submitEdit = async (entry: AnalysisContextEntry) => {
    if (editContent.trim() === '' || editContent.trim() === entry.content) { setEditingEntryId(null); return }
    await onEdit(entry, editContent.trim())
    setEditingEntryId(null)
  }

  return <section className="panel" aria-labelledby="analysis-context-title">
    <div className="panel-header-row">
      <h2 id="analysis-context-title">Kontekst analizy</h2>
      <span className="version-meta">Wersja kontekstu: v{context.versionNumber}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status" className="success-message">{notice}</p>}

    {visibleBySection.map(([section, entries]) => <div key={section} className="context-section">
      <h3>{CONTEXT_SECTION_LABELS[section]}</h3>
      {entries.map((entry) => <div key={entry.entryId} className="context-entry">
        {editingEntryId === entry.entryId
          ? <div className="context-entry-edit">
            <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} />
            <div className="context-entry-actions">
              <button className="primary" type="button" disabled={busy || editContent.trim() === ''} onClick={() => void submitEdit(entry)}>{busy ? 'Zapisywanie…' : 'Zapisz'}</button>
              <button type="button" disabled={busy} onClick={() => setEditingEntryId(null)}>Anuluj</button>
            </div>
          </div>
          : <>
            <p>{entry.content}</p>
            {canMutate && <button type="button" disabled={busy} onClick={() => { setEditingEntryId(entry.entryId); setEditContent(entry.content) }}>Edytuj</button>}
          </>}
      </div>)}
    </div>)}
    {visibleBySection.length === 0 && <p>Brak jeszcze żadnych ustaleń.</p>}

    {canMutate && <div className="context-add">
      {!addOpen
        ? <button className="primary" type="button" onClick={() => setAddOpen(true)}>Dodaj ustalenie</button>
        : <div className="context-add-form">
          <label>Kategoria
            <select value={addSection} onChange={(event) => setAddSection(event.target.value as ContextSection)}>
              {CONTEXT_SECTION_ORDER.map((section) => <option key={section} value={section}>{CONTEXT_SECTION_LABELS[section]}</option>)}
            </select>
          </label>
          <label>Treść<textarea value={addContent} onChange={(event) => setAddContent(event.target.value)} /></label>
          <div className="context-entry-actions">
            <button className="primary" type="button" disabled={busy || addContent.trim() === ''} onClick={() => void submitAdd()}>{busy ? 'Dodawanie…' : 'Dodaj'}</button>
            <button type="button" disabled={busy} onClick={() => { setAddOpen(false); setAddContent('') }}>Anuluj</button>
          </div>
        </div>}
    </div>}

    {proposals.length > 0 && <div className="context-proposals">
      <h3>Propozycje specjalistów</h3>
      {proposals.map((entry) => <div key={entry.entryId} className="context-proposal">
        <p>„{entry.content}”</p>
        {canMutate && <div className="context-entry-actions">
          <button className="primary" type="button" disabled={busy} onClick={() => void onApprove(entry.entryId)}>{busy ? 'Przetwarzanie…' : 'Zatwierdź'}</button>
          <button type="button" disabled={busy} onClick={() => void onReject(entry.entryId)}>Odrzuć</button>
        </div>}
      </div>)}
    </div>}

    {versions && versions.length > 0 && <div className="context-history">
      <button type="button" className="details-toggle" onClick={() => setHistoryOpen((open) => !open)}>
        {historyOpen ? 'Ukryj wersje kontekstu' : 'Wersje kontekstu'}
      </button>
      {historyOpen && <ul className="context-version-list">
        {[...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => <li key={version.analysisContextVersionId}>
          <span>Kontekst v{version.versionNumber}</span>
          <span className={`status status-${version.current ? 'active' : 'historical'}`}>{version.current ? 'bieżąca' : 'historyczna'}</span>
          <span className="version-meta">{version.createdAt}</span>
        </li>)}
      </ul>}
    </div>}
  </section>
}
