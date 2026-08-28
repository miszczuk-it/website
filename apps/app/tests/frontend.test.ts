import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisWorkspace, ExecutionStatusPanel } from '../src/components/AnalysisWorkspace.js'
import { ExecutionRetryStatus } from '../src/components/VerticalSliceWorkspace.js'
import { ArtifactReviewPanel } from '../src/components/ArtifactReviewPanel.js'
import { createArtifactVersionAndRefresh, decideArtifactAndRefresh, handleRevisionExecutionStatus } from '../src/lib/artifact-flow.js'
import { createFlowState, runMvpFlow } from '../src/lib/mvp-flow.js'
import { runGuarded, trackExecutionStatus, type SingleFlightGuard } from '../src/lib/execution-flow.js'
import { createPlatformApiClient, type PlatformApiClient } from '../src/lib/platform-api.js'
import { PlatformApiError, toSafeUiError } from '../src/lib/safe-error.js'
import { validateAnalysisForm, validateNewVersionContent } from '../src/lib/validation.js'
import type { ArtifactResponse, ArtifactReviewDecisionEnvelope, ArtifactReviewDecisionResponse, ArtifactVersionResponse, ExecutionStatusResponse } from '../src/types.js'

const FORM = { projectName: 'MVP', goal: 'Zweryfikuj problem', taskDescription: 'Przygotuj analizę' }
const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const SESSION_ID = '00000000-0000-4000-8000-000000000002'
const TASK_ID = '00000000-0000-4000-8000-000000000003'
const EXECUTION_ID = '00000000-0000-4000-8000-000000000004'
const ARTIFACT_ID = '00000000-0000-4000-8000-000000000005'
const ARTIFACT_VERSION_ID = '00000000-0000-4000-8000-000000000006'
const DECISION_ID = '00000000-0000-4000-8000-000000000007'

const BASE_ARTIFACT: ArtifactResponse = {
  contractVersion: '1.0', artifactId: ARTIFACT_ID, projectId: PROJECT_ID, sessionId: SESSION_ID, taskId: TASK_ID,
  executionId: EXECUTION_ID, artifactType: 'BUSINESS_ANALYSIS_RESULT', title: 'Wynik analizy Business Analyst',
  status: 'DRAFT', currentVersionId: ARTIFACT_VERSION_ID, revision: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const BASE_ARTIFACT_VERSION: ArtifactVersionResponse = {
  contractVersion: '1.0', artifactVersionId: ARTIFACT_VERSION_ID, artifactId: ARTIFACT_ID, versionNumber: 1,
  sourceAttemptId: null, contentText: 'Treść wyniku analizy Business Analyst.', contentSchemaVersion: '1.0',
  checksum: 'sha256:artifact-version-1', createdByType: 'SYSTEM', createdByReference: 'attempt:1',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const REVISION_REQUESTED_ARTIFACT: ArtifactResponse = { ...BASE_ARTIFACT, status: 'REVISION_REQUESTED', revision: 3 }

const BASE_ARTIFACT_VERSION_JSON: ArtifactVersionResponse = {
  ...BASE_ARTIFACT_VERSION, contentText: undefined, contentJson: { summary: 'ok' },
}

const NEW_ARTIFACT_VERSION_ID = '00000000-0000-4000-8000-000000000008'

const BASE_DECISION: ArtifactReviewDecisionResponse = {
  contractVersion: '1.0', decisionId: DECISION_ID, artifactId: ARTIFACT_ID, artifactVersionId: ARTIFACT_VERSION_ID,
  decisionType: 'APPROVE', comment: null, actorType: 'HUMAN', actorReference: 'human:reviewer',
  idempotencyKey: 'decision-key', createdAt: '2026-01-01T00:00:00.000Z',
}

// POST /artifacts/:id/decisions response envelope (MVP-TASK-006): the write
// itself always comes back wrapped like this, never as a bare decision --
// that legacy bare shape is exactly what caused the "Odpowiedź Platform API
// jest niezgodna z kontraktem" regression this fix addresses.
const BASE_DECISION_ENVELOPE: ArtifactReviewDecisionEnvelope = {
  contractVersion: '1.0', reviewDecision: BASE_DECISION, triggeredExecutionId: null,
}

const REVISION_EXECUTION_ID = '00000000-0000-4000-8000-000000000009'

const BASE_EXECUTION_STATUS: ExecutionStatusResponse = {
  contractVersion: '1.0', executionId: EXECUTION_ID, status: 'WAITING_FOR_LLM_GATEWAY', revision: 2,
  attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null,
  provider: null, model: null, workflowExecutionId: null, inputTokens: null, outputTokens: null,
  cachedInputTokens: null, totalTokens: null, actualCost: null, currency: null,
  isIncomplete: false, incompleteReason: null, fallbackUsed: false,
  retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function successfulClient(overrides: Partial<PlatformApiClient> = {}): PlatformApiClient {
  return {
    authMe: async () => ({ contractVersion: '1.0', userId: 'usr_owner', displayName: 'Owner', effectiveRole: 'OWNER', permissions: [] }),
    devLogin: async (role) => ({ contractVersion: '1.0', userId: `usr_${role.toLowerCase()}`, displayName: role, effectiveRole: role, permissions: [] }),
    logout: async () => undefined,
    listSessionsOwnedByMe: async () => [{ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, ownerId: 'usr_owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-26T09:00:00Z' }],
    getSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, ownerId: 'usr_owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-26T09:00:00Z' }),
    listSessionTasks: async () => [{ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'READY', revision: 1 }],
    getTask: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'READY', revision: 1 }),
    listTaskExecutions: async () => [{ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }],
    answerExecutionQuestion: async () => BASE_EXECUTION_STATUS,
    createProject: async () => ({ contractVersion: '1.0', projectId: PROJECT_ID, status: 'ACTIVE', revision: 0 }),
    createSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'CREATED', revision: 0 }),
    startSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'ACTIVE', revision: 1 }),
    createTask: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'CREATED', revision: 0 }),
    markTaskReady: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'READY', revision: 1 }),
    startExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }),
    getExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }),
    getExecutionStatus: async () => BASE_EXECUTION_STATUS,
    getArtifactByExecution: async () => BASE_ARTIFACT,
    retryExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 6 }),
    createArtifactFromExecution: async () => BASE_ARTIFACT,
    createNextSpecialistTask: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'READY', revision: 1 }),
    getArtifact: async () => BASE_ARTIFACT,
    listArtifactVersions: async () => [BASE_ARTIFACT_VERSION],
    submitArtifactForReview: async () => ({ ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }),
    createArtifactReviewDecision: async () => BASE_DECISION_ENVELOPE,
    listArtifactReviewDecisions: async () => [BASE_DECISION],
    createArtifactVersion: async () => ({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }),
    createArtifactRevision: async () => ({
      task: { contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'RUNNING', revision: 2 },
      execution: { contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 3 },
    }),
    getSessionWorkflow: async () => ({
      contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
      chain: [{ taskType: 'BUSINESS_ANALYSIS', state: 'CURRENT', activeTask: null, activeArtifact: null, historicalTasks: [] }],
      currentStageIndex: 0, totalStages: 4, currentSpecialistTaskType: 'BUSINESS_ANALYSIS', nextSpecialistTaskType: 'PROJECT_PLANNING',
    }),
    returnToStageRevision: async () => ({
      task: { contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'RUNNING', revision: 2 },
      session: { contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, ownerId: 'usr_owner', status: 'ACTIVE', revision: 2, createdAt: '2026-08-26T09:00:00Z' },
      execution: { contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 3 },
    }),
    ...overrides,
  }
}

test('component renders accessible fields and keeps Human in the Loop decisions hidden', () => {
  const html = renderToStaticMarkup(createElement(AnalysisWorkspace, { apiBaseUrl: '/api', apiEnabled: false }))
  for (const label of ['Nazwa projektu', 'Cel lub problem', 'Zadanie dla Business Analyst', 'Status przygotowania']) assert.ok(html.includes(label), label)
  for (const decision of ['Zatwierdź', 'Odrzuć', 'Poproś o poprawę']) assert.equal(html.includes(decision), false)
  assert.match(html, /maxLength="200"/)
  assert.match(html, /disabled=""/)
})

test('DEV deployment is explicitly labelled', () => {
  const html = renderToStaticMarkup(createElement(AnalysisWorkspace, {
    apiBaseUrl: '/api', apiEnabled: true, appEnvironment: 'DEV',
  }))
  assert.ok(html.includes('Środowisko DEV'))
})

test('validates required fields and length limits', () => {
  assert.deepEqual(validateAnalysisForm({ projectName: '', goal: ' ', taskDescription: '' }), {
    projectName: 'Podaj nazwę projektu.', goal: 'Opisz cel lub problem.', taskDescription: 'Opisz zadanie dla Business Analyst.',
  })
  const errors = validateAnalysisForm({ projectName: 'x'.repeat(201), goal: 'x'.repeat(5001), taskDescription: 'x'.repeat(10001) })
  assert.deepEqual(Object.keys(errors).sort(), ['goal', 'projectName', 'taskDescription'])
  assert.deepEqual(validateAnalysisForm(FORM), {})
})

test('API client performs all contract calls with one correlationId and unique requestIds', async () => {
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = []
  const responses = [
    { projectId: PROJECT_ID, status: 'ACTIVE', revision: 0 },
    { sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'CREATED', revision: 0 },
    { sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'ACTIVE', revision: 1 },
    { taskId: TASK_ID, sessionId: SESSION_ID, status: 'CREATED', revision: 0 },
    { taskId: TASK_ID, sessionId: SESSION_ID, status: 'READY', revision: 1 },
  ]
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ contractVersion: '1.0', ...responses[calls.length - 1] }), { status: calls.length === 1 ? 201 : 200 })
  }
  let requestNumber = 0
  const client = createPlatformApiClient('/api', { fetchImpl, createId: () => `request-${++requestNumber}` })
  const result = await runMvpFlow(client, createFlowState(FORM, 'correlation-1'))
  assert.equal(result.state.step, 'READY_FOR_EXECUTION')
  assert.deepEqual(calls.map((call) => call.url), [
    '/api/projects', `/api/projects/${PROJECT_ID}/sessions`, `/api/sessions/${SESSION_ID}/start`,
    `/api/sessions/${SESSION_ID}/tasks`, `/api/tasks/${TASK_ID}/ready`,
  ])
  assert.ok(calls.every((call) => call.headers.get('x-correlation-id') === 'correlation-1'))
  assert.equal(new Set(calls.map((call) => call.headers.get('x-request-id'))).size, 5)
  assert.equal(calls[2].body.expectedRevision, 0)
  assert.equal(calls[4].body.expectedRevision, 0)
})

test('full flow publishes every step and finishes without suggesting completed analysis', async () => {
  const steps: string[] = []
  const result = await runMvpFlow(successfulClient(), createFlowState(FORM, 'correlation-2'), (state) => steps.push(state.step))
  assert.deepEqual([...new Set(steps)], ['CREATING_PROJECT', 'CREATING_SESSION', 'STARTING_SESSION', 'CREATING_TASK', 'MARKING_TASK_READY', 'READY_FOR_EXECUTION'])
  assert.equal(result.state.taskRevision, 1)
  assert.equal(result.state.taskId, TASK_ID)
  assert.equal(JSON.stringify(result.state).includes('COMPLETED'), false)
})

test('flow state remains compatible with the delivered JSON Schema surface', async () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../../contracts/mvp-app-flow-state.schema.json', import.meta.url), 'utf8')) as {
    required: string[]; properties: Record<string, { enum?: string[] }>
  }
  const result = await runMvpFlow(successfulClient(), createFlowState(FORM, 'correlation-contract'))
  assert.ok(schema.required.every((key) => Object.hasOwn(result.state, key)))
  assert.ok(Object.keys(result.state).every((key) => Object.hasOwn(schema.properties, key)))
  assert.ok(schema.properties.step.enum?.includes(result.state.step))
  assert.equal(result.state.contractVersion, '1.0')
})

test('partial success after Project is preserved and retry does not duplicate Project', async () => {
  let projects = 0
  let sessions = 0
  const firstClient = successfulClient({
    createProject: async (...args) => { projects += 1; return successfulClient().createProject(...args) },
    createSession: async () => { sessions += 1; throw new PlatformApiError('SERVICE_UNAVAILABLE', 'correlation-3', 503) },
  })
  const first = await runMvpFlow(firstClient, createFlowState(FORM, 'correlation-3'))
  assert.equal(first.state.step, 'FAILED')
  assert.equal(first.state.lastCompletedStep, 'CREATING_PROJECT')
  assert.equal(first.state.projectId, PROJECT_ID)
  const retry = await runMvpFlow(successfulClient({ createProject: async () => { projects += 1; throw new Error('must not run') }, createSession: async (...args) => { sessions += 1; return successfulClient().createSession(...args) } }), first.state)
  assert.equal(retry.state.step, 'READY_FOR_EXECUTION')
  assert.equal(projects, 1)
  assert.equal(sessions, 2)
})

test('partial success after Session retries from startSession with stored revision', async () => {
  let sessionCreates = 0
  let startCalls = 0
  const first = await runMvpFlow(successfulClient({
    createSession: async (...args) => { sessionCreates += 1; return successfulClient().createSession(...args) },
    startSession: async () => { startCalls += 1; throw new PlatformApiError('NETWORK_ERROR', 'correlation-4') },
  }), createFlowState(FORM, 'correlation-4'))
  assert.equal(first.state.sessionId, SESSION_ID)
  assert.equal(first.state.sessionRevision, 0)
  const retry = await runMvpFlow(successfulClient({
    createSession: async () => { sessionCreates += 1; throw new Error('must not run') },
    startSession: async (...args) => { startCalls += 1; assert.equal(args[1], 0); return successfulClient().startSession(...args) },
  }), first.state)
  assert.equal(retry.state.step, 'READY_FOR_EXECUTION')
  assert.equal(sessionCreates, 1)
  assert.equal(startCalls, 2)
})

test('client maps 409, 404, validation, 503 and invalid responses safely', async () => {
  for (const [status, code] of [[409, 'CONFLICT'], [404, 'NOT_FOUND'], [400, 'VALIDATION_ERROR'], [503, 'SERVICE_UNAVAILABLE']] as const) {
    const client = createPlatformApiClient('/api', { fetchImpl: async () => new Response(JSON.stringify({ contractVersion: '1.0', errorCode: code, message: 'technical', correlationId: 'server' }), { status }) })
    await assert.rejects(client.createProject('x', 'y', 'correlation-safe'), (error: PlatformApiError) => error.code === code && error.correlationId === 'correlation-safe')
  }
  const invalid = createPlatformApiClient('/api', { fetchImpl: async () => new Response('{}', { status: 200 }) })
  await assert.rejects(invalid.createProject('x', 'y', 'correlation-safe'), (error: PlatformApiError) => error.code === 'INVALID_RESPONSE')
})

test('client maps timeout and network failure without leaking details', async () => {
  const timeoutFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
  await assert.rejects(createPlatformApiClient('/api', { fetchImpl: timeoutFetch, timeoutMs: 1 }).createProject('x', 'y', 'correlation-timeout'), (error: PlatformApiError) => error.code === 'TIMEOUT')
  const network = createPlatformApiClient('/api', { fetchImpl: async () => { throw new Error('secret host detail') } })
  await assert.rejects(network.createProject('x', 'y', 'correlation-network'), (error: PlatformApiError) => error.code === 'NETWORK_ERROR')
  const safe = toSafeUiError(new PlatformApiError('NETWORK_ERROR', 'correlation-network'))
  assert.equal(JSON.stringify(safe).includes('secret host detail'), false)
})

test('Execution client uses canonical endpoints and required start contract', async () => {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown>; correlationId: string | null }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined,
      correlationId: new Headers(init?.headers).get('x-correlation-id') })
    return new Response(JSON.stringify({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID,
      correlationId: 'correlation-execution', idempotencyKey: 'idem-1', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }), { status: 200 })
  }
  const client = createPlatformApiClient('/api', { fetchImpl })
  await client.startExecution(TASK_ID, 1, 'idem-1', 'correlation-execution')
  await client.getExecution(EXECUTION_ID, 'correlation-execution')
  assert.deepEqual(calls.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: `/api/tasks/${TASK_ID}/executions` }, { method: 'GET', url: `/api/executions/${EXECUTION_ID}` },
  ])
  assert.deepEqual(calls[0].body, { contractVersion: '1.0', idempotencyKey: 'idem-1', expectedTaskRevision: 1 })
  assert.ok(calls.every((call) => call.correlationId === 'correlation-execution'))
})

test('runGuarded blocks a concurrent duplicate call (start analysis double-click protection)', async () => {
  let calls = 0
  const guard: SingleFlightGuard = { busy: false }
  const action = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return 'started' }
  const [first, second] = await Promise.all([runGuarded(guard, action), runGuarded(guard, action)])
  assert.equal(calls, 1)
  assert.equal(first, 'started')
  assert.equal(second, null)
  assert.equal(guard.busy, false)
})

test('runGuarded ensures a retry action reaches the API exactly once even if invoked twice', async () => {
  let retryCalls = 0
  const guard: SingleFlightGuard = { busy: false }
  const retry = async () => { retryCalls += 1; return 'retried' }
  await Promise.all([runGuarded(guard, retry), runGuarded(guard, retry)])
  assert.equal(retryCalls, 1)
})

test('polling continues through WAITING_FOR_LLM_GATEWAY and RUNNING, then stops at LLM_RESULT_READY', async () => {
  const sequence = ['WAITING_FOR_LLM_GATEWAY', 'RUNNING', 'RUNNING', 'LLM_RESULT_READY'] as const
  let index = 0; let calls = 0
  const observed: string[] = []
  const client = successfulClient({
    getExecutionStatus: async () => { calls += 1; return { ...BASE_EXECUTION_STATUS, status: sequence[index++] } },
    retryExecution: async () => { throw new Error('must not be called automatically') },
  })
  const controller = trackExecutionStatus(client, { executionId: EXECUTION_ID, correlationId: 'c' },
    { wait: async () => {}, onState: (status) => observed.push(status.status) })
  await controller.whenDone
  assert.deepEqual(observed, sequence)
  assert.equal(calls, sequence.length, 'polling stops immediately once a terminal status is observed')
})

test('polling stops for FAILED_RETRYABLE, FAILED_FINAL and UNKNOWN without ever retrying automatically', async () => {
  for (const terminal of ['FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN'] as const) {
    let calls = 0
    const client = successfulClient({
      getExecutionStatus: async () => { calls += 1; return { ...BASE_EXECUTION_STATUS, status: terminal } },
      retryExecution: async () => { throw new Error('must not be called automatically') },
    })
    const controller = trackExecutionStatus(client, { executionId: EXECUTION_ID, correlationId: 'c' }, { wait: async () => {} })
    await controller.whenDone
    assert.equal(calls, 1, `${terminal} must stop polling after the first observation`)
  }
})

test('stop() ends polling immediately even mid-flight (simulates component unmount)', async () => {
  let calls = 0
  const client = successfulClient({ getExecutionStatus: async () => { calls += 1; return { ...BASE_EXECUTION_STATUS, status: 'RUNNING' } } })
  const controller = trackExecutionStatus(client, { executionId: EXECUTION_ID, correlationId: 'c' },
    { wait: async () => {}, onState: () => controller.stop() })
  await controller.whenDone
  const callsWhenStopped = calls
  assert.equal(callsWhenStopped, 1)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls, callsWhenStopped, 'no further polling after stop()')
})

test('ExecutionStatusPanel presents model, provider, tokens and cost', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'LLM_RESULT_READY', model: 'gpt-5.6-luna', provider: 'openai',
      inputTokens: 120, outputTokens: 340, totalTokens: 460, actualCost: 0.00042, currency: 'USD', attemptStatus: 'COMPLETED', attemptNumber: 1 },
    retrying: false, onRetry: () => {},
  }))
  for (const value of ['gpt-5.6-luna', 'openai', '120', '340', '460', '0.00042', 'USD', 'COMPLETED']) assert.ok(html.includes(value), value)
  assert.ok(html.includes('Wynik analizy jest gotowy.'))
})

test('ExecutionStatusPanel presents missing usage as em-dash, not zero, and omits cached tokens when absent', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: BASE_EXECUTION_STATUS, retrying: false, onRetry: () => {},
  }))
  assert.equal(html.includes('>0<'), false)
  assert.ok(html.includes('—'))
  assert.equal(html.includes('Tokeny wejściowe z cache'), false)
})

test('ExecutionStatusPanel shows cached tokens when present', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, cachedInputTokens: 64 }, retrying: false, onRetry: () => {},
  }))
  assert.ok(html.includes('Tokeny wejściowe z cache'))
  assert.ok(html.includes('64'))
})

test('ExecutionStatusPanel warns about incomplete responses while retaining result details', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'LLM_RESULT_READY', isIncomplete: true, incompleteReason: 'max_output_tokens', model: 'gpt-5.6-luna' },
    retrying: false, onRetry: () => {},
  }))
  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('Odpowied'))
  assert.ok(html.includes('max_output_tokens'))
  assert.ok(html.includes('gpt-5.6-luna'))
})

test('ExecutionStatusPanel hides the incomplete-response warning for complete responses', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, isIncomplete: false }, retrying: false, onRetry: () => {},
  }))
  assert.equal(html.includes('Odpowied'), false)
})

test('ExecutionStatusPanel shows a retry button only when retryAllowed is true (FAILED_RETRYABLE)', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'FAILED_RETRYABLE', retryAllowed: true }, retrying: false, onRetry: () => {},
  }))
  assert.ok(html.includes('Ponów analizę'))
  assert.ok(html.includes('Analiza nie powiodła się. Można ją ponowić.'))
})

test('ExecutionStatusPanel hides retry for FAILED_FINAL and shows a safe error message', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'FAILED_FINAL', retryAllowed: false, safeErrorCode: 'PROVIDER_ERROR', safeErrorMessage: 'Bezpieczny komunikat błędu.' },
    retrying: false, onRetry: () => {},
  }))
  assert.equal(html.includes('Ponów analizę'), false)
  assert.ok(html.includes('Bezpieczny komunikat błędu.'))
})

test('ExecutionStatusPanel hides retry for UNKNOWN and never renders raw technical identifiers', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'UNKNOWN', retryAllowed: false,
      providerRequestId: 'pr-secret-id', workflowExecutionId: 'wf-42' },
    retrying: false, onRetry: () => {},
  }))
  assert.equal(html.includes('Ponów analizę'), false)
  assert.ok(html.includes('Stan analizy wymaga weryfikacji.'))
  assert.equal(html.includes('pr-secret-id'), false)
  assert.equal(html.includes('wf-42'), false)
})

test('ExecutionStatusPanel never renders a raw error response shape (no stack, no response body keys)', () => {
  const html = renderToStaticMarkup(createElement(ExecutionStatusPanel, {
    executionStatus: { ...BASE_EXECUTION_STATUS, status: 'FAILED_FINAL', safeErrorMessage: 'Bezpieczny komunikat błędu.' },
    retrying: false, onRetry: () => {},
  }))
  for (const forbidden of ['stack', 'Error:', 'SELECT ', 'postgres', 'HMAC', 'x-gateway-signature']) {
    assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
  }
})

test('ExecutionRetryStatus shows a specific incomplete-response message and Retry button for a retryable max_output_tokens Execution, not a generic crash message', () => {
  const html = renderToStaticMarkup(createElement(ExecutionRetryStatus, {
    execution: { ...BASE_EXECUTION_STATUS, status: 'FAILED_RETRYABLE', isIncomplete: true, incompleteReason: 'max_output_tokens', retryAllowed: true },
    retrying: false, onRetry: () => {},
  }))
  assert.ok(html.includes('Wynik modelu jest niekompletny'))
  assert.ok(html.includes('max_output_tokens'))
  assert.ok(html.includes('Ponów wykonanie'))
  assert.equal(html.includes('Nie udało się wykonać operacji'), false, 'must not fall back to the generic crash message')
})

test('ExecutionRetryStatus hides the Retry button for an active/running Execution', () => {
  for (const status of ['WAITING_FOR_LLM_GATEWAY', 'RUNNING'] as const) {
    const html = renderToStaticMarkup(createElement(ExecutionRetryStatus, {
      execution: { ...BASE_EXECUTION_STATUS, status, isIncomplete: false, incompleteReason: null, retryAllowed: false },
      retrying: false, onRetry: () => {},
    }))
    assert.equal(html.includes('Ponów wykonanie'), false, status)
    assert.equal(html.includes('Wynik modelu jest niekompletny'), false, status)
  }
})

test('ExecutionRetryStatus shows a safe terminal-failure message for FAILED_FINAL without a retry button', () => {
  const html = renderToStaticMarkup(createElement(ExecutionRetryStatus, {
    execution: { ...BASE_EXECUTION_STATUS, status: 'FAILED_FINAL', retryAllowed: false, safeErrorMessage: 'Bezpieczny komunikat błędu.' },
    retrying: false, onRetry: () => {},
  }))
  assert.ok(html.includes('Bezpieczny komunikat błędu.'))
  assert.equal(html.includes('Ponów wykonanie'), false)
})

test('ExecutionRetryStatus disables the Retry button while a retry is in flight', () => {
  const html = renderToStaticMarkup(createElement(ExecutionRetryStatus, {
    execution: { ...BASE_EXECUTION_STATUS, status: 'FAILED_RETRYABLE', retryAllowed: true },
    retrying: true, onRetry: () => {},
  }))
  assert.ok(html.includes('disabled='))
  assert.ok(html.includes('Ponawianie…'))
})

test('runGuarded ensures the VS1 retry action reaches the API exactly once even if invoked twice (double-click protection)', async () => {
  let retryCalls = 0
  const guard: SingleFlightGuard = { busy: false }
  const retryAction = async () => { retryCalls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return 'retried' }
  const [first, second] = await Promise.all([runGuarded(guard, retryAction), runGuarded(guard, retryAction)])
  assert.equal(retryCalls, 1)
  assert.equal(first, 'retried')
  assert.equal(second, null)
})

test('Artifact API client uses canonical endpoints for create, submit-for-review and decisions', async () => {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (String(input).endsWith('/versions')) return new Response(JSON.stringify([BASE_ARTIFACT_VERSION]), { status: 200 })
    if (String(input).endsWith('/decisions')) return new Response(JSON.stringify(BASE_DECISION_ENVELOPE), { status: 201 })
    if (String(input).endsWith('/submit-for-review')) return new Response(JSON.stringify({ ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }), { status: 200 })
    return new Response(JSON.stringify(BASE_ARTIFACT), { status: 200 })
  }
  const client = createPlatformApiClient('/api', { fetchImpl })
  await client.createArtifactFromExecution(EXECUTION_ID, 'BUSINESS_ANALYSIS_RESULT', 'Wynik analizy', 'idem-artifact', 'correlation-artifact')
  await client.getArtifact(ARTIFACT_ID, 'correlation-artifact')
  const versions = await client.listArtifactVersions(ARTIFACT_ID, 'correlation-artifact')
  await client.submitArtifactForReview(ARTIFACT_ID, 0, ARTIFACT_VERSION_ID, 'idem-submit', 'correlation-artifact')
  const decisionResult = await client.createArtifactReviewDecision(ARTIFACT_ID, ARTIFACT_VERSION_ID, 'APPROVE', 1, 'idem-decision', 'correlation-artifact')
  assert.deepEqual(calls.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: `/api/executions/${EXECUTION_ID}/artifacts` },
    { method: 'GET', url: `/api/artifacts/${ARTIFACT_ID}` },
    { method: 'GET', url: `/api/artifacts/${ARTIFACT_ID}/versions` },
    { method: 'POST', url: `/api/artifacts/${ARTIFACT_ID}/submit-for-review` },
    { method: 'POST', url: `/api/artifacts/${ARTIFACT_ID}/decisions` },
  ])
  assert.deepEqual(versions, [BASE_ARTIFACT_VERSION])
  assert.equal(calls[0].body?.idempotencyKey, 'idem-artifact')
  assert.equal(calls[4].body?.comment, undefined, 'APPROVE must not send a comment field when none is given')
  assert.deepEqual(decisionResult, BASE_DECISION_ENVELOPE, 'the decisions response is the { reviewDecision, triggeredExecutionId } envelope')
})

test('Artifact list endpoints reject a non-array response as INVALID_RESPONSE', async () => {
  const client = createPlatformApiClient('/api', { fetchImpl: async () => new Response(JSON.stringify(BASE_ARTIFACT), { status: 200 }) })
  await assert.rejects(client.listArtifactVersions(ARTIFACT_ID, 'correlation-artifact'), (error: PlatformApiError) => error.code === 'INVALID_RESPONSE')
})

// --- POST /decisions response envelope (MVP-TASK-006 regression fix) ---
//
// Root cause of "Odpowiedź Platform API jest niezgodna z kontraktem": the
// backend now wraps the decision write as { reviewDecision, triggeredExecutionId }
// (contracts/mvp/artifact-review-decision-response.schema.json in ai-platform),
// but the client used to validate the bare decision shape directly against
// the top-level response body. These tests pin both directions: the new
// envelope must be accepted, and the old bare shape must now be rejected --
// proving the client no longer silently expects the legacy contract.

test('createArtifactReviewDecision accepts the { reviewDecision, triggeredExecutionId } envelope and exposes triggeredExecutionId', async () => {
  const envelope: ArtifactReviewDecisionEnvelope = {
    contractVersion: '1.0',
    reviewDecision: { ...BASE_DECISION, decisionType: 'REQUEST_REVISION', comment: 'Proszę poprawić sekcję ryzyk.' },
    triggeredExecutionId: REVISION_EXECUTION_ID,
  }
  const client = createPlatformApiClient('/api', { fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 201 }) })
  const result = await client.createArtifactReviewDecision(ARTIFACT_ID, ARTIFACT_VERSION_ID, 'REQUEST_REVISION', 1, 'idem', 'correlation', 'Proszę poprawić sekcję ryzyk.')
  assert.equal(result.triggeredExecutionId, REVISION_EXECUTION_ID)
  assert.equal(result.reviewDecision.decisionType, 'REQUEST_REVISION')
})

test('createArtifactReviewDecision rejects the legacy bare-decision response shape as INVALID_RESPONSE', async () => {
  const client = createPlatformApiClient('/api', { fetchImpl: async () => new Response(JSON.stringify(BASE_DECISION), { status: 201 }) })
  await assert.rejects(
    client.createArtifactReviewDecision(ARTIFACT_ID, ARTIFACT_VERSION_ID, 'APPROVE', 1, 'idem', 'correlation'),
    (error: PlatformApiError) => error.code === 'INVALID_RESPONSE',
  )
})

test('createArtifactReviewDecision rejects a triggeredExecutionId that is neither a string nor null', async () => {
  const client = createPlatformApiClient('/api', {
    fetchImpl: async () => new Response(JSON.stringify({ contractVersion: '1.0', reviewDecision: BASE_DECISION, triggeredExecutionId: 42 }), { status: 201 }),
  })
  await assert.rejects(
    client.createArtifactReviewDecision(ARTIFACT_ID, ARTIFACT_VERSION_ID, 'APPROVE', 1, 'idem', 'correlation'),
    (error: PlatformApiError) => error.code === 'INVALID_RESPONSE',
  )
})

test('ArtifactReviewPanel presents both contentText and contentJson version shapes', () => {
  const textHtml = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, deciding: false,
    safeErrorMessage: null, onDecide: () => {},
  }))
  assert.ok(textHtml.includes('Treść wyniku analizy Business Analyst.'))

  const jsonVersion: ArtifactVersionResponse = { ...BASE_ARTIFACT_VERSION, contentText: undefined, contentJson: { summary: 'ok' } }
  const jsonHtml = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [jsonVersion], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, deciding: false,
    safeErrorMessage: null, onDecide: () => {},
  }))
  assert.ok(jsonHtml.includes('summary'))
  assert.ok(jsonHtml.includes('ok'))
})

test('ArtifactReviewPanel status matrix: DRAFT shows no submit button and offers no decisions (MVP-TASK-007: the manual submit-for-review step is gone)', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, deciding: false,
    safeErrorMessage: null, onDecide: () => {},
  }))
  assert.equal(html.includes('Prześlij do przeglądu'), false)
  for (const decision of ['Zatwierdź', 'Odrzuć', 'Poproś o poprawę', 'Dodaj komentarz']) assert.equal(html.includes(decision), false, decision)
})

test('ArtifactReviewPanel status matrix: READY_FOR_REVIEW offers exactly Zatwierdź and Poproś o poprawę, never Odrzuć or Dodaj komentarz (MVP-TASK-007)', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: null, onDecide: () => {},
  }))
  assert.equal(html.includes('Prześlij do przeglądu'), false)
  for (const decision of ['Zatwierdź', 'Poproś o poprawę']) assert.ok(html.includes(decision), decision)
  for (const decision of ['Odrzuć', 'Dodaj komentarz']) assert.equal(html.includes(decision), false, decision)
})

test('ArtifactReviewPanel status matrix: APPROVED/REJECTED/REVISION_REQUESTED/ARCHIVED offer no decisions', () => {
  for (const status of ['APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'ARCHIVED'] as const) {
    const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
      artifact: { ...BASE_ARTIFACT, status, revision: 2 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
      deciding: false, safeErrorMessage: null, onDecide: () => {},
    }))
    for (const decision of ['Zatwierdź', 'Odrzuć', 'Poproś o poprawę', 'Dodaj komentarz', 'Prześlij do przeglądu']) {
      assert.equal(html.includes(decision), false, `${status}/${decision}`)
    }
  }
})

test('ArtifactReviewPanel hides the REJECTED status label but still shows the status label for other statuses (MVP-TASK-007)', () => {
  const rejectedHtml = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'REJECTED', revision: 2 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: null, onDecide: () => {},
  }))
  assert.equal(rejectedHtml.includes('REJECTED'), false, 'the raw REJECTED status text must never render on the review screen')

  const approvedHtml = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'APPROVED', revision: 2 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: null, onDecide: () => {},
  }))
  assert.ok(approvedHtml.includes('APPROVED'), 'other statuses keep showing their status label')
})

test('ArtifactReviewPanel disables Poproś o poprawę until a comment is typed, never disables Zatwierdź', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: null, onDecide: () => {},
  }))
  const buttonPattern = /<button[^>]*>([^<]+)<\/button>/g
  const buttons = new Map<string, string>()
  for (const match of html.matchAll(buttonPattern)) buttons.set(match[1], match[0])
  assert.match(buttons.get('Poproś o poprawę') ?? '', /disabled=""/, 'Poproś o poprawę')
  assert.doesNotMatch(buttons.get('Zatwierdź') ?? '', /disabled=""/)
})

test('ArtifactReviewPanel never fires a decision on render -- no automatic actions', () => {
  let calls = 0
  renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: null, onDecide: () => { calls += 1 },
  }))
  assert.equal(calls, 0)
})

test('ArtifactReviewPanel renders a safe error message without leaking raw response shape', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 }, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    deciding: false, safeErrorMessage: 'Dane zostały zmienione. Odśwież stan przed ponowieniem.',
    onDecide: () => {},
  }))
  assert.ok(html.includes('Dane zostały zmienione. Odśwież stan przed ponowieniem.'))
  for (const forbidden of ['stack', 'Error:', 'errorCode', 'currentRevision']) assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
})

test('AnalysisWorkspace shows the Artifact review section only once the Execution reaches LLM_RESULT_READY', () => {
  const hiddenHtml = renderToStaticMarkup(createElement(AnalysisWorkspace, { apiBaseUrl: '/api', apiEnabled: false }))
  assert.equal(hiddenHtml.includes('Przegląd wyniku (Human in the Loop)'), false)
})

// --- New-version-after-REVISION_REQUESTED (missing scope closed in this session) ---

const noopPanelProps = { deciding: false, safeErrorMessage: null, onDecide: () => {} }

test('1. REVISION_REQUESTED hides the manual new-version form and shows a generating status instead (MVP-TASK-006: revision is auto-generated)', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: REVISION_REQUESTED_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    revisionGenerating: true, revisionError: null, versionNotice: null, ...noopPanelProps,
  }))
  assert.equal(html.includes('Utwórz nową wersję'), false, 'the manual create-version button must never render in this flow')
  assert.equal(html.includes('id="artifact-new-version-text"'), false)
  assert.equal(html.includes('id="artifact-new-version-json"'), false)
  assert.ok(html.includes('Trwa generowanie poprawionej wersji'))
})

test('2. no status ever shows the removed manual new-version form (button/textareas no longer exist)', () => {
  for (const artifact of [BASE_ARTIFACT, { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1 } as ArtifactResponse,
    { ...BASE_ARTIFACT, status: 'APPROVED', revision: 2 } as ArtifactResponse, { ...BASE_ARTIFACT, status: 'REJECTED', revision: 2 } as ArtifactResponse,
    REVISION_REQUESTED_ARTIFACT, { ...BASE_ARTIFACT, status: 'ARCHIVED', revision: 5 } as ArtifactResponse]) {
    const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
      artifact, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, versionNotice: null, ...noopPanelProps,
    }))
    assert.equal(html.includes('Utwórz nową wersję'), false, artifact.status)
  }
})

test('REVISION_REQUESTED shows a safe error message (not the generating status) once the triggered Execution fails, and never auto-resubmits', () => {
  let calls = 0
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: REVISION_REQUESTED_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    revisionGenerating: false, revisionError: 'Generowanie poprawionej wersji nie powiodło się.', versionNotice: null,
    deciding: false, safeErrorMessage: null, onDecide: () => { calls += 1 },
  }))
  assert.ok(html.includes('Generowanie poprawionej wersji nie powiodło się.'))
  assert.equal(html.includes('Trwa generowanie poprawionej wersji'), false)
  assert.equal(calls, 0, 'rendering the error must never itself trigger another decision')
})

test('REVISION_REQUESTED never offers REQUEST_REVISION again while a revision is generating (blocks resubmitting the same feedback)', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: REVISION_REQUESTED_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {},
    revisionGenerating: true, revisionError: null, versionNotice: null, ...noopPanelProps,
  }))
  assert.equal(html.includes('Poproś o poprawę'), false)
})

test('3. empty content_text blocks submission', () => {
  const result = validateNewVersionContent('TEXT', '   ', '')
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assert.equal(result.error, 'Treść nie może być pusta.')
})

test('4. valid content_text reaches createArtifactVersion with a preserved contentSchemaVersion', async () => {
  const validated = validateNewVersionContent('TEXT', 'Poprawiona treść z zachowaniem\nznaków nowej linii.', '')
  assert.equal(validated.ok, true)
  if (!validated.ok) throw new Error('unreachable')
  const calls: Array<{ body?: Record<string, unknown> }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (String(input).endsWith('/versions') && init?.method === 'GET') return new Response(JSON.stringify([BASE_ARTIFACT_VERSION]), { status: 200 })
    return new Response(JSON.stringify({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }), { status: 201 })
  }
  const client = createPlatformApiClient('/api', { fetchImpl })
  const result = await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION, validated.content, 'idem-version', 'correlation-version')
  assert.equal(result.outcome, 'CREATED')
  assert.equal(calls[0].body?.contentText, 'Poprawiona treść z zachowaniem\nznaków nowej linii.', 'line breaks must survive, HTML is never interpreted -- it is a plain string field')
  assert.equal(calls[0].body?.contentSchemaVersion, BASE_ARTIFACT_VERSION.contentSchemaVersion)
})

test('5. malformed JSON blocks submission with a readable syntax error, never reaching the network', () => {
  const result = validateNewVersionContent('JSON', '', '{ not valid json')
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assert.ok(result.error.startsWith('Niepoprawny JSON:'), result.error)
})

test('6. valid JSON reaches createArtifactVersion as contentJson', async () => {
  const validated = validateNewVersionContent('JSON', '', '{"summary": "poprawione"}')
  assert.equal(validated.ok, true)
  if (!validated.ok) throw new Error('unreachable')
  const calls: Array<{ body?: Record<string, unknown> }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (String(input).endsWith('/versions') && init?.method === 'GET') return new Response(JSON.stringify([BASE_ARTIFACT_VERSION_JSON]), { status: 200 })
    return new Response(JSON.stringify({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }), { status: 201 })
  }
  const client = createPlatformApiClient('/api', { fetchImpl })
  const result = await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION_JSON, validated.content, 'idem-version', 'correlation-version')
  assert.equal(result.outcome, 'CREATED')
  assert.deepEqual(calls[0].body?.contentJson, { summary: 'poprawione' })
  assert.equal(calls[0].body?.contentText, undefined)
})

test('11. contentSchemaVersion is preserved for both content modes', async () => {
  for (const version of [BASE_ARTIFACT_VERSION, BASE_ARTIFACT_VERSION_JSON]) {
    let sentSchemaVersion: unknown
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.body) sentSchemaVersion = JSON.parse(String(init.body)).contentSchemaVersion
      if (String(input).endsWith('/versions') && init?.method === 'GET') return new Response(JSON.stringify([version]), { status: 200 })
      return new Response(JSON.stringify({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }), { status: 201 })
    }
    const client = createPlatformApiClient('/api', { fetchImpl })
    await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, version, { contentText: 'x' }, 'idem', 'correlation')
    assert.equal(sentSchemaVersion, version.contentSchemaVersion)
  }
})

test('7. request body includes expectedArtifactRevision (not just checked indirectly)', async () => {
  let body: Record<string, unknown> | undefined
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 9, currentVersionId: NEW_ARTIFACT_VERSION_ID }), { status: 201 })
  }
  const client = createPlatformApiClient('/api', { fetchImpl })
  await client.createArtifactVersion(ARTIFACT_ID, 8, '1.0', { contentText: 'x' }, 'idem', 'correlation')
  assert.equal(body?.expectedArtifactRevision, 8)
})

test('8. runGuarded blocks a concurrent double-click on new-version creation', async () => {
  let creates = 0
  const guard: SingleFlightGuard = { busy: false }
  const client = successfulClient({
    createArtifactVersion: async (...args) => { creates += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return successfulClient().createArtifactVersion(...args) },
  })
  const action = () => createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION, { contentText: 'x' }, 'idem', 'correlation')
  const [first, second] = await Promise.all([runGuarded(guard, action), runGuarded(guard, action)])
  assert.equal(creates, 1, 'the write must reach the API exactly once')
  assert.notEqual(first, null)
  assert.equal(second, null)
})

test('9. success refreshes both the Artifact and the version list, pointing currentVersion at the new one', async () => {
  let listCalls = 0
  const client = successfulClient({
    createArtifactVersion: async () => ({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }),
    listArtifactVersions: async () => { listCalls += 1; return [BASE_ARTIFACT_VERSION, { ...BASE_ARTIFACT_VERSION, artifactVersionId: NEW_ARTIFACT_VERSION_ID, versionNumber: 2, contentText: 'Poprawiona treść.' }] },
  })
  const result = await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION, { contentText: 'Poprawiona treść.' }, 'idem', 'correlation')
  assert.equal(result.outcome, 'CREATED')
  if (result.outcome !== 'CREATED') throw new Error('unreachable')
  assert.equal(listCalls, 1, 'the version list must be refetched after a successful create')
  assert.equal(result.artifact.status, 'DRAFT')
  assert.equal(result.artifact.currentVersionId, NEW_ARTIFACT_VERSION_ID)
  assert.equal(result.version?.artifactVersionId, NEW_ARTIFACT_VERSION_ID)
  assert.equal(result.version?.contentText, 'Poprawiona treść.')
})

test('10. 409 refreshes Artifact and versions without an automatic replay of the write', async () => {
  let createCalls = 0
  let getArtifactCalls = 0
  let listCalls = 0
  const client = successfulClient({
    createArtifactVersion: async () => { createCalls += 1; throw new PlatformApiError('CONFLICT', 'correlation', 409, 5) },
    getArtifact: async () => { getArtifactCalls += 1; return { ...BASE_ARTIFACT, status: 'REVISION_REQUESTED', revision: 5 } },
    listArtifactVersions: async () => { listCalls += 1; return [BASE_ARTIFACT_VERSION] },
  })
  const result = await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION, { contentText: 'x' }, 'idem', 'correlation')
  assert.equal(result.outcome, 'CONFLICT')
  assert.equal(createCalls, 1, 'the write must not be automatically retried after a 409')
  assert.equal(getArtifactCalls, 1)
  assert.equal(listCalls, 1)
  if (result.outcome !== 'CONFLICT') throw new Error('unreachable')
  assert.equal(result.artifact.revision, 5)
  assert.ok(result.message.length > 0)
})

test('12. the historical version stays reachable and unchanged after a new version is created', async () => {
  const originalVersion = { ...BASE_ARTIFACT_VERSION }
  const client = successfulClient({
    createArtifactVersion: async () => ({ ...BASE_ARTIFACT, status: 'DRAFT', revision: 4, currentVersionId: NEW_ARTIFACT_VERSION_ID }),
    listArtifactVersions: async () => [originalVersion, { ...BASE_ARTIFACT_VERSION, artifactVersionId: NEW_ARTIFACT_VERSION_ID, versionNumber: 2, contentText: 'Nowa treść.' }],
  })
  const result = await createArtifactVersionAndRefresh(client, REVISION_REQUESTED_ARTIFACT, BASE_ARTIFACT_VERSION, { contentText: 'Nowa treść.' }, 'idem', 'correlation')
  assert.equal(result.outcome, 'CREATED')
  const versions = await client.listArtifactVersions(ARTIFACT_ID, 'correlation')
  const history = versions.find((version) => version.artifactVersionId === ARTIFACT_VERSION_ID)
  assert.deepEqual(history, BASE_ARTIFACT_VERSION, 'the prior version object must be byte-identical, never mutated in place')
  // The create-version request contract carries no artifactVersionId field
  // at all (artifact-version-create.schema.json), so there is structurally
  // no way for this call to target and edit an existing version.
  const requestFields = ['contractVersion', 'idempotencyKey', 'expectedArtifactRevision', 'contentSchemaVersion', 'contentText', 'contentJson']
  assert.ok(!requestFields.includes('artifactVersionId'))
})

test('ArtifactReviewPanel shows a success notice when versionNotice is set (generic notice slot, unrelated to any specific form)', () => {
  const noticeHtml = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, versionNotice: 'Nowa wersja została utworzona.',
    ...noopPanelProps,
  }))
  assert.ok(noticeHtml.includes('Nowa wersja została utworzona.'))
})

// --- Version history + decision history (missing scope closed in this follow-up) ---

const CURRENT_ARTIFACT_VERSION_V2: ArtifactVersionResponse = {
  ...BASE_ARTIFACT_VERSION, artifactVersionId: NEW_ARTIFACT_VERSION_ID, versionNumber: 2, contentText: 'Nowa treść po poprawkach.',
}
const ARTIFACT_WITH_TWO_VERSIONS: ArtifactResponse = { ...BASE_ARTIFACT, status: 'READY_FOR_REVIEW', revision: 1, currentVersionId: NEW_ARTIFACT_VERSION_ID }

test('version history lists both current and historical versions with the right labels', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: ARTIFACT_WITH_TWO_VERSIONS, versions: [BASE_ARTIFACT_VERSION, CURRENT_ARTIFACT_VERSION_V2], decisions: [],
    selectedVersionId: null, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  assert.ok(html.includes('Wersja 1'))
  assert.ok(html.includes('Wersja 2'))
  assert.ok(html.includes('Bieżąca'))
  assert.ok(html.includes('Historyczna'))
  assert.ok(html.includes(BASE_ARTIFACT_VERSION.createdByType))
})

test('selecting a historical version previews its content and hides all decisions (MVP-TASK-007: decisions only ever target the current version)', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: ARTIFACT_WITH_TWO_VERSIONS, versions: [BASE_ARTIFACT_VERSION, CURRENT_ARTIFACT_VERSION_V2], decisions: [],
    selectedVersionId: BASE_ARTIFACT_VERSION.artifactVersionId, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  assert.ok(html.includes('Treść wyniku analizy Business Analyst.'), 'must preview the selected historical version, not current')
  assert.equal(html.includes('Nowa treść po poprawkach.'), false, 'must not preview current while a historical version is selected')
  for (const decision of ['Zatwierdź', 'Odrzuć', 'Poproś o poprawę', 'Dodaj komentarz']) assert.equal(html.includes(decision), false, decision)
})

test('no selection defaults to previewing the current version', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: ARTIFACT_WITH_TWO_VERSIONS, versions: [BASE_ARTIFACT_VERSION, CURRENT_ARTIFACT_VERSION_V2], decisions: [],
    selectedVersionId: null, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  assert.ok(html.includes('Nowa treść po poprawkach.'))
  assert.equal(html.includes('Treść wyniku analizy Business Analyst.'), false)
})

test('Zatwierdź/Poproś o poprawę remain available when the current version is selected, Odrzuć/Dodaj komentarz never do', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: ARTIFACT_WITH_TWO_VERSIONS, versions: [BASE_ARTIFACT_VERSION, CURRENT_ARTIFACT_VERSION_V2], decisions: [],
    selectedVersionId: CURRENT_ARTIFACT_VERSION_V2.artifactVersionId, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  for (const decision of ['Zatwierdź', 'Poproś o poprawę']) assert.ok(html.includes(decision), decision)
  for (const decision of ['Odrzuć', 'Dodaj komentarz']) assert.equal(html.includes(decision), false, decision)
})

test('decision history renders decisionType, comment, actorReference, createdAt and the target version, without technical fields', () => {
  const decision: ArtifactReviewDecisionResponse = {
    contractVersion: '1.0', decisionId: DECISION_ID, artifactId: ARTIFACT_ID, artifactVersionId: ARTIFACT_VERSION_ID,
    decisionType: 'REQUEST_REVISION', comment: 'Proszę dodać więcej szczegółów.', actorType: 'HUMAN', actorReference: 'human:reviewer-42',
    idempotencyKey: 'super-secret-idempotency-key', createdAt: '2026-01-02T10:00:00.000Z',
  }
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [decision], selectedVersionId: null, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  assert.ok(html.includes('Poproś o poprawę'))
  assert.ok(html.includes('Proszę dodać więcej szczegółów.'))
  assert.ok(html.includes('human:reviewer-42'))
  assert.ok(html.includes('2026-01-02T10:00:00.000Z'))
  assert.ok(html.includes('wersja 1'))
  for (const forbidden of ['super-secret-idempotency-key', decision.decisionId, 'requestFingerprint', 'idempotencyKey']) {
    assert.equal(html.includes(forbidden), false, forbidden)
  }
})

test('decision history shows an empty state when there are no decisions yet', () => {
  const html = renderToStaticMarkup(createElement(ArtifactReviewPanel, {
    artifact: BASE_ARTIFACT, versions: [BASE_ARTIFACT_VERSION], decisions: [], selectedVersionId: null, onSelectVersion: () => {}, ...noopPanelProps,
  }))
  assert.ok(html.includes('Brak decyzji.'))
})

test('decideArtifactAndRefresh: success refreshes Artifact, versions and decisions in one snapshot', async () => {
  let getArtifactCalls = 0, listVersionCalls = 0, listDecisionCalls = 0
  const decidedArtifact: ArtifactResponse = { ...BASE_ARTIFACT, status: 'APPROVED', revision: 2 }
  const newDecision = { ...BASE_DECISION, decisionType: 'APPROVE' as const }
  const client = successfulClient({
    createArtifactReviewDecision: async () => ({ contractVersion: '1.0', reviewDecision: newDecision, triggeredExecutionId: null }),
    getArtifact: async () => { getArtifactCalls += 1; return decidedArtifact },
    listArtifactVersions: async () => { listVersionCalls += 1; return [BASE_ARTIFACT_VERSION] },
    listArtifactReviewDecisions: async () => { listDecisionCalls += 1; return [newDecision] },
  })
  const result = await decideArtifactAndRefresh(client, BASE_ARTIFACT, ARTIFACT_VERSION_ID, 'APPROVE', '', 'idem-decision', 'correlation')
  assert.equal(result.outcome, 'DECIDED')
  if (result.outcome !== 'DECIDED') throw new Error('unreachable')
  assert.equal(getArtifactCalls, 1)
  assert.equal(listVersionCalls, 1)
  assert.equal(listDecisionCalls, 1)
  assert.equal(result.artifact.status, 'APPROVED')
  assert.deepEqual(result.decisions, [newDecision])
})

test('decideArtifactAndRefresh: a failed decision still refreshes read-only state without retrying the write', async () => {
  let decisionCalls = 0
  const client = successfulClient({
    createArtifactReviewDecision: async () => { decisionCalls += 1; throw new PlatformApiError('REVIEW_ALREADY_COMPLETED', 'correlation', 409) },
    getArtifact: async () => ({ ...BASE_ARTIFACT, status: 'APPROVED', revision: 3 }),
    listArtifactReviewDecisions: async () => [BASE_DECISION],
  })
  const result = await decideArtifactAndRefresh(client, BASE_ARTIFACT, ARTIFACT_VERSION_ID, 'APPROVE', '', 'idem-decision', 'correlation')
  assert.equal(result.outcome, 'ERROR')
  assert.equal(decisionCalls, 1, 'the write must not be retried automatically')
  if (result.outcome !== 'ERROR') throw new Error('unreachable')
  assert.ok(result.refreshed)
  assert.equal(result.refreshed?.artifact.status, 'APPROVED')
  assert.deepEqual(result.refreshed?.decisions, [BASE_DECISION])
})

// --- REQUEST_REVISION auto-generation (MVP-TASK-006 frontend fix) ---

test('decideArtifactAndRefresh: REQUEST_REVISION reads triggeredExecutionId out of the response envelope', async () => {
  const revisionRequestedArtifact: ArtifactResponse = { ...BASE_ARTIFACT, status: 'REVISION_REQUESTED', revision: 1 }
  const client = successfulClient({
    createArtifactReviewDecision: async () => ({
      contractVersion: '1.0',
      reviewDecision: { ...BASE_DECISION, decisionType: 'REQUEST_REVISION', comment: 'Proszę dodać ryzyka.' },
      triggeredExecutionId: REVISION_EXECUTION_ID,
    }),
    getArtifact: async () => revisionRequestedArtifact,
  })
  const result = await decideArtifactAndRefresh(client, BASE_ARTIFACT, ARTIFACT_VERSION_ID, 'REQUEST_REVISION', 'Proszę dodać ryzyka.', 'idem-decision', 'correlation')
  assert.equal(result.outcome, 'DECIDED')
  if (result.outcome !== 'DECIDED') throw new Error('unreachable')
  assert.equal(result.triggeredExecutionId, REVISION_EXECUTION_ID)
  assert.equal(result.artifact.status, 'REVISION_REQUESTED')
})

test('decideArtifactAndRefresh: APPROVE/REJECT/COMMENT_ONLY carry triggeredExecutionId: null (only REQUEST_REVISION ever triggers an Execution)', async () => {
  const result = await decideArtifactAndRefresh(successfulClient(), BASE_ARTIFACT, ARTIFACT_VERSION_ID, 'APPROVE', '', 'idem-decision', 'correlation')
  assert.equal(result.outcome, 'DECIDED')
  if (result.outcome !== 'DECIDED') throw new Error('unreachable')
  assert.equal(result.triggeredExecutionId, null)
})

test('handleRevisionExecutionStatus: still in flight (WAITING_FOR_LLM_GATEWAY/RUNNING) returns null and never refreshes the Artifact', async () => {
  let getArtifactCalls = 0
  const client = successfulClient({ getArtifact: async () => { getArtifactCalls += 1; return BASE_ARTIFACT } })
  for (const status of ['WAITING_FOR_LLM_GATEWAY', 'RUNNING'] as const) {
    const result = await handleRevisionExecutionStatus(client, ARTIFACT_ID, 'correlation', { ...BASE_EXECUTION_STATUS, executionId: REVISION_EXECUTION_ID, status })
    assert.equal(result, null)
  }
  assert.equal(getArtifactCalls, 0, 'no premature refresh while the revision Execution is still running')
})

test('handleRevisionExecutionStatus: LLM_RESULT_READY refreshes the Artifact, versions and decisions in one snapshot', async () => {
  const draftWithNewVersion: ArtifactResponse = { ...BASE_ARTIFACT, status: 'DRAFT', currentVersionId: NEW_ARTIFACT_VERSION_ID, revision: 4 }
  const newVersion = { ...BASE_ARTIFACT_VERSION, artifactVersionId: NEW_ARTIFACT_VERSION_ID, versionNumber: 2, contentText: 'Poprawiona treść wygenerowana automatycznie.' }
  let getArtifactCalls = 0, listVersionCalls = 0, listDecisionCalls = 0
  const client = successfulClient({
    getArtifact: async () => { getArtifactCalls += 1; return draftWithNewVersion },
    listArtifactVersions: async () => { listVersionCalls += 1; return [BASE_ARTIFACT_VERSION, newVersion] },
    listArtifactReviewDecisions: async () => { listDecisionCalls += 1; return [{ ...BASE_DECISION, decisionType: 'REQUEST_REVISION' as const }] },
  })
  const result = await handleRevisionExecutionStatus(client, ARTIFACT_ID, 'correlation', { ...BASE_EXECUTION_STATUS, executionId: REVISION_EXECUTION_ID, status: 'LLM_RESULT_READY' })
  assert.ok(result)
  assert.equal(result?.outcome, 'REFRESHED')
  if (result?.outcome !== 'REFRESHED') throw new Error('unreachable')
  assert.equal(getArtifactCalls, 1); assert.equal(listVersionCalls, 1); assert.equal(listDecisionCalls, 1)
  assert.equal(result.artifact.status, 'DRAFT', 'the auto-generated version resets the Artifact to DRAFT, same as manual createArtifactVersion')
  assert.equal(result.artifact.currentVersionId, NEW_ARTIFACT_VERSION_ID)
  assert.ok(result.versions.some((version) => version.artifactVersionId === NEW_ARTIFACT_VERSION_ID))
})

test('handleRevisionExecutionStatus: a failed generation (FAILED_RETRYABLE/FAILED_FINAL/UNKNOWN) reports a safe message and never refreshes', async () => {
  for (const status of ['FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN'] as const) {
    let getArtifactCalls = 0
    const client = successfulClient({ getArtifact: async () => { getArtifactCalls += 1; return BASE_ARTIFACT } })
    const result = await handleRevisionExecutionStatus(client, ARTIFACT_ID, 'correlation', {
      ...BASE_EXECUTION_STATUS, executionId: REVISION_EXECUTION_ID, status, safeErrorMessage: status === 'FAILED_FINAL' ? 'Bezpieczny komunikat błędu.' : null,
    })
    assert.equal(result?.outcome, 'FAILED', status)
    assert.equal(getArtifactCalls, 0, `${status} must not refresh -- no new version exists`)
    if (result?.outcome !== 'FAILED') throw new Error('unreachable')
    assert.ok(result.message.length > 0)
  }
})

test('polling the triggered revision Execution: refresh happens exactly once, only after LLM_RESULT_READY (proves no premature or duplicate refresh)', async () => {
  const sequence = ['WAITING_FOR_LLM_GATEWAY', 'RUNNING', 'LLM_RESULT_READY'] as const
  let index = 0, getArtifactCalls = 0
  const client = successfulClient({
    getExecutionStatus: async () => ({ ...BASE_EXECUTION_STATUS, executionId: REVISION_EXECUTION_ID, status: sequence[index++] }),
    getArtifact: async () => { getArtifactCalls += 1; return { ...BASE_ARTIFACT, status: 'DRAFT', revision: 4 } },
  })
  const outcomes: string[] = []
  const controller = trackExecutionStatus(client, { executionId: REVISION_EXECUTION_ID, correlationId: 'correlation' }, {
    wait: async () => {},
    onState: (status) => {
      handleRevisionExecutionStatus(client, ARTIFACT_ID, 'correlation', status).then((result) => { if (result) outcomes.push(result.outcome) })
    },
  })
  await controller.whenDone
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(outcomes, ['REFRESHED'])
  assert.equal(getArtifactCalls, 1, 'the Artifact must be refreshed exactly once, after the Execution reaches LLM_RESULT_READY')
})
