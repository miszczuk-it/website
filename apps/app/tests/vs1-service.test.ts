import assert from 'node:assert/strict'
import test from 'node:test'
import { PlatformApiError } from '../src/lib/safe-error.js'
import { createMockVs1Service } from '../src/lib/vs1-service.js'

test('VS1 mock bootstraps auth, lists a created Session and completes the full Owner path', async () => {
  const service = createMockVs1Service()
  await assert.rejects(service.me(), (error: unknown) => error instanceof PlatformApiError && error.code === 'UNAUTHENTICATED')
  const user = await service.devLogin('OWNER')
  assert.equal(user.effectiveRole, 'OWNER')
  const created = await service.createSession({ projectName: 'Projekt VS1', goal: 'Zakres integracji' })
  assert.equal((await service.listSessions()).length, 1)
  assert.equal(created.execution.status, 'WAITING_FOR_USER_INPUT')
  const afterAnswer = await service.answer(created.execution.executionId, created.executionRevision, created.execution.pendingQuestion!.questionId, 'Tylko odczyt.')
  assert.equal(afterAnswer.artifact?.status, 'READY_FOR_REVIEW')
  const completed = await service.approve(afterAnswer.artifact!, afterAnswer.versions[0]!)
  assert.equal(completed.artifact?.status, 'APPROVED')
  assert.equal(completed.session.status, 'COMPLETED')
})

test('VS1 mock enforces authorization, validation and stale-state errors through machine-readable codes', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OBSERVER')
  await assert.rejects(service.createSession({ projectName: 'X', goal: 'Y' }), (error: unknown) => error instanceof PlatformApiError && error.code === 'NOT_AUTHORIZED')
  await service.devLogin('OWNER')
  const detail = await service.createSession({ projectName: 'X', goal: 'Y' })
  await assert.rejects(service.answer(detail.execution.executionId, detail.executionRevision, detail.execution.pendingQuestion!.questionId, '  '), (error: unknown) => error instanceof PlatformApiError && error.code === 'VALIDATION_ERROR')
  await assert.rejects(service.answer(detail.execution.executionId, 99, detail.execution.pendingQuestion!.questionId, 'OK'), (error: unknown) => error instanceof PlatformApiError && error.code === 'CONFLICT')
})
