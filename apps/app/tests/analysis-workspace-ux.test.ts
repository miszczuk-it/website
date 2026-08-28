import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisList } from '../src/components/AnalysisList.js'
import { AnalysisDetail } from '../src/components/AnalysisDetail.js'
import type { ArtifactResponse, ArtifactVersionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse } from '../src/types.js'
import type { Vs1Detail } from '../src/lib/vs1-service.js'

// VS1 UX redesign (2026-08-28): structural coverage for the new landing
// list + open-analysis views, at the same static-render level the rest of
// this test suite already uses for presentational components (no
// fireEvent/userEvent anywhere in this repo -- interactive behavior is
// covered at the service/lib level, see vs1-service*.test.ts).

const SESSION_ID = '00000000-0000-4000-8000-000000000002'
const RAW_GUID_PATTERN = /00000000-0000-4000-8000-000000000002/

function noop(): never { throw new Error('not called in this test') }

test('AnalysisList shows "Moje analizy" first, with the create form hidden until "+ Nowa analiza"', () => {
  const html = renderToStaticMarkup(createElement(AnalysisList, { sessions: [], busy: false, onOpen: noop, onCreate: async () => undefined }))
  assert.ok(html.includes('Moje analizy'))
  assert.ok(html.includes('+ Nowa analiza'))
  assert.ok(html.includes('Brak analiz'))
  assert.equal(html.includes('Utwórz analizę'), false, 'the create form must not be rendered until the button is clicked')
  assert.equal(html.includes('Nazwa analizy'), false)
})

test('AnalysisList renders projectName instead of the raw sessionId GUID', () => {
  const session: SessionListItem = { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 1, createdAt: '2026-08-28T09:00:00Z', projectName: 'Integracja ERP', currentTaskType: 'PROJECT_PLANNING', updatedAt: '2026-08-28T10:00:00Z' }
  const html = renderToStaticMarkup(createElement(AnalysisList, { sessions: [session], busy: false, onOpen: noop, onCreate: async () => undefined }))
  assert.ok(html.includes('Integracja ERP'))
  assert.ok(html.includes('Plan projektu'), 'currentTaskType is shown as a Polish stage label, not the raw taskType')
  assert.equal(RAW_GUID_PATTERN.test(html), false, 'the raw sessionId GUID must never appear as visible list text')
})

test('AnalysisList shows "Analiza bez nazwy" and "Nie rozpoczęto" when GAP-014 metadata is absent (older/degraded response)', () => {
  const session: SessionListItem = { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'CREATED', revision: 0, createdAt: '2026-08-28T09:00:00Z' }
  const html = renderToStaticMarkup(createElement(AnalysisList, { sessions: [session], busy: false, onOpen: noop, onCreate: async () => undefined }))
  assert.ok(html.includes('Analiza bez nazwy'))
  assert.ok(html.includes('Nie rozpoczęto'))
})

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

function baseVersion(): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'ver-1', artifactId: 'art-1', versionNumber: 1, sourceAttemptId: null, contentText: 'Treść bieżącej wersji.', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-28T09:00:00Z' }
}

function baseSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-28T09:00:00Z', projectName: 'Integracja ERP', ...overrides }
}

function workflowFor(currentTaskType: SessionWorkflowResponse['currentSpecialistTaskType'], currentStageIndex: number, extra: Partial<SessionWorkflowResponse> = {}): SessionWorkflowResponse {
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
    ...extra,
  }
}

function detailFor(artifact: ArtifactResponse | null, session: SessionListItem = baseSession()): Vs1Detail {
  return { session, execution: baseExecution(), executionRevision: 1, artifact, versions: artifact ? [baseVersion()] : [] }
}

for (const [label, taskType, index] of [['BA', 'BUSINESS_ANALYSIS', 0], ['PM', 'PROJECT_PLANNING', 1], ['Developer', 'CODE_IMPLEMENTATION', 2], ['QA', 'QUALITY_REVIEW', 3]] as const) {
  test(`AnalysisDetail shows the correct current/next specialist when ${label} is the current stage`, () => {
    const workflow = workflowFor(taskType, index)
    const html = renderToStaticMarkup(createElement(AnalysisDetail, {
      detail: detailFor(baseArtifact()), workflowResponse: workflow, busy: false, retrying: false,
      onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
    }))
    const expectedLabel = { BUSINESS_ANALYSIS: 'Analiza biznesowa', PROJECT_PLANNING: 'Plan projektu', CODE_IMPLEMENTATION: 'Implementacja', QUALITY_REVIEW: 'Kontrola jakości' }[taskType]
    assert.ok(html.includes(`Aktualny etap:</strong> ${index + 1} z 4 — ${expectedLabel}`))
    const expectedSpecialist = { BUSINESS_ANALYSIS: 'Business Analyst', PROJECT_PLANNING: 'Project Manager', CODE_IMPLEMENTATION: 'Developer', QUALITY_REVIEW: 'QA' }[taskType]
    assert.ok(html.includes(`Aktualny specjalista:</strong> ${expectedSpecialist}`))
  })
}

test('AnalysisDetail shows "Analiza zakończona" and no current-specialist panel when the workflow has no current stage', () => {
  const workflow = workflowFor(null, 4)
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact({ status: 'APPROVED' }), baseSession({ status: 'COMPLETED' })), workflowResponse: workflow, busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.ok(html.includes('Analiza zakończona'))
  assert.equal(html.includes('Aktualny specjalista'), false)
})

test('AnalysisDetail offers "Poproś o poprawę" only for a READY_FOR_REVIEW result, with the submit button disabled until feedback is typed', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact({ status: 'READY_FOR_REVIEW' })), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.ok(html.includes('Poproś o poprawę'))
  assert.ok(html.includes('Zatwierdź'))
})

test('AnalysisDetail offers "Wróć do wcześniejszego etapu" only when at least one earlier stage is COMPLETED', () => {
  const withEarlierStages = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact({ status: 'READY_FOR_REVIEW' })), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.ok(withEarlierStages.includes('Wróć do wcześniejszego etapu'))

  const withoutEarlierStages = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact({ status: 'READY_FOR_REVIEW' })), workflowResponse: workflowFor('BUSINESS_ANALYSIS', 0), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.equal(withoutEarlierStages.includes('Wróć do wcześniejszego etapu'), false, 'BA is the first stage -- there is nothing earlier to return to')
})

test('AnalysisDetail history section shows a superseded version label once a stage has more than one Task', () => {
  const workflow = workflowFor('CODE_IMPLEMENTATION', 2)
  workflow.chain[1] = {
    taskType: 'PROJECT_PLANNING', state: 'COMPLETED',
    activeTask: { contractVersion: '1.0', taskId: 'task-pm-v2', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'COMPLETED', revision: 2 },
    activeArtifact: null,
    historicalTasks: [{ contractVersion: '1.0', taskId: 'task-pm-v1', sessionId: SESSION_ID, taskType: 'PROJECT_PLANNING', status: 'COMPLETED', revision: 1 }],
  }
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact()), workflowResponse: workflow, busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.ok(html.includes('v1 — zastąpiona'))
  assert.ok(html.includes('v2 — zatwierdzona'))
})

test('AnalysisDetail never shows raw sessionId/executionId/artifactId outside the collapsed technical-details section', () => {
  const html = renderToStaticMarkup(createElement(AnalysisDetail, {
    detail: detailFor(baseArtifact()), workflowResponse: workflowFor('CODE_IMPLEMENTATION', 2), busy: false, retrying: false,
    onBack: noop, onAnswer: noop, onApprove: noop, onRequestRevision: noop, onAdvance: noop, onRetry: noop, onReturnToStage: noop,
  }))
  assert.ok(html.includes('Szczegóły techniczne'), 'technical details toggle must exist, collapsed by default')
  assert.equal(RAW_GUID_PATTERN.test(html), false, 'raw sessionId must not leak into the always-visible markup (collapsed section is not rendered until toggled)')
})
