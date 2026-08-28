import { useState } from 'react'
import type { SessionWorkflowStage } from '../types.js'
import type { Vs1Detail } from '../lib/vs1-service.js'
import { SESSION_STATUS_LABELS, SPECIALIST_LABELS, STAGE_LABELS, STAGE_ORDER, STAGE_STATE_ICON } from '../lib/workflow-labels.js'
import { ExecutionRetryStatus } from './VerticalSliceWorkspace.js'

// §25 of the VS1 UX redesign task: the open-analysis layout is
// back-link -> name -> progress -> current specialist/next specialist ->
// current result + actions -> history. No raw sessionId/taskId/executionId/
// artifactId in the main UX (§26) -- those move into a collapsed
// "Szczegóły techniczne" section at the bottom.
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
}

function StageRow({ stage }: { stage: SessionWorkflowStage }) {
  return <li className={`stage-row stage-row-${stage.state.toLowerCase()}`}>
    <span className="stage-icon" aria-hidden="true">{STAGE_STATE_ICON[stage.state]}</span>
    <span className="stage-name">{STAGE_LABELS[stage.taskType]}</span>
    {stage.historicalTasks.length > 0
      && <span className="stage-history-count">{stage.historicalTasks.length + 1} wersje</span>}
  </li>
}

export function AnalysisDetail({ detail, workflowResponse, busy, retrying, onBack, onAnswer, onApprove, onRequestRevision, onAdvance, onRetry, onReturnToStage }: Props) {
  const [answer, setAnswer] = useState('Wyłącznie odczyt danych.')
  const [revisionFeedback, setRevisionFeedback] = useState('')
  const [revisionFormOpen, setRevisionFormOpen] = useState(false)
  const [returnPickerOpen, setReturnPickerOpen] = useState(false)
  const [returnTargetTaskId, setReturnTargetTaskId] = useState<string | null>(null)
  const [returnFeedback, setReturnFeedback] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)

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
      </div>
    </div>}

    {detail.execution.pendingQuestion && <div className="panel-section">
      <h3>Pytanie od specjalisty</h3>
      <p>{detail.execution.pendingQuestion.prompt}</p>
      <label>Odpowiedź<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button className="primary" type="button" disabled={busy} onClick={() => onAnswer(answer)}>{busy ? 'Przetwarzanie…' : 'Wyślij odpowiedź'}</button>
    </div>}

    <ExecutionRetryStatus execution={detail.execution} retrying={retrying} onRetry={onRetry} />

    {detail.artifact && <div className="panel-section">
      <h3>Aktualny wynik{currentStage ? ` — ${STAGE_LABELS[currentStage]}` : ''}</h3>
      <div className="artifact-version-content"><pre>{currentVersion?.contentText ?? 'Brak treści'}</pre></div>

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
        return <li key={stage.taskType}>
          <strong>{STAGE_LABELS[stage.taskType]}</strong>
          {total <= 1
            ? <span> — {stage.state === 'COMPLETED' ? 'Zatwierdzona' : stage.state === 'CURRENT' ? 'Oczekuje na decyzję' : 'Nie rozpoczęto'}</span>
            : <ul className="history-versions">
              {stage.historicalTasks.map((task, index) => <li key={task.taskId}>v{index + 1} — zastąpiona</li>)}
              {stage.activeTask && <li>v{total} — {stage.state === 'COMPLETED' ? 'zatwierdzona' : 'aktualna'}</li>}
            </ul>}
        </li>
      })}</ul>
    </div>}

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
