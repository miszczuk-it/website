import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisWorkspace, ExecutionStatusPanel } from '../src/components/AnalysisWorkspace.js'
import { createFlowState, runMvpFlow } from '../src/lib/mvp-flow.js'
import { runGuarded, trackExecutionStatus, type SingleFlightGuard } from '../src/lib/execution-flow.js'
import { createPlatformApiClient, type PlatformApiClient } from '../src/lib/platform-api.js'
import { PlatformApiError, toSafeUiError } from '../src/lib/safe-error.js'
import { validateAnalysisForm } from '../src/lib/validation.js'
import type { ExecutionStatusResponse } from '../src/types.js'

const FORM = { projectName: 'MVP', goal: 'Zweryfikuj problem', taskDescription: 'Przygotuj analizę' }
const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const SESSION_ID = '00000000-0000-4000-8000-000000000002'
const TASK_ID = '00000000-0000-4000-8000-000000000003'
const EXECUTION_ID = '00000000-0000-4000-8000-000000000004'

const BASE_EXECUTION_STATUS: ExecutionStatusResponse = {
  contractVersion: '1.0', executionId: EXECUTION_ID, status: 'WAITING_FOR_LLM_GATEWAY',
  attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null,
  provider: null, model: null, workflowExecutionId: null, inputTokens: null, outputTokens: null,
  cachedInputTokens: null, totalTokens: null, actualCost: null, currency: null,
  retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function successfulClient(overrides: Partial<PlatformApiClient> = {}): PlatformApiClient {
  return {
    createProject: async () => ({ contractVersion: '1.0', projectId: PROJECT_ID, status: 'ACTIVE', revision: 0 }),
    createSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'CREATED', revision: 0 }),
    startSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'ACTIVE', revision: 1 }),
    createTask: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, status: 'CREATED', revision: 0 }),
    markTaskReady: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, status: 'READY', revision: 1 }),
    startExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }),
    getExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 2 }),
    getExecutionStatus: async () => BASE_EXECUTION_STATUS,
    retryExecution: async () => ({ contractVersion: '1.0', executionId: EXECUTION_ID, taskId: TASK_ID, correlationId: 'correlation', idempotencyKey: 'key', status: 'WAITING_FOR_LLM_GATEWAY', revision: 6 }),
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
