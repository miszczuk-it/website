import assert from 'node:assert/strict'
import test from 'node:test'
import { watchOpenAnalysis } from '../src/lib/vs1-service.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'
import type { ExecutionStatusResponse, SessionListItem } from '../src/types.js'

// BUG-1 regression coverage (PROD UX hotfix, 2026-08-30): watchOpenAnalysis
// is the mechanism that keeps an already-open analysis live once its
// Execution is still in flight -- see its own comment in vs1-service.ts for
// why waitForExecution()'s short bounded wait alone is not enough for a real
// specialist call. Tested the same way this repo already tests
// trackExecutionStatus in frontend.test.ts: inject a synchronous `wait` so
// the interval never actually sleeps, and assert on the resulting sequence
// of onDetail calls -- no fireEvent/userEvent/timers anywhere, matching the
// rest of this suite's convention (see analysis-workspace-ux.test.ts).

const SESSION_ID = 'ses-watch-1'

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'owner-1', status: 'ACTIVE', revision: 1, createdAt: '2026-08-30T09:00:00Z', ...overrides }
}

function execution(status: ExecutionStatusResponse['status'], overrides: Partial<ExecutionStatusResponse> = {}): ExecutionStatusResponse {
  return {
    contractVersion: '1.0', executionId: 'exe-1', status, revision: 1,
    attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null,
    workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null,
    actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false,
    retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
    updatedAt: '2026-08-30T09:00:00Z', pendingQuestion: null, ...overrides,
  }
}

function detailWith(status: ExecutionStatusResponse['status'], hasArtifact: boolean): Vs1Detail {
  return {
    session: session(),
    execution: execution(status),
    executionRevision: 1,
    artifact: hasArtifact ? {
      contractVersion: '1.0', artifactId: 'art-1', projectId: 'prj-1', sessionId: SESSION_ID, taskId: 'task-1',
      executionId: 'exe-1', artifactType: 'ANALYSIS', title: 'Wynik analizy', status: 'READY_FOR_REVIEW',
      currentVersionId: 'ver-1', revision: 1, createdAt: '2026-08-30T09:00:00Z', updatedAt: '2026-08-30T09:00:00Z',
    } : null,
    versions: [],
  }
}

// Scenario B (task §12): the Execution reaches a terminal status before the
// Artifact becomes readable through the same GET -- getDetail()'s own
// ensureArtifact() already recovers this (a NOT_FOUND on the first read is
// not final), so watchOpenAnalysis only has to keep polling getDetail()
// until an Artifact shows up; it must not stop early just because the
// Execution itself already looks terminal.
test('watchOpenAnalysis: Scenario A (immediate) -- Execution COMPLETED and Artifact already available stops after one tick', async () => {
  let calls = 0
  const service = { getDetail: async () => { calls += 1; return detailWith('LLM_RESULT_READY', true) } }
  const observed: Vs1Detail[] = []
  const controller = watchOpenAnalysis(service, SESSION_ID, { wait: async () => {}, onDetail: (detail) => observed.push(detail) })
  await controller.whenDone
  assert.equal(calls, 1)
  assert.equal(observed.length, 1)
  assert.ok(observed[0]!.artifact, 'the Artifact must be present in the first observed detail')
})

test('watchOpenAnalysis: Scenario B (delayed Artifact) -- keeps polling while RUNNING, then reports the Artifact once ready', async () => {
  const sequence: Array<[ExecutionStatusResponse['status'], boolean]> = [['RUNNING', false], ['RUNNING', false], ['LLM_RESULT_READY', true]]
  let index = 0
  const service = { getDetail: async () => { const [status, hasArtifact] = sequence[index++]!; return detailWith(status, hasArtifact) } }
  const observed: Vs1Detail[] = []
  const controller = watchOpenAnalysis(service, SESSION_ID, { wait: async () => {}, onDetail: (detail) => observed.push(detail) })
  await controller.whenDone
  assert.equal(observed.length, 3, 'polling stops immediately once a terminal status with content is observed')
  assert.equal(observed[0]!.artifact, null)
  assert.equal(observed[1]!.artifact, null)
  assert.ok(observed[2]!.artifact, 'the Artifact must appear automatically once the backend has it, without any extra caller action')
})

test('watchOpenAnalysis: Scenario C (stale UI regression) -- reuses the same getDetail() a manual reopen would call, never a second endpoint', async () => {
  const seen: string[] = []
  const service = { getDetail: async (sessionId: string) => { seen.push(sessionId); return detailWith('LLM_RESULT_READY', true) } }
  const controller = watchOpenAnalysis(service, SESSION_ID, { wait: async () => {} })
  await controller.whenDone
  assert.deepEqual(seen, [SESSION_ID], 'no navigation and no separate polling endpoint -- the same canonical getDetail(sessionId) call a manual reopen would make')
})

test('watchOpenAnalysis: Scenario D (timeout) -- bounded stop when the Execution never reaches a terminal status, never an infinite loop', async () => {
  let calls = 0
  const service = { getDetail: async () => { calls += 1; return detailWith('RUNNING', false) } }
  const observed: Vs1Detail[] = []
  const controller = watchOpenAnalysis(service, SESSION_ID, { wait: async () => {}, maxAttempts: 5, onDetail: (detail) => observed.push(detail) })
  await controller.whenDone
  assert.equal(calls, 5, 'polling must stop at the configured bound, not continue forever')
  assert.equal(observed.length, 5)
})

test('watchOpenAnalysis: stop() ends polling immediately (simulates leaving the analysis / component unmount)', async () => {
  let calls = 0
  const service = { getDetail: async () => { calls += 1; return detailWith('RUNNING', false) } }
  const controller = watchOpenAnalysis(service, SESSION_ID, {
    wait: async () => {},
    onDetail: () => controller.stop(),
  })
  await controller.whenDone
  const callsWhenStopped = calls
  assert.equal(callsWhenStopped, 1)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls, callsWhenStopped, 'no further requests after stop()')
})

test('watchOpenAnalysis: a getDetail() failure reports onError and stops, without retrying forever', async () => {
  let calls = 0
  const service = { getDetail: async () => { calls += 1; throw new Error('network error') } }
  let errorSeen: unknown = null
  const controller = watchOpenAnalysis(service, SESSION_ID, { wait: async () => {}, onError: (error) => { errorSeen = error } })
  await controller.whenDone
  assert.equal(calls, 1)
  assert.ok(errorSeen instanceof Error)
})
