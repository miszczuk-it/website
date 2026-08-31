import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisDetail } from '../src/components/AnalysisDetail.js'
import type { ArtifactResponse, ArtifactVersionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse } from '../src/types.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'

// BUG-2 regression coverage (PROD UX hotfix, 2026-08-30): Kopiuj/Pobierz
// must be visible on the component App.tsx actually mounts
// (VerticalSliceWorkspace -> AnalysisDetail), not only on the dead
// ArtifactReviewPanel/AnalysisWorkspace tree already covered elsewhere.
// Static-render structural checks, matching this suite's own convention (no
// fireEvent/userEvent anywhere -- see analysis-workspace-ux.test.ts).

const SESSION_ID = '00000000-0000-4000-8000-000000000002'

function noop(): never { throw new Error('not called in this test') }

function baseExecution(overrides: Partial<ExecutionStatusResponse> = {}): ExecutionStatusResponse {
  return {
    contractVersion: '1.0', executionId: 'exe-1', status: 'LLM_RESULT_READY', revision: 1,
    attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null,
    workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null,
    actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false,
    retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null,
    updatedAt: '2026-08-28T10:00:00Z', pendingQuestion: null,
    ...overrides,
  }
}

function baseArtifact(overrides: Partial<ArtifactResponse> = {}): ArtifactResponse {
  return {
    contractVersion: '1.0', artifactId: 'art-1', projectId: 'prj-1', sessionId: SESSION_ID, taskId: 'task-1',
    executionId: 'exe-1', artifactType: 'PROJECT_PLAN', title: 'Plan projektu', status: 'READY_FOR_REVIEW',
    currentVersionId: 'ver-1', revision: 1, createdAt: '2026-08-28T09:00:00Z', updatedAt: '2026-08-28T09:00:00Z',
    ...overrides,
  }
}

function baseVersion(overrides: Partial<ArtifactVersionResponse> = {}): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'ver-1', artifactId: 'art-1', versionNumber: 1, sourceAttemptId: null, contentText: 'Treść bieżącej wersji.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-28T09:00:00Z', ...overrides }
}

function baseSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-28T09:00:00Z', projectName: 'Integracja ERP', ...overrides }
}

function workflowFor(currentTaskType: SessionWorkflowResponse['currentSpecialistTaskType'], currentStageIndex: number): SessionWorkflowResponse {
  const order: SessionWorkflowResponse['chain'][number]['taskType'][] = ['BUSINESS_ANALYSIS', 'PROJECT_PLANNING', 'CODE_IMPLEMENTATION', 'QUALITY_REVIEW']
  const next: Record<string, SessionWorkflowResponse['nextSpecialistTaskType']> = { BUSINESS_ANALYSIS: 'PROJECT_PLANNING', PROJECT_PLANNING: 'CODE_IMPLEMENTATION', CODE_IMPLEMENTATION: 'QUALITY_REVIEW', QUALITY_REVIEW: null }
  return {
    contractVersion: '1.0', sessionId: SESSION_ID, sessionStatus: currentTaskType ? 'ACTIVE' : 'COMPLETED',
    chain: order.map((taskType, index) => ({
      taskType, state: index < currentStageIndex ? 'COMPLETED' : index === currentStageIndex ? 'CURRENT' : 'UPCOMING',
      activeTask: index <= currentStageIndex ? { contractVersion: '1.0', taskId: `task-${taskType}`, sessionId: SESSION_ID, taskType, status: 'RUNNING', revision: 1 } : null,
      activeArtifact: null, historicalTasks: [],
    })),
    currentStageIndex, totalStages: 4, currentSpecialistTaskType: currentTaskType, nextSpecialistTaskType: currentTaskType ? next[currentTaskType] : null,
  }
}

function detailFor(artifact: ArtifactResponse | null, execution: ExecutionStatusResponse = baseExecution()): Vs1Detail {
  return { session: baseSession(), execution, executionRevision: 1, artifact, versions: artifact ? [baseVersion()] : [] }
}

const BASE_PROPS = {
  busy: false, retrying: false,
  onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  onClosePreview: noop, sharedContext: null, contextVersions: null, canMutateContext: false, contextBusy: false, contextError: null,
  contextNotice: null, onAddContextEntry: noop, onEditContextEntry: noop, onApproveContextEntry: noop, onRejectContextEntry: noop,
}

test('AnalysisDetail: the current Artifact shows Kopiuj and both Pobierz actions', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    ...BASE_PROPS, detail: detailFor(baseArtifact()), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), preview: null, onPreview: noop,
  }))
  assert.ok(html.includes('>Kopiuj<'))
  assert.ok(html.includes('>Pobierz .md<'))
  assert.ok(html.includes('>Pobierz .txt<'))
})

test('AnalysisDetail: a historical read-only preview also shows Kopiuj/Pobierz, but no decision/retry/return actions', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    ...BASE_PROPS,
    detail: detailFor(baseArtifact()),
    workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2),
    onPreview: noop,
    preview: { artifact: baseArtifact({ artifactId: 'art-historical', status: 'APPROVED', title: 'Plan projektu — wersja 1' }), versions: [baseVersion({ artifactVersionId: 'ver-historical', contentText: 'Treść zatwierdzonej wersji 1.' })] },
  }))
  assert.ok(html.includes('>Kopiuj<'))
  assert.ok(html.includes('>Pobierz .md<'))
  assert.ok(html.includes('>Pobierz .txt<'))
  assert.equal(html.includes('Zatwierdź'), false, 'a historical read-only preview must never offer a decision action')
  assert.equal(html.includes('Poproś o poprawę'), false)
  assert.equal(html.includes('Ponów wykonanie'), false)
  assert.equal(html.includes('Wróć do wcześniejszego etapu'), false)
  assert.ok(html.includes('wyłącznie podgląd'), 'the read-only notice must still be present')
})

test('AnalysisDetail: export actions copy/download the currently displayed version, not always the latest', () => {
  // The preview panel is fed a specific historical version by the caller
  // (openPreview/getArtifactPreview) -- AnalysisDetail must render exactly
  // that version's own export filename/content, never the current one.
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    ...BASE_PROPS,
    detail: detailFor(baseArtifact()),
    workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2),
    onPreview: noop,
    preview: { artifact: baseArtifact({ title: 'Plan projektu' }), versions: [baseVersion({ artifactVersionId: 'ver-1', versionNumber: 2, contentText: 'Treść wersji 2 (historycznej).' })] },
  }))
  assert.ok(html.includes('Treść wersji 2 (historycznej).'))
  assert.equal(html.includes('Treść bieżącej wersji.'), false)
})

test('AnalysisDetail: shows a processing indicator while the agent is still working with no Artifact yet, and hides it once the Artifact exists', () => {
  const running = renderToStaticMarkup(createElement(AnalysisDetail, {
    ...BASE_PROPS, detail: detailFor(null, baseExecution({ status: 'RUNNING' })), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), preview: null, onPreview: noop,
  }))
  assert.ok(running.includes('Agent pracuje'))

  const ready = renderToStaticMarkup(createElement(AnalysisDetail, {
    ...BASE_PROPS, detail: detailFor(baseArtifact()), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), preview: null, onPreview: noop,
  }))
  assert.equal(ready.includes('Agent pracuje'), false)
})
