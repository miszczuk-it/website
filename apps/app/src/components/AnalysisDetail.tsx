import { useState } from 'react'
import type { AnalysisContextEntry, AnalysisContextResponse, ArtifactResponse, ArtifactVersionResponse, ContextSection, ContextVersionSummary, SessionWorkflowStage, TaskResponse } from '../types.js'
import type { Vs1Detail } from '../lib/vs1-service.js'
import { formatUsd, REVISION_KIND_LABELS, revisionKindOf, SESSION_STATUS_LABELS, SPECIALIST_LABELS, STAGE_LABELS, STAGE_ORDER, STAGE_STATE_ICON } from '../lib/workflow-labels.js'
import { artifactContent, artifactExportName, artifactMarkdown, downloadText } from '../lib/artifact-export.js'
import { EXECUTION_POLLING_STATUSES } from '../lib/execution-flow.js'
import { ExecutionRetryStatus } from './VerticalSliceWorkspace.js'
import { SharedContextPanel } from './SharedContextPanel.js'

// BUG-2 fix (PROD UX hotfix, 2026-08-30): Kopiuj/Pobierz already existed in
// ArtifactReviewPanel.tsx, but that component is only reachable from
// AnalysisWorkspace.tsx -- which App.tsx never mounts (VerticalSliceWorkspace
// is the real, live component tree). Reuses the exact same
// lib/artifact-export.ts helpers ArtifactReviewPanel already relies on, for
// both the current result and the read-only historical preview below,
// rather than re-implementing export/copy a third time.
//
// UX follow-up (2026-08-31): rendered as a floating icon toolbar in the
// top-right corner of `.artifact-version-content` (Owner feedback: the
// original below-content button row was easy to miss; ChatGPT-style
// corner icons on the artifact itself match user expectations better).
// Must be a child of the `position: relative` content box, not a sibling
// after it -- see the `.artifact-export-toolbar` positioning in styles.css.
function ArtifactExportActions({ artifact, version }: { artifact: ArtifactResponse; version: ArtifactVersionResponse }) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(artifactContent(version))
      setCopyNotice('Skopiowano')
    } catch {
      setCopyNotice('Nie udało się skopiować wyniku.')
    }
  }
  return <div className="artifact-export-toolbar">
    <div className="artifact-export-buttons">
      <button type="button" title="Kopiuj" onClick={() => void copy()}><span aria-hidden="true">⧉</span>Kopiuj</button>
      <button type="button" title="Pobierz jako Markdown" onClick={() => downloadText(artifactMarkdown(artifact, version), artifactExportName(artifact, version, 'md'), 'text/markdown')}><span aria-hidden="true">⬇</span>Pobierz .md</button>
      <button type="button" title="Pobierz jako tekst" onClick={() => downloadText(artifactContent(version), artifactExportName(artifact, version, 'txt'), 'text/plain')}><span aria-hidden="true">⬇</span>Pobierz .txt</button>
    </div>
    {copyNotice && <p role="status" className={copyNotice === 'Skopiowano' ? 'success-message' : undefined}>{copyNotice}</p>}
  </div>
}

// §25 of the VS1 UX redesign task: the open-analysis layout is
// back-link -> name -> progress -> current specialist/next specialist ->
// current result + actions -> history. No raw sessionId/taskId/executionId/
// artifactId in the main UX (§26) -- those move into a collapsed
// "Szczegóły techniczne" section at the bottom.
type ArtifactPreview = { artifact: ArtifactResponse; versions: ArtifactVersionResponse[] }
type Props = {
  detail: Vs1Detail
  workflowResponse: import('../types.js').SessionWorkflowResponse | null
  busy: boolean
  retrying: boolean
  onBack: () => void
  onAnswer: (answer: string) => void
  onApprove: () => void
  onRequestRevision: (feedback: string) => void
  onAdvance: () => void
  onRetry: () => void
  onReturnToStage: (targetTaskId: string, feedback: string) => void
  // Owner UX Follow-up (GAP-017, Feature 4): read-only historical result
  // preview. `preview` is fetched/held by the parent (VerticalSliceWorkspace,
  // same pattern as `workflowResponse`); onPreview(artifactId) requests it.
  preview: ArtifactPreview | null
  onPreview: (artifactId: string) => void
  onClosePreview: () => void
  // ADR-009 / GAP-018 completion: Shared Analysis Context, null when the
  // Platform API isn't available (mock/demo mode -- same precedent as
  // Settings -> Specjaliści, which has no equivalent there either).
  sharedContext: AnalysisContextResponse | null
  contextVersions: ContextVersionSummary[] | null
  canMutateContext: boolean
  contextBusy: boolean
  contextError: string | null
  contextNotice: string | null
  onAddContextEntry: (section: ContextSection, content: string) => Promise<void>
  onEditContextEntry: (entry: AnalysisContextEntry, newContent: string) => Promise<void>
  onApproveContextEntry: (entryId: string) => Promise<void>
  onRejectContextEntry: (entryId: string) => Promise<void>
}

function StageRow({ stage }: { stage: SessionWorkflowStage }) {
  return <li className={`stage-row stage-row-${stage.state.toLowerCase()}`}>
    <span className="stage-icon" aria-hidden="true">{STAGE_STATE_ICON[stage.state]}</span>
    <span className="stage-name">{STAGE_LABELS[stage.taskType]}</span>
    {stage.historicalTasks.length > 0
      && <span className="stage-history-count">{stage.historicalTasks.length + 1} wersje</span>}
  </li>
}

// Owner UX Follow-up (GAP-017 §28): a historical/completed Artifact's own
// status is the readable "STATUS" line in the read-only preview -- server-
// owned, not re-derived from workflow state the preview screen deliberately
// does not carry.
const ARTIFACT_STATUS_LABELS: Record<ArtifactResponse['status'], string> = {
  DRAFT: 'Wersja robocza',
  READY_FOR_REVIEW: 'Oczekuje na decyzję',
  APPROVED: 'Zatwierdzona',
  REJECTED: 'Odrzucona',
  REVISION_REQUESTED: 'Zwrócona do poprawy',
  ARCHIVED: 'Zarchiwizowana',
}

function ArtifactPreviewPanel({ preview, onClosePreview }: { preview: ArtifactPreview; onClosePreview: () => void }) {
  const { artifact, versions } = preview
  const version = versions.find((entry) => entry.artifactVersionId === artifact.currentVersionId) ?? versions[versions.length - 1]
  return <section className="panel analysis-detail">
    <button type="button" className="back-link" onClick={onClosePreview}>← Wróć do aktualnego etapu</button>
    <h2>{artifact.title}</h2>
    <p className="preview-status"><span className="status">{ARTIFACT_STATUS_LABELS[artifact.status]}</span></p>
    <div className="artifact-version-content">
      {version && <ArtifactExportActions artifact={artifact} version={version} />}
      <pre>{version?.contentText ?? (version?.contentJson ? JSON.stringify(version.contentJson, null, 2) : 'Brak treści')}</pre>
    </div>
    <p className="notice-inline">To jest wyłącznie podgląd — bez możliwości edycji ani decyzji.</p>
  </section>
}

// Owner UX Follow-up (GAP-017 §12/§30): one compact row per Task-level
// revision (activeTask or a historicalTasks[] entry) -- cost, and if this
// Task was itself created as a revision, why.
function HistoryEntry({ task, versionLabel, onPreview }: { task: TaskResponse; versionLabel: string; onPreview: (artifactId: string) => void }) {
  const kind = revisionKindOf(task)
  return <li className="history-entry">
    <div className="history-entry-head">
      <span>{versionLabel}</span>
      <span className="history-entry-cost">{formatUsd(task.costUsd)}</span>
      {task.artifactId && <button type="button" className="history-preview-button" onClick={() => onPreview(task.artifactId!)}>Podgląd</button>}
    </div>
    {kind && <div className="history-entry-feedback">
      <span className={`revision-kind-badge revision-kind-${kind.toLowerCase()}`}>{REVISION_KIND_LABELS[kind]}</span>
      {task.revisionReason && <p>Powód: „{task.revisionReason}”</p>}
    </div>}
  </li>
}

export function AnalysisDetail({
  detail, workflowResponse, busy, retrying, onBack, onAnswer, onApprove, onRequestRevision, onAdvance, onRetry, onReturnToStage, preview, onPreview, onClosePreview,
  sharedContext, contextVersions, canMutateContext, contextBusy, contextError, contextNotice, onAddContextEntry, onEditContextEntry, onApproveContextEntry, onRejectContextEntry,
}: Props) {
  const [answer, setAnswer] = useState('Wyłącznie odczyt danych.')
  const [revisionFeedback, setRevisionFeedback] = useState('')
  const [revisionFormOpen, setRevisionFormOpen] = useState(false)
  const [returnPickerOpen, setReturnPickerOpen] = useState(false)
  const [returnTargetTaskId, setReturnTargetTaskId] = useState<string | null>(null)
  const [returnFeedback, setReturnFeedback] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (preview) return <ArtifactPreviewPanel preview={preview} onClosePreview={onClosePreview} />

  const currentVersion = detail.artifact
    ? detail.versions.find((version) => version.artifactVersionId === detail.artifact!.currentVersionId) ?? detail.versions[0]
    : null

  const currentStage = workflowResponse?.currentSpecialistTaskType
  const nextStage = workflowResponse?.nextSpecialistTaskType
  const earlierCompletedStages = (workflowResponse?.chain ?? [])
    .filter((stage) => stage.state === 'COMPLETED' && stage.activeTask)

  return <section className="panel analysis-detail">
    <button type="button" className="back-link" onClick={onBack}>← Moje analizy</button>
    <h2>{detail.session.projectName ?? 'Analiza bez nazwy'}</h2>

    {workflowResponse && <div className="workflow-progress">
      <h3>Postęp</h3>
      <ul className="stage-list">{STAGE_ORDER.map((taskType) => {
        const stage = workflowResponse.chain.find((entry) => entry.taskType === taskType)
        return stage ? <StageRow key={taskType} stage={stage} /> : null
      })}</ul>
      <div className="specialist-panel">
        {currentStage
          ? <>
            <p><strong>Aktualny specjalista:</strong> {SPECIALIST_LABELS[currentStage]}</p>
            <p><strong>Aktualny etap:</strong> {(workflowResponse.currentStageIndex + 1)} z {workflowResponse.totalStages} — {STAGE_LABELS[currentStage]}</p>
            <p><strong>Następny etap:</strong> {nextStage ? STAGE_LABELS[nextStage] : 'Zakończenie analizy'}</p>
          </>
          : <p className="success-message">Analiza zakończona.</p>}
        {workflowResponse.analysisTotalCostUsd !== null && workflowResponse.analysisTotalCostUsd !== undefined && <p className="total-cost">
          <strong>Łączny koszt analizy:</strong> {formatUsd(workflowResponse.analysisTotalCostUsd)} {workflowResponse.costCurrency ?? 'USD'}
        </p>}
      </div>
    </div>}

    {detail.execution.pendingQuestion && <div className="panel-section">
      <h3>Pytanie od specjalisty</h3>
      <p>{detail.execution.pendingQuestion.prompt}</p>
      <label>Odpowiedź<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button className="primary" type="button" disabled={busy} onClick={() => onAnswer(answer)}>{busy ? 'Przetwarzanie…' : 'Wyślij odpowiedź'}</button>
    </div>}

    <ExecutionRetryStatus execution={detail.execution} retrying={retrying} onRetry={onRetry} />

    {!detail.artifact && !detail.execution.pendingQuestion && EXECUTION_POLLING_STATUSES.has(detail.execution.status) && (
      <p className="processing-indicator" role="status" aria-live="polite">Agent pracuje… Wynik pojawi się tutaj automatycznie po zakończeniu.</p>
    )}

    {detail.artifact && <div className="panel-section">
      <h3>Aktualny wynik{currentStage ? ` — ${STAGE_LABELS[currentStage]}` : ''}</h3>
      <div className="artifact-version-content">
        {currentVersion && <ArtifactExportActions artifact={detail.artifact} version={currentVersion} />}
        <pre>{currentVersion?.contentText ?? 'Brak treści'}</pre>
      </div>

      <div className="artifact-actions">
        {detail.artifact.status === 'READY_FOR_REVIEW' && <>
          <button className="primary" type="button" disabled={busy} onClick={onApprove}>{busy ? 'Przetwarzanie…' : 'Zatwierdź'}</button>
          <button type="button" disabled={busy} onClick={() => setRevisionFormOpen((open) => !open)}>Poproś o poprawę</button>
        </>}
        {detail.artifact.status === 'APPROVED' && detail.session.status === 'ACTIVE' && nextStage
          && <button className="primary" type="button" disabled={busy} onClick={onAdvance}>{busy ? 'Przetwarzanie…' : `Przejdź do: ${SPECIALIST_LABELS[nextStage]}`}</button>}
        {earlierCompletedStages.length > 0
          && <button type="button" disabled={busy} onClick={() => setReturnPickerOpen((open) => !open)}>Wróć do wcześniejszego etapu</button>}
      </div>

      {revisionFormOpen && <div className="panel-section">
        <label>Co należy poprawić?<textarea value={revisionFeedback} onChange={(event) => setRevisionFeedback(event.target.value)} /></label>
        <button className="primary" type="button" disabled={busy || !revisionFeedback.trim()} onClick={() => { onRequestRevision(revisionFeedback); setRevisionFormOpen(false); setRevisionFeedback('') }}>
          {busy ? 'Przetwarzanie…' : 'Wyślij do poprawy'}
        </button>
      </div>}

      {returnPickerOpen && <div className="panel-section">
        <p>Do którego etapu chcesz wrócić?</p>
        <fieldset className="stage-picker">
          {earlierCompletedStages.map((stage) => <label key={stage.taskType} className="stage-picker-option">
            <input type="radio" name="return-to-stage" value={stage.activeTask!.taskId}
              checked={returnTargetTaskId === stage.activeTask!.taskId}
              onChange={() => setReturnTargetTaskId(stage.activeTask!.taskId)} />
            {STAGE_LABELS[stage.taskType]}
          </label>)}
        </fieldset>
        <label>Co wymaga zmiany?<textarea value={returnFeedback} onChange={(event) => setReturnFeedback(event.target.value)} /></label>
        <button className="primary" type="button" disabled={busy || !returnTargetTaskId || !returnFeedback.trim()}
          onClick={() => { onReturnToStage(returnTargetTaskId!, returnFeedback); setReturnPickerOpen(false); setReturnFeedback(''); setReturnTargetTaskId(null) }}>
          {busy ? 'Przetwarzanie…' : 'Utwórz nową rewizję'}
        </button>
      </div>}

      {detail.session.status === 'COMPLETED' && <p className="success-message">Analiza zakończona po zatwierdzeniu ostatniego etapu.</p>}
    </div>}

    {workflowResponse && <div className="panel-section history-section">
      <h3>Historia</h3>
      <ul className="history-list">{workflowResponse.chain.filter((stage) => stage.activeTask || stage.historicalTasks.length > 0).map((stage) => {
        const total = stage.historicalTasks.length + (stage.activeTask ? 1 : 0)
        const activeLabel = total > 1 ? `v${total} — ${stage.state === 'COMPLETED' ? 'zatwierdzona' : 'aktualna'}`
          : stage.state === 'COMPLETED' ? 'Zatwierdzona' : 'Oczekuje na decyzję'
        return <li key={stage.taskType}>
          <div className="history-stage-head">
            <strong>{STAGE_LABELS[stage.taskType]}</strong>
            {stage.stageCostUsd !== null && stage.stageCostUsd !== undefined
              && <span className="history-entry-cost">Razem etap: {formatUsd(stage.stageCostUsd)}</span>}
          </div>
          <ul className="history-versions">
            {stage.historicalTasks.map((task, index) => <HistoryEntry key={task.taskId} task={task} versionLabel={`v${index + 1} — zastąpiona`} onPreview={onPreview} />)}
            {stage.activeTask && <HistoryEntry key={stage.activeTask.taskId} task={stage.activeTask} versionLabel={activeLabel} onPreview={onPreview} />}
          </ul>
        </li>
      })}</ul>
    </div>}

    <SharedContextPanel
      context={sharedContext}
      versions={contextVersions}
      canMutate={canMutateContext}
      busy={contextBusy}
      error={contextError}
      notice={contextNotice}
      onAdd={onAddContextEntry}
      onEdit={onEditContextEntry}
      onApprove={onApproveContextEntry}
      onReject={onRejectContextEntry}
    />

    <div className="panel-section">
      <button type="button" className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>
        {detailsOpen ? 'Ukryj szczegóły techniczne' : 'Szczegóły techniczne'}
      </button>
      {detailsOpen && <dl className="result-grid technical-details">
        <dt>sessionId</dt><dd>{detail.session.sessionId}</dd>
        <dt>executionId</dt><dd>{detail.execution.executionId}</dd>
        {detail.artifact && <><dt>artifactId</dt><dd>{detail.artifact.artifactId}</dd></>}
        <dt>status Session</dt><dd>{SESSION_STATUS_LABELS[detail.session.status]} ({detail.session.status})</dd>
      </dl>}
    </div>
  </section>
}
