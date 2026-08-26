import assert from 'node:assert/strict'
import test from 'node:test'
import { PlatformApiError } from '../src/lib/safe-error.js'
import { createRealVs1Service } from '../src/lib/vs1-service.js'

// Fakes the real backend's HTTP shapes (frontend-backend-contract-pack.md
// §4-§8, cross-checked directly against ai-platform's app.mjs on `main`
// after PR #49) so createRealVs1Service can be exercised without a live
// server. Execution status is scripted to resolve to a non-polling status
// on the very first read after each mutation, so the adapter's internal
// waitForExecution() takes its immediate fast path instead of driving
// execution-flow.ts's real 2.5s interval polling (which has its own
// coverage in frontend.test.ts).
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
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
    } as Response
  }) as typeof fetch
}

test('real VS1 adapter drives AUTH -> session list -> create -> answer -> approve against the real endpoint shapes', async () => {
  const sessionId = 'ses-1', projectId = 'prj-1', taskId = 'task-1', executionId = 'exe-1', artifactId = 'art-1', versionId = 'ver-1'
  const fetchImpl = fakeFetch([
    { method: 'POST', path: '/auth/dev-login', respond: () => ({ status: 200, body: { contractVersion: '1.0', userId: 'dev-owner', displayName: 'DEV OWNER', effectiveRole: 'OWNER', permissions: ['session.view', 'session.create', 'session.answer_question', 'session.approve'] } }) },
    { method: 'GET', path: '/auth/me', respond: () => ({ status: 200, body: { contractVersion: '1.0', userId: 'dev-owner', displayName: 'DEV OWNER', effectiveRole: 'OWNER', permissions: ['session.view'] } }) },
    { method: 'GET', path: '/sessions?ownerId=me', respond: () => ({ status: 200, body: [{ contractVersion: '1.0', sessionId, projectId, ownerId: 'dev-owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-26T09:00:00Z' }] }) },
    { method: 'POST', path: '/projects', respond: () => ({ status: 201, body: { contractVersion: '1.0', projectId, status: 'ACTIVE', revision: 0 } }) },
    { method: 'POST', path: `/projects/${projectId}/sessions`, respond: () => ({ status: 201, body: { contractVersion: '1.0', sessionId, projectId, ownerId: 'dev-owner', status: 'CREATED', revision: 0, createdAt: '2026-08-26T09:00:00Z' } }) },
    { method: 'POST', path: `/sessions/${sessionId}/start`, respond: () => ({ status: 200, body: { contractVersion: '1.0', sessionId, projectId, ownerId: 'dev-owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-26T09:00:00Z', startedAt: '2026-08-26T09:00:01Z' } }) },
    { method: 'POST', path: `/sessions/${sessionId}/tasks`, respond: () => ({ status: 201, body: { contractVersion: '1.0', taskId, sessionId, status: 'CREATED', revision: 0 } }) },
    { method: 'POST', path: `/tasks/${taskId}/ready`, respond: () => ({ status: 200, body: { contractVersion: '1.0', taskId, sessionId, status: 'READY', revision: 1 } }) },
    { method: 'POST', path: `/tasks/${taskId}/executions`, respond: () => ({ status: 201, body: { contractVersion: '1.0', executionId, taskId, correlationId: 'c-1', idempotencyKey: 'k-1', status: 'CREATED', revision: 0 } }) },
    { method: 'GET', path: `/executions/${executionId}/status`, respond: (() => {
      let call = 0
      return () => {
        call += 1
        // 1st read (after createSession's startExecution): question is already pending.
        // 2nd read (waitForExecution's fast path right after answer): result is ready.
        // 3rd+ read (approve's final refresh): stays LLM_RESULT_READY.
        if (call === 1) return { status: 200, body: { contractVersion: '1.0', executionId, status: 'WAITING_FOR_USER_INPUT', revision: 1, retryAllowed: false, reconcileRequired: false, updatedAt: '2026-08-26T09:01:00Z', pendingQuestion: { questionId: 'q-1', prompt: 'Jaki jest zakres?', inputSchema: null } } }
        return { status: 200, body: { contractVersion: '1.0', executionId, status: 'LLM_RESULT_READY', revision: 2, retryAllowed: false, reconcileRequired: false, updatedAt: '2026-08-26T09:02:00Z', pendingQuestion: null } }
      }
    })() },
    { method: 'POST', path: `/executions/${executionId}/answer`, respond: () => ({ status: 200, body: { contractVersion: '1.0', executionId, status: 'RUNNING', revision: 2, retryAllowed: false, reconcileRequired: false, updatedAt: '2026-08-26T09:01:30Z', pendingQuestion: null } }) },
    { method: 'POST', path: `/executions/${executionId}/artifacts`, respond: () => ({ status: 201, body: { contractVersion: '1.0', artifactId, projectId, sessionId, taskId, executionId, artifactType: 'ANALYSIS', title: 'Wynik analizy', status: 'READY_FOR_REVIEW', currentVersionId: versionId, revision: 1, createdAt: '2026-08-26T09:02:01Z', updatedAt: '2026-08-26T09:02:01Z' } }) },
    { method: 'GET', path: `/artifacts/${artifactId}`, respond: () => ({ status: 200, body: { contractVersion: '1.0', artifactId, projectId, sessionId, taskId, executionId, artifactType: 'ANALYSIS', title: 'Wynik analizy', status: 'APPROVED', currentVersionId: versionId, revision: 2, createdAt: '2026-08-26T09:02:01Z', updatedAt: '2026-08-26T09:03:00Z' } }) },
    { method: 'GET', path: `/artifacts/${artifactId}/versions`, respond: () => ({ status: 200, body: [{ contractVersion: '1.0', artifactVersionId: versionId, artifactId, versionNumber: 1, sourceAttemptId: null, contentText: 'Odpowiedź: Tylko odczyt.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:a-1', createdAt: '2026-08-26T09:02:01Z' }] }) },
    { method: 'GET', path: `/executions/${executionId}`, respond: () => ({ status: 200, body: { contractVersion: '1.0', executionId, taskId, correlationId: 'c-1', idempotencyKey: 'k-1', status: 'LLM_RESULT_READY', revision: 2 } }) },
    { method: 'GET', path: `/tasks/${taskId}`, respond: () => ({ status: 200, body: { contractVersion: '1.0', taskId, sessionId, status: 'READY', revision: 1 } }) },
    { method: 'GET', path: `/sessions/${sessionId}`, respond: (() => {
      let call = 0
      return () => {
        call += 1
        // 1st resolution (inside answer()): still ACTIVE. 2nd (inside
        // approve()): backend completed it (GAP-010), source of truth.
        if (call === 1) return { status: 200, body: { contractVersion: '1.0', sessionId, projectId, ownerId: 'dev-owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-26T09:00:00Z' } }
        return { status: 200, body: { contractVersion: '1.0', sessionId, projectId, ownerId: 'dev-owner', status: 'COMPLETED', revision: 2, createdAt: '2026-08-26T09:00:00Z', completedAt: '2026-08-26T09:03:00Z' } }
      }
    })() },
    { method: 'POST', path: `/artifacts/${artifactId}/decisions`, respond: () => ({ status: 201, body: { contractVersion: '1.0', reviewDecision: { contractVersion: '1.0', decisionId: 'dec-1', artifactId, artifactVersionId: versionId, decisionType: 'APPROVE', comment: null, actorType: 'HUMAN', actorReference: 'dev-owner', idempotencyKey: 'k-2', createdAt: '2026-08-26T09:03:00Z' }, triggeredExecutionId: null } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const service = createRealVs1Service(BASE)
    const identity = await service.devLogin('OWNER')
    assert.equal(identity.effectiveRole, 'OWNER')
    assert.equal((await service.listSessions()).length, 1)

    const created = await service.createSession({ projectName: 'Projekt VS1', goal: 'Zakres integracji' })
    assert.equal(created.session.sessionId, sessionId)
    assert.equal(created.execution.status, 'WAITING_FOR_USER_INPUT')
    assert.equal(created.executionRevision, 1)

    const answered = await service.answer(executionId, created.executionRevision, 'q-1', 'Tylko odczyt.')
    assert.equal(answered.execution.status, 'LLM_RESULT_READY')
    assert.equal(answered.artifact?.status, 'READY_FOR_REVIEW')
    assert.equal(answered.versions[0]?.artifactVersionId, versionId)
    assert.equal(answered.session.status, 'ACTIVE')

    const completed = await service.approve(answered.artifact!, answered.versions[0]!)
    assert.equal(completed.artifact?.status, 'APPROVED')
    assert.equal(completed.session.status, 'COMPLETED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('real VS1 adapter surfaces a 409 revision conflict from answer() as a machine-readable PlatformApiError', async () => {
  const executionId = 'exe-conflict'
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/executions/${executionId}/answer`, respond: () => ({ status: 409, body: { contractVersion: '1.0', errorCode: 'CONFLICT', message: 'Zasób został zmieniony przez inne żądanie.', correlationId: 'corr-1', currentRevision: 5 } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const service = createRealVs1Service(BASE)
    await assert.rejects(
      service.answer(executionId, 1, 'q-1', 'Odpowiedź'),
      (error: unknown) => error instanceof PlatformApiError && error.code === 'CONFLICT' && error.currentRevision === 5,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('real VS1 adapter rejects answer() with CONTRACT_MISMATCH when no expectedRevision is known yet', async () => {
  const service = createRealVs1Service(BASE)
  await assert.rejects(
    service.answer('exe-x', null, 'q-1', 'Odpowiedź'),
    (error: unknown) => error instanceof PlatformApiError && error.code === 'CONTRACT_MISMATCH',
  )
})
