import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisDetail } from '../src/components/AnalysisDetail.js'
import type { ArtifactResponse, ArtifactVersionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse } from '../src/types.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'

// Owner UX Follow-up (GAP-017 §25-§31, §38): "Podgląd" opens a read-only
// historical-result view with no mutation actions at all, and "Wróć do
// aktualnego etapu" returns to the normal, fully-actionable view.

const SESSION_ID = '00000000-0000-4000-8000-000000000002'
const MUTATION_LABELS = ['Zatwierdź', 'Poproś o poprawę', 'Wróć do wcześniejszego etapu', 'Ponów wykonanie', 'Przejdź do:']
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
function baseArtifact(overrides: Partial<ArtifactResponse> = {}): ArtifactResponse {
  return { contractVersion: '1.0', artifactId: 'art-1', projectId: 'prj-1', sessionId: SESSION_ID, taskId: 'task-1', executionId: 'exe-1', artifactType: 'PROJECT_PLAN', title: 'Plan projektu', status: 'READY_FOR_REVIEW', currentVersionId: 'ver-1', revision: 1, createdAt: '2026-08-29T09:00:00Z', updatedAt: '2026-08-29T09:00:00Z', ...overrides }
}
function baseVersion(overrides: Partial<ArtifactVersionResponse> = {}): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'ver-1', artifactId: 'art-1', versionNumber: 1, sourceAttemptId: null, contentText: 'Treść historycznego planu.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-29T09:00:00Z', ...overrides }
}
function baseSession(): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-29T09:00:00Z', projectName: 'Integracja ERP' }
}
function detailFor(): Vs1Detail {
  return { session: baseSession(), execution: baseExecution(), executionRevision: 1, artifact: baseArtifact(), versions: [baseVersion()] }
}
function workflowWithHistory(): SessionWorkflowResponse {
  return {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: 'ACTIVE',
    chain: [{
      taskType: 'PROJECT_PLANNING', state: 'CURRENT',
      activeTask: { contractVersion: '1.0', taskId: 'task-pm-v2', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'RUNNING', revision: 1, artifactId: 'art-pm-v2' },
      activeArtifact: null,
      historicalTasks: [{ contractVersion: '1.0', taskId: 'task-pm-v1', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'COMPLETED', revision: 1, artifactId: 'art-pm-v1' }],
    }],
    currentStageIndex: 1, totalStages: 4, currentSpecialistTaskType: 'PROJECT_PLANNING', nextSpecialistTaskType: 'CODE_IMPLEMENTATION',
  }
}

test('history offers a "Podgląd" button for every entry that has an artifactId', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(), workflowResponse: workflowWithHistory(), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: null, onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
  assert.equal((html.match(/Podgląd/g) ?? []).length, 2, 'both the historical v1 and the current v2 entry offer Podgląd')
})

test('history omits "Podgląd" for an entry with no artifactId (never produced an Artifact)', () => {
  const workflow = workflowWithHistory()
  workflow.chain[0]!.historicalTasks[0]!.artifactId = null
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(), workflowResponse: workflow, busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: null, onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
  assert.equal((html.match(/Podgląd/g) ?? []).length, 1, 'only the current entry (with an artifactId) offers Podgląd')
})

test('the preview view shows historical content and status, with no mutation action and no raw current-stage panel', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(), workflowResponse: workflowWithHistory(), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: { artifact: baseArtifact({ status: 'APPROVED', title: 'Plan projektu — wersja 1' }), versions: [baseVersion({ contentText: 'Treść zatwierdzonej wersji 1.' })] },
    onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
  assert.ok(html.includes('Treść zatwierdzonej wersji 1.'))
  assert.ok(html.includes('Zatwierdzona'), 'artifact status label shown')
  assert.ok(html.includes('Wróć do aktualnego etapu'))
  for (const label of MUTATION_LABELS) {
    assert.equal(html.includes(label), false, `"${label}" must never appear in the read-only preview`)
  }
  assert.equal(html.includes('Aktualny wynik'), false, 'the current-stage actionable section is not rendered while previewing')
})

test('the normal (non-preview) view keeps its full actionable content', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(), workflowResponse: workflowWithHistory(), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    preview: null, onPreview: noop, onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null, contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
  }))
  assert.ok(html.includes('Aktualny wynik'))
  assert.ok(html.includes('Zatwierdź'))
  assert.equal(html.includes('Wróć do aktualnego etapu'), false)
})
