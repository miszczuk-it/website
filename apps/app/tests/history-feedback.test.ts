import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisDetail } from '../src/components/AnalysisDetail.js'
import { REVISION_KIND_LABELS, revisionKindOf } from '../src/lib/workflow-labels.js'
import type { ArtifactResponse, ArtifactVersionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse } from '../src/types.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'

// Owner UX Follow-up (GAP-017 §19-§24, §41): "why was this revision
// created" must be readable in history, and CURRENT_STAGE_REVISION
// ("Poprawa bieżącego etapu") must be visually/textually distinct from
// RETURN_TO_STAGE ("Powrót do wcześniejszego etapu").

const SESSION_ID = '00000000-0000-4000-8000-000000000002'
function noop(): never { throw new Error('not called in this test') }

function baseExecution(): ExecutionStatusResponse {
  return {
    contractVersion: '1.0', executionId: 'exe-1', status: 'LLM_RESULT_READY', revision: 1,
    attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null,
    workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null,
    actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false,
    retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
    updatedAt: '2026-08-29T10:00:00Z', pendingQuestion: null,
  }
}
function baseArtifact(): ArtifactResponse {
  return { contractVersion: '1.0', artifactId: 'art-1', projectId: 'prj-1', sessionId: SESSION_ID, taskId: 'task-1', executionId: 'exe-1', artifactType: 'PROJECT_PLAN', title: 'Plan projektu', status: 'READY_FOR_REVIEW', currentVersionId: 'ver-1', revision: 1, createdAt: '2026-08-29T09:00:00Z', updatedAt: '2026-08-29T09:00:00Z' }
}
function baseVersion(): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'ver-1', artifactId: 'art-1', versionNumber: 1, sourceAttemptId: null, contentText: 'Treść.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-29T09:00:00Z' }
}
function baseSession(): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-29T09:00:00Z', projectName: 'Integracja ERP' }
}
function detailFor(): Vs1Detail {
  return { session: baseSession(), execution: baseExecution(), executionRevision: 1, artifact: baseArtifact(), versions: [baseVersion()] }
}
function render(workflow: SessionWorkflowResponse): string {
  return renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(), workflowResponse: workflow, busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: null, onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
}

test('revisionKindOf distinguishes CURRENT_STAGE_REVISION, RETURN_TO_STAGE and "not a revision"', () => {
  assert.equal(revisionKindOf({ revisionOfTaskId: 'task-x', returnToStageSourceArtifactId: null }), 'CURRENT_STAGE_REVISION')
  assert.equal(revisionKindOf({ revisionOfTaskId: 'task-x', returnToStageSourceArtifactId: 'art-y' }), 'RETURN_TO_STAGE')
  assert.equal(revisionKindOf({}), null)
})

test('history shows the current-stage revision reason and the "Poprawa bieżącego etapu" badge, not "Powrót"', () => {
  const feedback = 'Plan jest zbyt rozbudowany. Ogranicz zakres do jednego endpointu.'
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{
      taskType: 'PROJECT_PLANNING', state: 'CURRENT',
      activeTask: { contractVersion: '1.0', taskId: 'task-pm-v2', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'RUNNING', revision: 1, revisionOfTaskId: 'task-pm-v1', returnToStageSourceArtifactId: null, revisionReason: feedback },
      activeArtifact: null,
      historicalTasks: [{ contractVersion: '1.0', taskId: 'task-pm-v1', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'COMPLETED', revision: 1 }],
    }],
    currentStageIndex: 1, totalStages: 4, currentSpecialistTaskType: 'PROJECT_PLANNING', nextSpecialistTaskType: 'CODE_IMPLEMENTATION',
  }
  const html = render(workflow)
  assert.ok(html.includes(REVISION_KIND_LABELS.CURRENT_STAGE_REVISION), '"Poprawa bieżącego etapu" badge present')
  assert.equal(html.includes(REVISION_KIND_LABELS.RETURN_TO_STAGE), false)
  assert.ok(html.includes(feedback), 'the feedback text itself is readable, not just the badge')
  assert.ok(html.includes('Powód'))
})

test('history shows the return-to-stage reason and the "Powrót do wcześniejszego etapu" badge, not "Poprawa"', () => {
  const feedback = 'Uprość plan i ogranicz implementację do jednego endpointu GET.'
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{
      taskType: 'PROJECT_PLANNING', state: 'CURRENT',
      activeTask: { contractVersion: '1.0', taskId: 'task-pm-v2', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'RUNNING', revision: 1, revisionOfTaskId: 'task-pm-v1', returnToStageSourceArtifactId: 'art-pm-v1', revisionReason: feedback },
      activeArtifact: null,
      historicalTasks: [{ contractVersion: '1.0', taskId: 'task-pm-v1', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'COMPLETED', revision: 1 }],
    }],
    currentStageIndex: 1, totalStages: 4, currentSpecialistTaskType: 'PROJECT_PLANNING', nextSpecialistTaskType: 'CODE_IMPLEMENTATION',
  }
  const html = render(workflow)
  assert.ok(html.includes(REVISION_KIND_LABELS.RETURN_TO_STAGE))
  assert.equal(html.includes(REVISION_KIND_LABELS.CURRENT_STAGE_REVISION), false)
  assert.ok(html.includes(feedback))
})

test('history shows no revision badge/feedback for a Task that is not a revision at all', () => {
  const workflow: SessionWorkflowResponse = {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{
      taskType: 'BUSINESS_ANALYSIS', state: 'COMPLETED',
      activeTask: { contractVersion: '1.0', taskId: 'task-ba', sessionId: SESSION_ID, taskType: 'BUSINESS_ANALYSIS', status: 'COMPLETED', revision: 1 },
      activeArtifact: null, historicalTasks: [],
    }],
    currentStageIndex: 4, totalStages: 4, currentSpecialistTaskType: null, nextSpecialistTaskType: null,
  }
  const html = render(workflow)
  assert.equal(html.includes(REVISION_KIND_LABELS.CURRENT_STAGE_REVISION), false)
  assert.equal(html.includes(REVISION_KIND_LABELS.RETURN_TO_STAGE), false)
  assert.equal(html.includes('Powód'), false)
})
