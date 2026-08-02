import { useMemo, useRef, useState } from 'react'
import { createFlowState, nextIncompleteStep, runMvpFlow } from '../lib/mvp-flow.js'
import { startAndTrackExecution, type ExecutionTrackingState } from '../lib/execution-flow.js'
import { createPlatformApiClient, type PlatformApiClient } from '../lib/platform-api.js'
import { toSafeUiError, type SafeUiError } from '../lib/safe-error.js'
import { validateAnalysisForm, type FormErrors } from '../lib/validation.js'
import type { AnalysisFormValues, FlowStep, MvpFlowState } from '../types.js'

const EMPTY_FORM: AnalysisFormValues = { projectName: '', goal: '', taskDescription: '' }
const BUSY_STEPS: FlowStep[] = ['VALIDATING', 'CREATING_PROJECT', 'CREATING_SESSION', 'STARTING_SESSION', 'CREATING_TASK', 'MARKING_TASK_READY']

const STEP_LABELS: Record<FlowStep, string> = {
  IDLE: 'Oczekiwanie na dane', VALIDATING: 'Sprawdzanie formularza',
  CREATING_PROJECT: 'Tworzenie projektu', CREATING_SESSION: 'Tworzenie sesji',
  STARTING_SESSION: 'Uruchamianie sesji', CREATING_TASK: 'Tworzenie zadania',
  MARKING_TASK_READY: 'Oznaczanie zadania jako gotowe',
  READY_FOR_EXECUTION: 'Gotowe do uruchomienia', FAILED: 'Przepływ zatrzymany',
}

type Props = {
  apiBaseUrl: string
  apiEnabled: boolean
  clientOverride?: PlatformApiClient
  createCorrelationId?: () => string
}

export function AnalysisWorkspace({ apiBaseUrl, apiEnabled, clientOverride, createCorrelationId = () => crypto.randomUUID() }: Props) {
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [flow, setFlow] = useState<MvpFlowState | null>(null)
  const [safeError, setSafeError] = useState<SafeUiError | null>(null)
  const [execution, setExecution] = useState<ExecutionTrackingState | null>(null)
  const submitting = useRef(false)
  const startingExecution = useRef(false)
  const executionIdempotencyKey = useRef<string | null>(null)
  const projectNameInput = useRef<HTMLInputElement>(null)
  const goalInput = useRef<HTMLTextAreaElement>(null)
  const taskInput = useRef<HTMLTextAreaElement>(null)
  const client = useMemo(() => clientOverride ?? createPlatformApiClient(apiBaseUrl), [apiBaseUrl, clientOverride])
  const step = flow?.step ?? 'IDLE'
  const isBusy = BUSY_STEPS.includes(step)
  const hasCreatedState = Boolean(flow?.projectId)
  const failedStep = flow?.step === 'FAILED' ? nextIncompleteStep(flow) : null

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

  async function execute() {
    if (startingExecution.current || flow?.step !== 'READY_FOR_EXECUTION' || !flow.taskId || flow.taskRevision === null) return
    startingExecution.current = true; setSafeError(null)
    executionIdempotencyKey.current ??= crypto.randomUUID()
    const result = await startAndTrackExecution(client, {
      taskId: flow.taskId, taskRevision: flow.taskRevision, correlationId: flow.correlationId,
      idempotencyKey: executionIdempotencyKey.current,
    }, { onState: setExecution })
    if (result.error) setSafeError(toSafeUiError(result.error))
    startingExecution.current = false
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">AI Platform · app.miszczuk.it</p>
        <h1>Przygotuj analizę projektu</h1>
        <p>Utwórz Project, Session i zadanie Business Analyst. Analiza zostanie uruchomiona dopiero w kolejnym etapie MVP.</p>
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
        {step === 'READY_FOR_EXECUTION' && <p className="success-message">Zadanie jest gotowe do uruchomienia w kolejnym etapie MVP.</p>}
        {step === 'READY_FOR_EXECUTION' && <button className="primary" type="button" onClick={execute}
          disabled={!apiEnabled || execution?.status === 'STARTING_EXECUTION' || execution?.status === 'BUILDING_CONTEXT' || execution?.status === 'WAITING_FOR_LLM_GATEWAY'}>
          Uruchom wykonanie
        </button>}
        {execution && <dl className="result-grid">
          <dt>Execution ID</dt><dd>{execution.executionId ?? 'Tworzenie…'}</dd>
          <dt>Execution status</dt><dd>{execution.status}</dd>
        </dl>}
        {execution?.status === 'BUILDING_CONTEXT' && <p>Trwa przygotowanie kontekstu.</p>}
        {execution?.status === 'WAITING_FOR_LLM_GATEWAY' && <p className="success-message">Kontekst został przygotowany. Zadanie oczekuje na uruchomienie LLM Gateway.</p>}
        <p>Analiza nie została jeszcze uruchomiona. Funkcje decyzji Human in the Loop będą dostępne po utworzeniu Artifact Version.</p>
      </section>
    </main>
  )
}
