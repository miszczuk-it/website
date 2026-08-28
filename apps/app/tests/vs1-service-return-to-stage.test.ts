import assert from 'node:assert/strict'
import test from 'node:test'
import { PlatformApiError } from '../src/lib/safe-error.js'
import { createMockVs1Service, createRealVs1Service } from '../src/lib/vs1-service.js'

// GAP-015 (return-to-previous-stage revision navigation) coverage for both
// Vs1Service implementations, mirroring vs1-service-real.test.ts's fakeFetch
// pattern for the real adapter.
const BASE = 'http://test.local/api'

type Route = { method: string; path: string; respond: (body: unknown) => { status: number; body: unknown } }

function fakeFetch(routes: Route[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const path = url.replace(BASE, '')
    const method = (init?.method ?? 'GET') as string
    const body = init?.body ? JSON.parse(init.body as string) : null
    const route = routes.find((candidate) => candidate.method === method && candidate.path === path)
    if (!route) throw new Error(`Unexpected request: ${method} ${path}`)
    const { status, body: responseBody } = route.respond(body)
    return { ok: status >= 200 && status < 300, status, json: async () => responseBody } as Response
  }) as typeof fetch
}

test('real VS1 adapter getWorkflow reads the server-computed active lineage projection', async () => {
  const sessionId = 'ses-workflow'
  const workflow = {
    contractVersion: '1.0', sessionId, sessionStatus: 'ACTIVE',
    chain: [
      { taskType: 'BUSINESS_ANALYSIS', state: 'COMPLETED', activeTask: null, activeArtifact: null, historicalTasks: [] },
      { taskType: 'PROJECT_PLANNING', state: 'COMPLETED', activeTask: null, activeArtifact: null, historicalTasks: [] },
      { taskType: 'CODE_IMPLEMENTATION', state: 'CURRENT', activeTask: null, activeArtifact: null, historicalTasks: [] },
      { taskType: 'QUALITY_REVIEW', state: 'UPCOMING', activeTask: null, activeArtifact: null, historicalTasks: [] },
    ],
    currentStageIndex: 2, totalStages: 4, currentSpecialistTaskType: 'CODE_IMPLEMENTATION', nextSpecialistTaskType: 'QUALITY_REVIEW',
  }
  const fetchImpl = fakeFetch([
    { method: 'GET', path: `/sessions/${sessionId}/workflow`, respond: () => ({ status: 200, body: workflow }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const result = await createRealVs1Service(BASE).getWorkflow(sessionId)
    assert.equal(result.currentSpecialistTaskType, 'CODE_IMPLEMENTATION')
    assert.equal(result.nextSpecialistTaskType, 'QUALITY_REVIEW')
    assert.equal(result.chain[0]?.state, 'COMPLETED')
    assert.equal(result.chain[3]?.state, 'UPCOMING')
  } finally { globalThis.fetch = originalFetch }
})

test('real VS1 adapter returnToStage sends targetTaskId/feedback/expectedRevision and resumes the Artifact flow', async () => {
  const sessionId = 'ses-return', targetTaskId = 'task-pm-v1', newTaskId = 'task-pm-v2', executionId = 'exe-return', artifactId = 'art-return', versionId = 'ver-return'
  const captured: { body: Record<string, unknown> | null } = { body: null }
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/sessions/${sessionId}/revisions/return-to-stage`, respond: (body) => {
      captured.body = body as Record<string, unknown>
      return {
        status: 201, body: {
          task: { contractVersion: '1.0', taskId: newTaskId, sessionId, taskType: 'PROJECT_PLANNING', status: 'RUNNING', revision: 1 },
          session: { contractVersion: '1.0', sessionId, projectId: 'prj-return', ownerId: 'dev-owner', status: 'ACTIVE', revision: 6, createdAt: '2026-08-28T09:00:00Z' },
          execution: { contractVersion: '1.0', executionId, taskId: newTaskId, correlationId: 'c-1', idempotencyKey: 'k-1', status: 'WAITING_FOR_LLM_GATEWAY', revision: 0 },
        },
      }
    } },
    { method: 'GET', path: `/executions/${executionId}/status`, respond: () => ({ status: 200, body: { contractVersion: '1.0', executionId, status: 'LLM_RESULT_READY', revision: 1, retryAllowed: false, reconcileRequired: false, updatedAt: '2026-08-28T09:01:00Z', pendingQuestion: null } }) },
    { method: 'GET', path: `/executions/${executionId}/artifact`, respond: () => ({ status: 404, body: { contractVersion: '1.0', errorCode: 'NOT_FOUND', message: 'Nie znaleziono.', correlationId: 'corr-1' } }) },
    { method: 'POST', path: `/executions/${executionId}/artifacts`, respond: () => ({ status: 201, body: { contractVersion: '1.0', artifactId, projectId: 'prj-return', sessionId, taskId: newTaskId, executionId, artifactType: 'PROJECT_PLAN', title: 'Plan projektu', status: 'READY_FOR_REVIEW', currentVersionId: versionId, revision: 1, createdAt: '2026-08-28T09:01:01Z', updatedAt: '2026-08-28T09:01:01Z' } }) },
    { method: 'GET', path: `/artifacts/${artifactId}/versions`, respond: () => ({ status: 200, body: [{ contractVersion: '1.0', artifactVersionId: versionId, artifactId, versionNumber: 2, sourceAttemptId: null, contentText: 'Nowy plan po powrocie do etapu.', contentSchemaVersion: '1.0', checksum: 'sha256:z', createdByType: 'SYSTEM', createdByReference: 'attempt:a-3', createdAt: '2026-08-28T09:01:01Z' }] }) },
    { method: 'GET', path: `/sessions/${sessionId}`, respond: () => ({ status: 200, body: { contractVersion: '1.0', sessionId, projectId: 'prj-return', ownerId: 'dev-owner', status: 'ACTIVE', revision: 6, createdAt: '2026-08-28T09:00:00Z' } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const result = await createRealVs1Service(BASE).returnToStage(sessionId, targetTaskId, 'Zakres się zmienił', 5)
    assert.equal(captured.body?.targetTaskId, targetTaskId)
    assert.equal(captured.body?.feedback, 'Zakres się zmienił')
    assert.equal(captured.body?.expectedRevision, 5)
    assert.equal(typeof captured.body?.idempotencyKey, 'string')
    assert.equal(result.session.status, 'ACTIVE')
    assert.equal(result.artifact?.status, 'READY_FOR_REVIEW')
  } finally { globalThis.fetch = originalFetch }
})

test('real VS1 adapter surfaces NOT_EARLIER_STAGE from returnToStage as a machine-readable PlatformApiError', async () => {
  const sessionId = 'ses-invalid-return'
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/sessions/${sessionId}/revisions/return-to-stage`, respond: () => ({ status: 409, body: { contractVersion: '1.0', errorCode: 'NOT_EARLIER_STAGE', message: 'Można wrócić wyłącznie do wcześniejszego, zakończonego etapu.', correlationId: 'corr-3' } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    await assert.rejects(
      createRealVs1Service(BASE).returnToStage(sessionId, 'task-current', 'x', 1),
      (error: unknown) => error instanceof PlatformApiError && error.code === 'NOT_EARLIER_STAGE',
    )
  } finally { globalThis.fetch = originalFetch }
})

test('mock VS1 service requestRevision requires non-empty feedback', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OWNER')
  const created = await service.createSession({ projectName: 'Mock', goal: 'Cel' })
  const answered = await service.answer(created.execution.executionId, created.executionRevision, created.execution.pendingQuestion!.questionId, 'Odpowiedź')
  await assert.rejects(
    service.requestRevision(answered.artifact!, answered.versions[0]!, ''),
    (error: unknown) => error instanceof PlatformApiError && error.code === 'REVIEW_COMMENT_REQUIRED',
  )
  const revised = await service.requestRevision(answered.artifact!, answered.versions[0]!, 'Popraw zakres')
  assert.equal(revised.artifact?.status, 'READY_FOR_REVIEW')
  assert.equal(revised.versions.length, 2, 'a new version is appended, the previous one stays reachable')
})

test('mock VS1 service returnToStage has no earlier stage to offer (single-stage mock) and reports NOT_EARLIER_STAGE', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OWNER')
  const created = await service.createSession({ projectName: 'Mock', goal: 'Cel' })
  await assert.rejects(
    service.returnToStage(created.session.sessionId, 'task-x', 'feedback', created.session.revision),
    (error: unknown) => error instanceof PlatformApiError && error.code === 'NOT_EARLIER_STAGE',
  )
})

test('mock VS1 service getWorkflow reflects the single BUSINESS_ANALYSIS stage state', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OWNER')
  const created = await service.createSession({ projectName: 'Mock', goal: 'Cel' })
  const beforeAnswer = await service.getWorkflow(created.session.sessionId)
  assert.equal(beforeAnswer.currentSpecialistTaskType, 'BUSINESS_ANALYSIS')
  assert.equal(beforeAnswer.chain[1]?.state, 'UPCOMING')
})
