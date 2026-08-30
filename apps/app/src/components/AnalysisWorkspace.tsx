import { useEffect, useMemo, useRef, useState } from 'react'
import { createFlowState, nextIncompleteStep, runMvpFlow } from '../lib/mvp-flow.js'
import { decideArtifactAndRefresh, handleRevisionExecutionStatus } from '../lib/artifact-flow.js'
import { EXECUTION_POLLING_STATUSES, runGuarded, trackExecutionStatus, type PollController, type SingleFlightGuard } from '../lib/execution-flow.js'
import { createPlatformApiClient, type PlatformApiClient } from '../lib/platform-api.js'
import { PlatformApiError, toSafeUiError, type SafeUiError } from '../lib/safe-error.js'
import { validateAnalysisForm, type FormErrors } from '../lib/validation.js'
import { ArtifactReviewPanel } from './ArtifactReviewPanel.js'
import { downloadText, sanitizeFileName } from '../lib/artifact-export.js'
import type {
  AnalysisFormValues, ArtifactDecisionType, ArtifactResponse, ArtifactReviewDecisionResponse, ArtifactVersionResponse,
  AnalysisContextResponse, ExecutionResponse, ExecutionStatus, ExecutionStatusResponse, FlowStep, MvpFlowState,
} from '../types.js'

const EMPTY_FORM: AnalysisFormValues = { projectName: '', goal: '', taskDescription: '' }
const BUSY_STEPS: FlowStep[] = ['VALIDATING', 'CREATING_PROJECT', 'CREATING_SESSION', 'STARTING_SESSION', 'CREATING_TASK', 'MARKING_TASK_READY']

const STEP_LABELS: Record<FlowStep, string> = {
  IDLE: 'Oczekiwanie na dane', VALIDATING: 'Sprawdzanie formularza',
  CREATING_PROJECT: 'Tworzenie projektu', CREATING_SESSION: 'Tworzenie sesji',
  STARTING_SESSION: 'Uruchamianie sesji', CREATING_TASK: 'Tworzenie zadania',
  MARKING_TASK_READY: 'Oznaczanie zadania jako gotowe',
  READY_FOR_EXECUTION: 'Gotowe do uruchomienia', FAILED: 'Przepływ zatrzymany',
}

const EXECUTION_STATUS_MESSAGES: Partial<Record<ExecutionStatus, string>> = {
  WAITING_FOR_LLM_GATEWAY: 'Analiza oczekuje na wysłanie do LLM Gateway.',
  RUNNING: 'Analiza jest wykonywana.',
  LLM_RESULT_READY: 'Wynik analizy jest gotowy.',
  FAILED_RETRYABLE: 'Analiza nie powiodła się. Można ją ponowić.',
  UNKNOWN: 'Stan analizy wymaga weryfikacji.',
}

const DEFAULT_FAILED_FINAL_MESSAGE = 'Analiza zakończyła się błędem, którego nie można ponowić.'

type ExecutionStatusPanelProps = {
  executionStatus: ExecutionStatusResponse
  retrying: boolean
  onRetry: () => void
}

export function ExecutionStatusPanel({ executionStatus, retrying, onRetry }: ExecutionStatusPanelProps) {
  const s = executionStatus
  const hasCachedTokens = typeof s.cachedInputTokens === 'number'
  return (
    <div className="execution-status-panel">
      <dl className="result-grid">
        <dt>Status analizy</dt><dd>{s.status}</dd>
        <dt>Status próby</dt><dd>{s.attemptStatus ?? '—'}</dd>
        <dt>Numer próby</dt><dd>{s.attemptNumber ?? '—'}</dd>
        <dt>Model</dt><dd>{s.model ?? '—'}</dd>
        <dt>Provider</dt><dd>{s.provider ?? '—'}</dd>
        <dt>Tokeny wejściowe</dt><dd>{s.inputTokens ?? '—'}</dd>
        <dt>Tokeny wyjściowe</dt><dd>{s.outputTokens ?? '—'}</dd>
        {hasCachedTokens && <><dt>Tokeny wejściowe z cache</dt><dd>{s.cachedInputTokens}</dd></>}
        <dt>Tokeny łącznie</dt><dd>{s.totalTokens ?? '—'}</dd>
        <dt>Koszt</dt><dd>{s.actualCost ?? '—'}</dd>
        <dt>Waluta</dt><dd>{s.currency ?? '—'}</dd>
        <dt>Zaktualizowano</dt><dd>{s.updatedAt}</dd>
      </dl>
      <p role="status" className={`status status-${s.status.toLowerCase()}`}>{EXECUTION_STATUS_MESSAGES[s.status] ?? s.status}</p>
      {s.isIncomplete && <p role="alert">Odpowiedź została przerwana przed zakończeniem{ s.incompleteReason ? ` (${s.incompleteReason})` : '' }.</p>}
      {s.status === 'FAILED_FINAL' && <p role="alert">{s.safeErrorMessage ?? DEFAULT_FAILED_FINAL_MESSAGE}</p>}
      {s.retryAllowed && (
        <button className="primary" type="button" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Ponawianie…' : 'Ponów analizę'}
        </button>
      )}
    </div>
  )
}

type Props = {
  apiBaseUrl: string
  apiEnabled: boolean
  appEnvironment?: string
  clientOverride?: PlatformApiClient
  createCorrelationId?: () => string
}

export function AnalysisWorkspace({ apiBaseUrl, apiEnabled, appEnvironment = 'LOCAL', clientOverride, createCorrelationId = () => crypto.randomUUID() }: Props) {
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [flow, setFlow] = useState<MvpFlowState | null>(null)
  const [safeError, setSafeError] = useState<SafeUiError | null>(null)
  const [execution, setExecution] = useState<ExecutionResponse | null>(null)
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatusResponse | null>(null)
  const [executing, setExecuting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [artifact, setArtifact] = useState<ArtifactResponse | null>(null)
  const [artifactVersions, setArtifactVersions] = useState<ArtifactVersionResponse[]>([])
  const [artifactDecisions, setArtifactDecisions] = useState<ArtifactReviewDecisionResponse[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [creatingArtifact, setCreatingArtifact] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [revisionGenerating, setRevisionGenerating] = useState(false)
  const [revisionError, setRevisionError] = useState<string | null>(null)
  const [versionNotice, setVersionNotice] = useState<string | null>(null)
  const [artifactSafeError, setArtifactSafeError] = useState<SafeUiError | null>(null)
  const [analysisContext, setAnalysisContext] = useState<AnalysisContextResponse | null>(null)
  const submitting = useRef(false)
  const startGuard = useRef<SingleFlightGuard>({ busy: false })
  const retryGuard = useRef<SingleFlightGuard>({ busy: false })
  const createArtifactGuard = useRef<SingleFlightGuard>({ busy: false })
  const decisionGuard = useRef<SingleFlightGuard>({ busy: false })
  const executionIdempotencyKey = useRef<string | null>(null)
  const artifactIdempotencyKey = useRef<string | null>(null)
  const pollController = useRef<PollController | null>(null)
  const revisionPollController = useRef<PollController | null>(null)
  const projectNameInput = useRef<HTMLInputElement>(null)
  const goalInput = useRef<HTMLTextAreaElement>(null)
  const taskInput = useRef<HTMLTextAreaElement>(null)
  const client = useMemo(() => clientOverride ?? createPlatformApiClient(apiBaseUrl), [apiBaseUrl, clientOverride])
  const step = flow?.step ?? 'IDLE'
  const isBusy = BUSY_STEPS.includes(step)
  const hasCreatedState = Boolean(flow?.projectId)
  const failedStep = flow?.step === 'FAILED' ? nextIncompleteStep(flow) : null

  // Stop polling on unmount -- no orphaned intervals outliving the view.
  useEffect(() => () => { pollController.current?.stop(); revisionPollController.current?.stop() }, [])
  useEffect(() => {
    if (!flow?.sessionId || !apiEnabled) return
    void client.getSessionContext(flow.sessionId, flow.correlationId).then(setAnalysisContext).catch(() => setAnalysisContext(null))
  }, [apiEnabled, client, flow?.correlationId, flow?.sessionId])

  function updateField(field: keyof AnalysisFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function focusFirstError(nextErrors: FormErrors) {
    if (nextErrors.projectName) projectNameInput.current?.focus()
    else if (nextErrors.goal) goalInput.current?.focus()
    else if (nextErrors.taskDescription) taskInput.current?.focus()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !apiEnabled || flow?.step === 'READY_FOR_EXECUTION') return
    const nextErrors = validateAnalysisForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) { focusFirstError(nextErrors); return }

    submitting.current = true
    setSafeError(null)
    const initial = flow?.step === 'FAILED' ? flow : createFlowState(values, createCorrelationId())
    setFlow(initial)
    const result = await runMvpFlow(client, initial, setFlow)
    setFlow(result.state)
    if (result.error) setSafeError(toSafeUiError(result.error))
    submitting.current = false
  }

  function handleStatusUpdate(status: ExecutionStatusResponse, correlationId: string) {
    setExecutionStatus(status)
    if (!EXECUTION_POLLING_STATUSES.has(status.status)) {
      // The composed status read model never carries `revision` (it is
      // intentionally not part of that contract) -- refresh the plain
      // Execution resource once a terminal status is reached so a retry,
      // if allowed, has a current `expectedRevision` to send.
      client.getExecution(status.executionId, correlationId).then(setExecution).catch(() => {})
    }
  }

  function beginPolling(executionId: string, correlationId: string, initialStatus: ExecutionStatus) {
    pollController.current?.stop()
    pollController.current = EXECUTION_POLLING_STATUSES.has(initialStatus)
      ? trackExecutionStatus(client, { executionId, correlationId }, { onState: (status) => handleStatusUpdate(status, correlationId) })
      : null
  }

  async function execute() {
    if (executing || flow?.step !== 'READY_FOR_EXECUTION' || !flow.taskId || flow.taskRevision === null) return
    setExecuting(true); setSafeError(null)
    executionIdempotencyKey.current ??= crypto.randomUUID()
    const { taskId, taskRevision, correlationId } = flow
    try {
      const started = await runGuarded(startGuard.current, () => client.startExecution(taskId, taskRevision, executionIdempotencyKey.current!, correlationId))
      if (started) {
        setExecution(started)
        const status = await client.getExecutionStatus(started.executionId, correlationId)
        handleStatusUpdate(status, correlationId)
        beginPolling(started.executionId, correlationId, status.status)
      }
    } catch (error) {
      setSafeError(toSafeUiError(error))
    } finally {
      setExecuting(false)
    }
  }

  async function retry() {
    if (retrying || !execution || !executionStatus?.retryAllowed) return
    setRetrying(true); setSafeError(null)
    const correlationId = flow?.correlationId ?? execution.correlationId
    try {
      const idempotencyKey = crypto.randomUUID()
      const retried = await runGuarded(retryGuard.current, () => client.retryExecution(
        execution.executionId, execution.revision, 'Ponowienie analizy przez użytkownika.', idempotencyKey, correlationId,
      ))
      if (retried) {
        setExecution(retried)
        const status = await client.getExecutionStatus(retried.executionId, correlationId)
        handleStatusUpdate(status, correlationId)
        beginPolling(retried.executionId, correlationId, status.status)
      }
    } catch (error) {
      if (error instanceof PlatformApiError && error.code === 'CONFLICT') {
        setSafeError({ message: 'Stan analizy zmienił się w międzyczasie. Status został odświeżony.' })
        try {
          const [freshExecution, freshStatus] = await Promise.all([
            client.getExecution(execution.executionId, correlationId),
            client.getExecutionStatus(execution.executionId, correlationId),
          ])
          setExecution(freshExecution); setExecutionStatus(freshStatus)
        } catch { /* best-effort refresh; the panel keeps its last known state */ }
      } else {
        setSafeError(toSafeUiError(error))
      }
    } finally {
      setRetrying(false)
    }
  }

  // Keeps the reviewer's chosen preview version across background refreshes
  // triggered by unrelated actions (e.g. commenting doesn't jump the view
  // back to current); only resets when that version no longer exists or
  // nothing was selected yet.
  function reconcileSelectedVersion(versions: ArtifactVersionResponse[], currentVersionId: string | null) {
    setSelectedVersionId((current) => (current && versions.some((version) => version.artifactVersionId === current) ? current : currentVersionId))
  }

  async function refreshArtifactHistory(artifactId: string, currentVersionId: string | null, correlationId: string) {
    try {
      const [versions, decisions] = await Promise.all([
        client.listArtifactVersions(artifactId, correlationId),
        client.listArtifactReviewDecisions(artifactId, correlationId),
      ])
      setArtifactVersions(versions)
      setArtifactDecisions(decisions)
      reconcileSelectedVersion(versions, currentVersionId)
    } catch { /* best-effort refresh; the panel keeps its last known history */ }
  }

  async function createArtifactForReview() {
    if (creatingArtifact || artifact || !execution || executionStatus?.status !== 'LLM_RESULT_READY') return
    setCreatingArtifact(true); setArtifactSafeError(null); setVersionNotice(null)
    artifactIdempotencyKey.current ??= crypto.randomUUID()
    const correlationId = flow?.correlationId ?? execution.correlationId
    try {
      const created = await runGuarded(createArtifactGuard.current, () => client.createArtifactFromExecution(
        execution.executionId, 'BUSINESS_ANALYSIS_RESULT', 'Wynik analizy Business Analyst', artifactIdempotencyKey.current!, correlationId,
      ))
      if (created) {
        setArtifact(created)
        await refreshArtifactHistory(created.artifactId, created.currentVersionId, correlationId)
      }
    } catch (error) {
      setArtifactSafeError(toSafeUiError(error))
    } finally {
      setCreatingArtifact(false)
    }
  }

  // artifactVersionId comes from the panel's currently PREVIEWED version --
  // the panel only offers APPROVE/REQUEST_REVISION against the current
  // version, never a historical one (MVP-TASK-007: REJECT/COMMENT_ONLY are
  // not offered on this screen at all).
  async function decideOnArtifact(decisionType: ArtifactDecisionType, comment: string, artifactVersionId: string) {
    if (deciding || !artifact) return
    setDeciding(true); setArtifactSafeError(null); setVersionNotice(null)
    const correlationId = flow?.correlationId ?? execution?.correlationId ?? artifact.artifactId
    const idempotencyKey = crypto.randomUUID()
    try {
      const result = await runGuarded(decisionGuard.current, () => decideArtifactAndRefresh(
        client, artifact, artifactVersionId, decisionType, comment, idempotencyKey, correlationId,
      ))
      if (result?.outcome === 'DECIDED') {
        setArtifact(result.artifact); setArtifactVersions(result.versions); setArtifactDecisions(result.decisions)
        reconcileSelectedVersion(result.versions, result.artifact.currentVersionId)
        if (result.triggeredExecutionId) beginRevisionPolling(result.triggeredExecutionId, result.artifact.artifactId, correlationId)
      } else if (result?.outcome === 'ERROR') {
        setArtifactSafeError(toSafeUiError(result.error))
        if (result.refreshed) {
          setArtifact(result.refreshed.artifact); setArtifactVersions(result.refreshed.versions); setArtifactDecisions(result.refreshed.decisions)
          reconcileSelectedVersion(result.refreshed.versions, result.refreshed.artifact.currentVersionId)
        }
      }
    } finally {
      setDeciding(false)
    }
  }

  // Tracks the Execution that REQUEST_REVISION triggers server-side
  // (MVP-TASK-006): the new ArtifactVersion is produced automatically by
  // the backend's own gateway-callback handler once that Execution reaches
  // LLM_RESULT_READY, so there is nothing left for the reviewer to author
  // manually -- this only polls and then re-reads the already-committed
  // Artifact/version/decision state via handleRevisionExecutionStatus.
  function beginRevisionPolling(executionId: string, artifactId: string, correlationId: string) {
    revisionPollController.current?.stop()
    setRevisionGenerating(true); setRevisionError(null)
    revisionPollController.current = trackExecutionStatus(client, { executionId, correlationId }, {
      onState: (status) => {
        handleRevisionExecutionStatus(client, artifactId, correlationId, status).then((result) => {
          if (!result) return
          setRevisionGenerating(false)
          if (result.outcome === 'REFRESHED') {
            setArtifact(result.artifact); setArtifactVersions(result.versions); setArtifactDecisions(result.decisions)
            reconcileSelectedVersion(result.versions, result.artifact.currentVersionId)
          } else if (result.outcome === 'FAILED') {
            setRevisionError(result.message)
          } else {
            setRevisionError('Nie udało się odświeżyć danych Artifact po wygenerowaniu poprawionej wersji.')
          }
        })
      },
      onError: () => { setRevisionGenerating(false); setRevisionError('Nie udało się sprawdzić statusu generowania poprawionej wersji.') },
    })
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">AI Platform · app.miszczuk.it</p>
        {appEnvironment === 'DEV' && <p className="environment-badge" role="status">Środowisko DEV</p>}
        <h1>Przygotuj analizę projektu</h1>
        <p>Utwórz Project, Session i zadanie Business Analyst, a następnie uruchom analizę LLM.</p>
      </header>

      {!apiEnabled && <div className="notice" role="status">Formularz działa w bezpiecznym trybie podglądu. Platform API jest domyślnie wyłączone.</div>}

      <section className="panel" aria-labelledby="analysis-form-title">
        <h2 id="analysis-form-title">Dane analizy</h2>
        <form onSubmit={submit} noValidate>
          <label htmlFor="project-name">Nazwa projektu</label>
          <input id="project-name" ref={projectNameInput} maxLength={200} required disabled={hasCreatedState || isBusy} value={values.projectName} onChange={(event) => updateField('projectName', event.target.value)} aria-invalid={Boolean(errors.projectName)} aria-describedby={errors.projectName ? 'project-name-error' : undefined} />
          {errors.projectName && <span id="project-name-error" className="field-error">{errors.projectName}</span>}

          <label htmlFor="project-goal">Cel lub problem</label>
          <textarea id="project-goal" ref={goalInput} maxLength={5000} required disabled={hasCreatedState || isBusy} value={values.goal} onChange={(event) => updateField('goal', event.target.value)} aria-invalid={Boolean(errors.goal)} aria-describedby={errors.goal ? 'project-goal-error' : undefined} />
          {errors.goal && <span id="project-goal-error" className="field-error">{errors.goal}</span>}

          <label htmlFor="business-task">Zadanie dla Business Analyst</label>
          <textarea id="business-task" ref={taskInput} maxLength={10000} required disabled={hasCreatedState || isBusy} value={values.taskDescription} onChange={(event) => updateField('taskDescription', event.target.value)} aria-invalid={Boolean(errors.taskDescription)} aria-describedby={errors.taskDescription ? 'business-task-error' : undefined} />
          {errors.taskDescription && <span id="business-task-error" className="field-error">{errors.taskDescription}</span>}

          <button className="primary" type="submit" disabled={!apiEnabled || isBusy || step === 'READY_FOR_EXECUTION'}>
            {step === 'FAILED' ? 'Ponów od ostatniego bezpiecznego kroku' : 'Przygotuj zadanie'}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="execution-status-title" aria-live="polite">
        <h2 id="execution-status-title">Status przygotowania</h2>
        <output className={`status status-${step.toLowerCase()}`}>{step}</output>
        <p>{STEP_LABELS[step]}</p>
        {failedStep && <p>Niepowodzenie na kroku: <strong>{failedStep}</strong>. Zachowano wcześniej utworzone elementy.</p>}
        {safeError && <p role="alert">{safeError.message}{safeError.reference ? ` Identyfikator zgłoszenia: ${safeError.reference}` : ''}</p>}
      </section>

      <section className="panel" aria-labelledby="analysis-result-title">
        <h2 id="analysis-result-title">Wynik przygotowania</h2>
        {flow?.projectId ? <dl className="result-grid">
          <dt>Project ID</dt><dd>{flow.projectId}</dd>
          <dt>Project status</dt><dd>ACTIVE</dd>
          <dt>Session ID</dt><dd>{flow.sessionId ?? 'Jeszcze nie utworzono'}</dd>
          <dt>Session status</dt><dd>{flow.sessionId ? (flow.sessionRevision === 0 ? 'CREATED' : 'ACTIVE') : '—'}</dd>
          <dt>Task ID</dt><dd>{flow.taskId ?? 'Jeszcze nie utworzono'}</dd>
          <dt>Task status</dt><dd>{flow.taskId ? (flow.taskRevision === 0 ? 'CREATED' : 'READY') : '—'}</dd>
        </dl> : <p>Nie utworzono jeszcze elementów procesu.</p>}
        {step === 'READY_FOR_EXECUTION' && !execution && (
          <>
            <p className="success-message">Zadanie jest gotowe do uruchomienia.</p>
            <button className="primary" type="button" onClick={execute} disabled={!apiEnabled || executing}>
              {executing ? 'Uruchamianie…' : 'Uruchom analizę'}
            </button>
          </>
        )}
        {execution && (
          <>
            <dl className="result-grid">
              <dt>Execution ID</dt><dd>{execution.executionId}</dd>
            </dl>
            {executionStatus
              ? <ExecutionStatusPanel executionStatus={executionStatus} retrying={retrying} onRetry={retry} />
              : <p>Uruchamianie analizy…</p>}
          </>
        )}
      </section>

      {analysisContext && (
        <section className="panel" aria-labelledby="analysis-context-title">
          <h2 id="analysis-context-title">Kontekst analizy</h2>
          <p>Wersja kontekstu: v{analysisContext.versionNumber}</p>
          <div className="artifact-export-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(analysisContext.entries.filter((entry) => entry.status === 'ACTIVE').map((entry) => `## ${entry.section}\n${entry.content}`).join('\n\n'))}>Kopiuj kontekst</button>
            <button type="button" onClick={() => downloadText(`# Kontekst analizy — ${values.projectName}\n\nWersja kontekstu: v${analysisContext.versionNumber}\n\n${analysisContext.entries.filter((entry) => entry.status === 'ACTIVE').map((entry) => `## ${entry.section}\n${entry.content}`).join('\n\n')}`, `${sanitizeFileName(values.projectName)}_kontekst.md`, 'text/markdown')}>Pobierz kontekst</button>
            {flow?.sessionId && <a className="button" href={`${apiBaseUrl.replace(/\/$/, '')}/sessions/${flow.sessionId}/export`}>Pobierz wyniki analizy</a>}
          </div>
          {analysisContext.entries.filter((entry) => entry.status === 'ACTIVE').map((entry, index) => <div key={`${entry.section}-${index}`}><h3>{entry.section}</h3><p>{entry.content}</p></div>)}
        </section>
      )}

      {executionStatus?.status === 'LLM_RESULT_READY' && (
        <section className="panel" aria-labelledby="artifact-review-title">
          <h2 id="artifact-review-title">Przegląd wyniku (Human in the Loop)</h2>
          {!artifact && (
            <button className="primary" type="button" onClick={createArtifactForReview} disabled={creatingArtifact}>
              {creatingArtifact ? 'Tworzenie…' : 'Utwórz Artifact do przeglądu'}
            </button>
          )}
          {artifact && (
            <ArtifactReviewPanel
              artifact={artifact}
              versions={artifactVersions}
              decisions={artifactDecisions}
              selectedVersionId={selectedVersionId}
              onSelectVersion={setSelectedVersionId}
              deciding={deciding}
              revisionGenerating={revisionGenerating}
              revisionError={revisionError}
              safeErrorMessage={artifactSafeError?.message ?? null}
              versionNotice={versionNotice}
              onDecide={decideOnArtifact}
            />
          )}
          {!artifact && artifactSafeError && <p role="alert">{artifactSafeError.message}</p>}
        </section>
      )}
    </main>
  )
}
