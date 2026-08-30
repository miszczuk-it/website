import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisDetail } from '../src/components/AnalysisDetail.js'
import { formatUsd } from '../src/lib/workflow-labels.js'
import type { ArtifactResponse, ArtifactVersionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse, TaskResponse } from '../src/types.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'

// Owner UX Follow-up (GAP-017 §11-§18, §40): cost visible per revision, per
// stage, and as an analysis total -- server-owned numbers only, never
// "$NaN"/"undefined" for a Task/stage/analysis that never settled anything.

const SESSION_ID = '00000000-0000-4000-8000-000000000002'
function noop(): never { throw new Error('not called in this test') }

function baseExecution(overrides: Partial<ExecutionStatusResponse> = {}): ExecutionStatusResponse {
  return {
    contractVersion: '1.0', executionId: 'exe-1', status: 'LLM_RESULT_READY', revision: 1,
    attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null,
    workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null,
    actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false,
    retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
    updatedAt: '2026-08-29T10:00:00Z', pendingQuestion: null,
    ...overrides,
  }
}
function baseArtifact(overrides: Partial<ArtifactResponse> = {}): ArtifactResponse {
  return {
    contractVersion: '1.0', artifactId: 'art-1', projectId: 'prj-1', sessionId: SESSION_ID, taskId: 'task-1',
    executionId: 'exe-1', artifactType: 'PROJECT_PLAN', title: 'Plan projektu', status: 'READY_FOR_REVIEW',
    currentVersionId: 'ver-1', revision: 1, createdAt: '2026-08-29T09:00:00Z', updatedAt: '2026-08-29T09:00:00Z',
    ...overrides,
  }
}
function baseVersion(): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'ver-1', artifactId: 'art-1', versionNumber: 1, sourceAttemptId: null, contentText: 'Treść.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-29T09:00:00Z' }
}
function baseSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-29T09:00:00Z', projectName: 'Integracja ERP', ...overrides }
}
function task(taskType: TaskResponse['taskType'], id: string, overrides: Partial<TaskResponse> = {}): TaskResponse {
  return { contractVersion: '1.0', taskId: id, sessionId: SESSION_ID, taskType, status: 'RUNNING', revision: 1, ...overrides }
}
function detailFor(artifact: ArtifactResponse | null, session: SessionListItem = baseSession()): Vs1Detail {
  return { session, execution: baseExecution(), executionRevision: 1, artifact, versions: artifact ? [baseVersion()] : [] }
}
function render(workflow: SessionWorkflowResponse, artifact: ArtifactResponse | null = baseArtifact()): string {
  return renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(artifact), workflowResponse: workflow, busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: null, onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
}

test('formatUsd renders four decimals, an em-dash for null/undefined, never NaN', () => {
  assert.equal(formatUsd(0.0039), '$0.0039')
  assert.equal(formatUsd(null), '—')
  assert.equal(formatUsd(undefined), '—')
  assert.equal(formatUsd(0), '$0.0000')
})

test('AnalysisDetail shows the analysis total cost with USD currency next to workflow progress', () => {
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [
      { taskType: 'BUSINESS_ANALYSIS', state: 'COMPLETED', activeTask: task('BUSINESS_ANALYSIS', 'task-ba', { status: 'COMPLETED', costUsd: 0.0028 }), activeArtifact: null, historicalTasks: [], stageCostUsd: 0.0028 },
      { taskType: 'PROJECT_PLANNING', state: 'CURRENT', activeTask: task('PROJECT_PLANNING', 'task-pm', { costUsd: 0.0018 }), activeArtifact: null, historicalTasks: [], stageCostUsd: 0.0018 },
      { taskType: 'CODE_IMPLEMENTATION', state: 'UPCOMING', activeTask: null, activeArtifact: null, historicalTasks: [] },
      { taskType: 'QUALITY_REVIEW', state: 'UPCOMING', activeTask: null, activeArtifact: null, historicalTasks: [] },
    ],
    currentStageIndex: 1, totalStages: 4, currentSpecialistTaskType: 'PROJECT_PLANNING', nextSpecialistTaskType: 'CODE_IMPLEMENTATION',
    analysisTotalCostUsd: 0.0046, costCurrency: 'USD',
  }
  const html = render(workflow)
  assert.ok(html.includes('Łączny koszt analizy'))
  assert.ok(html.includes('$0.0046'))
  assert.ok(html.includes('USD'))
})

test('AnalysisDetail omits the total-cost line entirely when nothing has settled yet (no "$NaN"/"undefined")', () => {
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{ taskType: 'BUSINESS_ANALYSIS', state: 'CURRENT', activeTask: task('BUSINESS_ANALYSIS', 'task-ba'), activeArtifact: null, historicalTasks: [] }],
    currentStageIndex: 0, totalStages: 4, currentSpecialistTaskType: 'BUSINESS_ANALYSIS', nextSpecialistTaskType: 'PROJECT_PLANNING',
    analysisTotalCostUsd: null, costCurrency: null,
  }
  const html = render(workflow)
  assert.equal(html.includes('Łączny koszt analizy'), false)
  assert.equal(html.includes('NaN'), false)
  assert.equal(html.includes('>undefined<'), false)
})

test('AnalysisDetail history shows per-revision cost and the stage total, summing every version', () => {
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{
      taskType: 'PROJECT_PLANNING', state: 'COMPLETED',
      activeTask: task('PROJECT_PLANNING', 'task-pm-v2', { status: 'COMPLETED', revision: 2, revisionOfTaskId: 'task-pm-v1', costUsd: 0.0018 }),
      activeArtifact: null,
      historicalTasks: [task('PROJECT_PLANNING', 'task-pm-v1', { status: 'COMPLETED', costUsd: 0.0021 })],
      stageCostUsd: 0.0039,
    }],
    currentStageIndex: 4, totalStages: 4, currentSpecialistTaskType: null, nextSpecialistTaskType: null,
  }
  const html = render(workflow)
  assert.ok(html.includes('$0.0021'), 'v1 cost visible')
  assert.ok(html.includes('$0.0018'), 'v2 cost visible')
  assert.ok(html.includes('Razem etap'))
  assert.ok(html.includes('$0.0039'), 'stage total visible')
})

test('AnalysisDetail history shows null cost for a Task never dispatched as an em-dash, not $NaN', () => {
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{ taskType: 'BUSINESS_ANALYSIS', state: 'CURRENT', activeTask: task('BUSINESS_ANALYSIS', 'task-ba', { costUsd: null }), activeArtifact: null, historicalTasks: [] }],
    currentStageIndex: 0, totalStages: 4, currentSpecialistTaskType: 'BUSINESS_ANALYSIS', nextSpecialistTaskType: 'PROJECT_PLANNING',
  }
  const html = render(workflow)
  assert.ok(html.includes('—'))
  assert.equal(html.includes('NaN'), false)
})
