import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisWorkspace } from '../src/components/AnalysisWorkspace.js'
import { createFlowState, runMvpFlow } from '../src/lib/mvp-flow.js'
import { createPlatformApiClient, type PlatformApiClient } from '../src/lib/platform-api.js'
import { PlatformApiError, toSafeUiError } from '../src/lib/safe-error.js'
import { validateAnalysisForm } from '../src/lib/validation.js'

const FORM = { projectName: 'MVP', goal: 'Zweryfikuj problem', taskDescription: 'Przygotuj analizę' }
const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const SESSION_ID = '00000000-0000-4000-8000-000000000002'
const TASK_ID = '00000000-0000-4000-8000-000000000003'

function successfulClient(overrides: Partial<PlatformApiClient> = {}): PlatformApiClient {
  return {
    createProject: async () => ({ contractVersion: '1.0', projectId: PROJECT_ID, status: 'ACTIVE', revision: 0 }),
    createSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'CREATED', revision: 0 }),
    startSession: async () => ({ contractVersion: '1.0', sessionId: SESSION_ID, projectId: PROJECT_ID, status: 'ACTIVE', revision: 1 }),
    createTask: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, status: 'CREATED', revision: 0 }),
    markTaskReady: async () => ({ contractVersion: '1.0', taskId: TASK_ID, sessionId: SESSION_ID, status: 'READY', revision: 1 }),
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
