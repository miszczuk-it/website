import { PlatformApiError } from './safe-error.js'
import { createPlatformApiClient, type PlatformApiClient } from './platform-api.js'
import { EXECUTION_POLLING_STATUSES, trackExecutionStatus, type PollController } from './execution-flow.js'
import type { ArtifactResponse, ArtifactVersionResponse, AuthMeResponse, EffectiveRole, ExecutionResponse, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse } from '../types.js'

export type Vs1Detail = {
  session: SessionListItem
  execution: ExecutionStatusResponse
  // Application state only. It is not copied into the API response; the
  // published execution-status schema currently does not expose this value.
  executionRevision: number | null
  artifact: ArtifactResponse | null
  versions: ArtifactVersionResponse[]
}

export interface Vs1Service {
  me(): Promise<AuthMeResponse>
  devLogin(role: EffectiveRole): Promise<AuthMeResponse>
  logout(): Promise<void>
  listSessions(): Promise<SessionListItem[]>
  // Owner UX Follow-up (GAP-017): soft-delete/archive "Moje analizy" -- the
  // archived analysis simply stops appearing in listSessions() afterwards;
  // history/audit/cost is untouched server-side.
  archiveSession(sessionId: string, expectedRevision: number): Promise<void>
  createSession(input: { projectName: string; goal: string }): Promise<Vs1Detail>
  getDetail(sessionId: string): Promise<Vs1Detail>
  answer(executionId: string, expectedRevision: number | null, questionId: string, answer: string): Promise<Vs1Detail>
  approve(artifact: ArtifactResponse, version: ArtifactVersionResponse): Promise<Vs1Detail>
  // Creates and starts the next stage of the fixed BA->PM->Developer->QA
  // specialist chain (specialist-handoff.mjs's NEXT map) from an APPROVED,
  // non-terminal Artifact. Approval alone never advances the chain -- the
  // backend requires this as a separate, explicit step
  // (POST /artifacts/{id}/next-specialist, then starting that Task's
  // Execution), which had no caller anywhere in this frontend until now
  // (confirmed as the Local UI / Browser Validation blocker, 2026-08-28).
  advanceToNextSpecialist(artifactId: string): Promise<Vs1Detail>
  // Technical retry of a FAILED_RETRYABLE Execution: same Execution, a new
  // Attempt -- never a new Task/Session. The caller (VerticalSliceWorkspace)
  // only ever offers this when the backend's own ExecutionStatusResponse
  // says retryAllowed, so this method does not independently decide which
  // states are retryable; expectedRevision/idempotencyKey give the backend
  // its optimistic-concurrency and double-click protection (task §4/§5).
  retry(executionId: string, expectedRevision: number, reason: string): Promise<Vs1Detail>
  // GAP-015: server-computed active lineage of the fixed 4-stage chain --
  // "Postęp", current/next specialist, and per-stage history all come from
  // this single read-model, never inferred client-side.
  getWorkflow(sessionId: string): Promise<SessionWorkflowResponse>
  // "Poproś o poprawę": redo the CURRENT stage. Two-step backend contract
  // (REQUEST_REVISION decision, then POST /artifacts/:id/revision), mirrored
  // from AnalysisWorkspace.tsx's decideOnArtifact/beginRevisionPolling.
  requestRevision(artifact: ArtifactResponse, version: ArtifactVersionResponse, feedback: string): Promise<Vs1Detail>
  // "Wróć do wcześniejszego etapu": return to an earlier, already-approved
  // stage identified by targetTaskId (from a SessionWorkflowStage.activeTask).
  returnToStage(sessionId: string, targetTaskId: string, feedback: string, expectedRevision: number): Promise<Vs1Detail>
  // Owner UX Follow-up (GAP-017, Feature 4): read-only fetch of any Task's
  // own Artifact + versions, for the "Podgląd" historical-result view. Never
  // mutates anything -- reuses the same GET endpoints the current-stage view
  // already relies on.
  getArtifactPreview(artifactId: string): Promise<{ artifact: ArtifactResponse; versions: ArtifactVersionResponse[] }>
}

const owner: AuthMeResponse = { contractVersion: '1.0', userId: 'usr_owner_demo', displayName: 'Anna Kowalska', effectiveRole: 'OWNER', permissions: ['session.view', 'session.create', 'session.answer_question', 'session.comment', 'session.feedback', 'session.approve', 'session.request_revision', 'session.cancel_own', 'session.archive_own'] }
const roles: Record<EffectiveRole, AuthMeResponse> = {
  OWNER: owner,
  OBSERVER: { ...owner, userId: 'usr_observer_demo', displayName: 'Jan Nowak', effectiveRole: 'OBSERVER', permissions: ['session.view'] },
  ADMIN: { ...owner, userId: 'usr_admin_demo', displayName: 'Administrator', effectiveRole: 'ADMIN', permissions: ['session.view', 'session.archive_any'] },
}

function error(code: string): never { throw new PlatformApiError(code, 'corr-vs1-demo') }

export function createMockVs1Service(): Vs1Service {
  let current: AuthMeResponse | null = null
  const details = new Map<string, Vs1Detail>()
  const refresh = (detail: Vs1Detail) => { details.set(detail.session.sessionId, detail); return detail }
  return {
    async me() { if (!current) error('UNAUTHENTICATED'); return current },
    async devLogin(role) { current = roles[role]; return current },
    async logout() { current = null },
    async listSessions() { if (!current) error('UNAUTHENTICATED'); return [...details.values()].map(({ session }) => session) },
    async archiveSession(sessionId, expectedRevision) {
      if (!current) error('UNAUTHENTICATED')
      const detail = details.get(sessionId)
      if (!detail) error('NOT_FOUND')
      if (!current.permissions.includes('session.archive_own') && !current.permissions.includes('session.archive_any')) error('NOT_AUTHORIZED')
      if (detail.session.revision !== expectedRevision) error('CONFLICT')
      details.delete(sessionId)
    },
    async createSession(input) {
      if (!current || !current.permissions.includes('session.create')) error('NOT_AUTHORIZED')
      if (!input.projectName.trim() || !input.goal.trim()) error('VALIDATION_ERROR')
      const id = `ses_${crypto.randomUUID().slice(0, 8)}`
      const executionId = `exe_${id.slice(4)}`
      return refresh({
        session: { contractVersion: '1.0', sessionId: id, projectId: `prj_${id.slice(4)}`, ownerId: current.userId, status: 'ACTIVE', revision: 1, createdAt: new Date().toISOString() },
        execution: { contractVersion: '1.0', executionId, status: 'WAITING_FOR_USER_INPUT', revision: 1, attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null, workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null, actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false, retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null, updatedAt: new Date().toISOString(), pendingQuestion: { questionId: 'q_1', prompt: `Jaki jest oczekiwany zakres dla: ${input.goal}?`, inputSchema: null } }, executionRevision: 1,
        artifact: null, versions: [],
      })
    },
    async getDetail(sessionId) { const detail = details.get(sessionId); if (!detail) error('NOT_FOUND'); return detail },
    async answer(executionId, expectedRevision, questionId, answer) {
      const detail = [...details.values()].find(({ execution }) => execution.executionId === executionId)
      if (!detail) error('NOT_FOUND')
      if (expectedRevision === null || detail.executionRevision !== expectedRevision) error('CONFLICT')
      if (!answer.trim() || detail.execution.pendingQuestion?.questionId !== questionId) error('VALIDATION_ERROR')
      const artifactId = `art_${detail.session.sessionId.slice(4)}`
      const versionId = `av_${detail.session.sessionId.slice(4)}_1`
      detail.execution = { ...detail.execution, status: 'LLM_RESULT_READY', revision: expectedRevision + 1, pendingQuestion: null, updatedAt: new Date().toISOString() }
      detail.executionRevision = expectedRevision + 1
      detail.artifact = { contractVersion: '1.0', artifactId, projectId: detail.session.projectId, sessionId: detail.session.sessionId, taskId: `task_${detail.session.sessionId.slice(4)}`, executionId, artifactType: 'ANALYSIS', title: 'Wynik analizy', status: 'READY_FOR_REVIEW', currentVersionId: versionId, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      detail.versions = [{ contractVersion: '1.0', artifactVersionId: versionId, artifactId, versionNumber: 1, sourceAttemptId: null, contentText: `Odpowiedź Ownera: ${answer.trim()}`, contentSchemaVersion: '1.0', checksum: 'mock', createdByType: 'SYSTEM', createdByReference: 'mock-vs1', createdAt: new Date().toISOString() }]
      return refresh(detail)
    },
    async approve(artifact, version) {
      const detail = details.get(artifact.sessionId); if (!detail) error('NOT_FOUND')
      if (artifact.currentVersionId !== version.artifactVersionId) error('ARTIFACT_VERSION_NOT_CURRENT')
      // Mock follows approved UX (GAP-010); real adapter preserves the backend response.
      detail.artifact = { ...artifact, status: 'APPROVED', revision: artifact.revision + 1, updatedAt: new Date().toISOString() }
      detail.session = { ...detail.session, status: 'COMPLETED', revision: detail.session.revision + 1 }
      return refresh(detail)
    },
    // The mock only ever models a single BUSINESS_ANALYSIS stage (approve()
    // above always completes the Session immediately) -- it has no next
    // stage to advance to, so this is a no-op returning the unchanged
    // detail rather than fabricating a PM/Developer/QA stage the rest of
    // the mock doesn't understand.
    async advanceToNextSpecialist(artifactId) {
      const detail = [...details.values()].find(({ artifact }) => artifact?.artifactId === artifactId)
      if (!detail) error('NOT_FOUND')
      return detail
    },
    // Mirrors the real backend's own check order (execution-orchestrator.mjs
    // retryExecution): revision first (CONFLICT), then retryability
    // (INVALID_TRANSITION) -- so a stale-revision retry is reported as a
    // conflict even against a non-retryable Execution, same as the real API.
    async retry(executionId, expectedRevision, reason) {
      const detail = [...details.values()].find(({ execution }) => execution.executionId === executionId)
      if (!detail) error('NOT_FOUND')
      if (!reason.trim()) error('VALIDATION_ERROR')
      if (detail.executionRevision !== expectedRevision) error('CONFLICT')
      if (!detail.execution.retryAllowed) error('INVALID_TRANSITION')
      const artifactId = detail.artifact?.artifactId ?? `art_${detail.session.sessionId.slice(4)}`
      const versionId = `av_${detail.session.sessionId.slice(4)}_retry`
      detail.execution = { ...detail.execution, status: 'LLM_RESULT_READY', revision: expectedRevision + 1, isIncomplete: false, incompleteReason: null, retryAllowed: false, updatedAt: new Date().toISOString() }
      detail.executionRevision = expectedRevision + 1
      detail.artifact = { contractVersion: '1.0', artifactId, projectId: detail.session.projectId, sessionId: detail.session.sessionId, taskId: `task_${detail.session.sessionId.slice(4)}`, executionId, artifactType: 'ANALYSIS', title: 'Wynik analizy', status: 'READY_FOR_REVIEW', currentVersionId: versionId, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      detail.versions = [{ contractVersion: '1.0', artifactVersionId: versionId, artifactId, versionNumber: 1, sourceAttemptId: null, contentText: 'Wynik po ponowieniu.', contentSchemaVersion: '1.0', checksum: 'mock', createdByType: 'SYSTEM', createdByReference: 'mock-vs1-retry', createdAt: new Date().toISOString() }]
      return refresh(detail)
    },
    // The mock only ever models a single BUSINESS_ANALYSIS stage, so the
    // only Artifact ever previewable is the current one -- searched across
    // every tracked analysis (mirrors the real backend's own artifactId
    // lookup being independent of which analysis is currently open).
    async getArtifactPreview(artifactId) {
      const match = [...details.values()].find(({ artifact }) => artifact?.artifactId === artifactId)
      if (!match?.artifact) error('NOT_FOUND')
      return { artifact: match.artifact, versions: match.versions }
    },
    // The mock only ever models a single BUSINESS_ANALYSIS stage (see the
    // note on advanceToNextSpecialist above) -- its workflow projection
    // reflects that: BA is COMPLETED/CURRENT depending on the Artifact,
    // the other three stages are always UPCOMING with no Task yet.
    async getWorkflow(sessionId) {
      const detail = details.get(sessionId); if (!detail) error('NOT_FOUND')
      const baState = !detail.artifact ? 'CURRENT' : detail.artifact.status === 'APPROVED' ? 'COMPLETED' : 'CURRENT'
      const baTask = detail.artifact ? { contractVersion: '1.0' as const, taskId: `task_${sessionId.slice(4)}`, sessionId, taskType: 'BUSINESS_ANALYSIS', status: 'RUNNING' as const, revision: 1 } : null
      const stage = (taskType: 'BUSINESS_ANALYSIS' | 'PROJECT_PLANNING' | 'CODE_IMPLEMENTATION' | 'QUALITY_REVIEW', state: 'COMPLETED' | 'CURRENT' | 'UPCOMING', activeTask: typeof baTask = null, activeArtifact: ArtifactResponse | null = null) =>
        ({ taskType, state, activeTask, activeArtifact, historicalTasks: [] })
      const chain = [
        stage('BUSINESS_ANALYSIS', baState, baTask, detail.artifact),
        stage('PROJECT_PLANNING', 'UPCOMING'),
        stage('CODE_IMPLEMENTATION', 'UPCOMING'),
        stage('QUALITY_REVIEW', 'UPCOMING'),
      ]
      const currentStageIndex = baState === 'CURRENT' ? 0 : 4
      return {
        contractVersion: '1.0', sessionId, sessionStatus: detail.session.status, chain, currentStageIndex, totalStages: 4,
        currentSpecialistTaskType: currentStageIndex < 4 ? 'BUSINESS_ANALYSIS' : null,
        nextSpecialistTaskType: currentStageIndex === 0 ? 'PROJECT_PLANNING' : null,
      }
    },
    async requestRevision(artifact, version, feedback) {
      const detail = details.get(artifact.sessionId); if (!detail) error('NOT_FOUND')
      if (artifact.currentVersionId !== version.artifactVersionId) error('ARTIFACT_VERSION_NOT_CURRENT')
      if (!feedback.trim()) error('REVIEW_COMMENT_REQUIRED')
      const versionId = `av_${detail.session.sessionId.slice(4)}_rev`
      detail.artifact = { ...artifact, status: 'READY_FOR_REVIEW', revision: artifact.revision + 2, currentVersionId: versionId, updatedAt: new Date().toISOString() }
      detail.versions = [...detail.versions, { contractVersion: '1.0', artifactVersionId: versionId, artifactId: artifact.artifactId, versionNumber: detail.versions.length + 1, sourceAttemptId: null, contentText: `Poprawiony wynik uwzględniający: ${feedback.trim()}`, contentSchemaVersion: '1.0', checksum: 'mock', createdByType: 'SYSTEM', createdByReference: 'mock-vs1-revision', createdAt: new Date().toISOString() }]
      return refresh(detail)
    },
    // The mock has only one stage, so there is never an earlier stage to
    // return to -- the same NOT_EARLIER_STAGE the real backend would give.
    async returnToStage() { error('NOT_EARLIER_STAGE') },
  }
}

// Bridges the mounted VS1 UI's Vs1Service contract onto the mature
// PlatformApiClient (correlation IDs, timeouts, credentialed cookies,
// response-shape validation, CONFLICT/currentRevision mapping) instead of a
// second ad-hoc fetch layer. Artifact recovery is server-owned through the
// canonical execution -> Artifact lookup, so it requires no browser cache
// and remains valid after a page reload.
const DEFAULT_POLL_INTERVAL_MS = 2_500
const DEFAULT_POLL_MAX_ATTEMPTS = 8

// One Artifact per specialist stage of the fixed BA->PM->Developer->QA chain
// (specialist-handoff.mjs's NEXT map) -- used only to label a newly created
// Artifact; the backend does not validate artifactType against taskType.
const ARTIFACT_TYPE_BY_TASK_TYPE: Record<string, { artifactType: string; title: string }> = {
  BUSINESS_ANALYSIS: { artifactType: 'ANALYSIS', title: 'Wynik analizy' },
  PROJECT_PLANNING: { artifactType: 'PROJECT_PLAN', title: 'Plan projektu' },
  CODE_IMPLEMENTATION: { artifactType: 'CODE', title: 'Implementacja' },
  QUALITY_REVIEW: { artifactType: 'QUALITY_REPORT', title: 'Raport jakości' },
}

async function waitForExecution(client: PlatformApiClient, executionId: string, correlationId: string): Promise<ExecutionStatusResponse> {
  let status = await client.getExecutionStatus(executionId, correlationId)
  if (!EXECUTION_POLLING_STATUSES.has(status.status)) return status
  let attempts = 0
  return new Promise((resolve, reject) => {
    const controller = trackExecutionStatus(client, { executionId, correlationId }, {
      intervalMs: DEFAULT_POLL_INTERVAL_MS,
      onState: (next) => {
        status = next
        attempts += 1
        // Bounded polling (task §16, "minimalny kontrolowany polling"): a
        // gateway that never calls back (no live n8n/OpenAI wired locally)
        // must not hang this promise forever -- give up after a fixed
        // number of attempts and hand back the last known, still-valid
        // status instead of blocking the caller indefinitely.
        if (attempts >= DEFAULT_POLL_MAX_ATTEMPTS) controller.stop()
      },
      onError: reject,
    })
    controller.whenDone.then(() => resolve(status)).catch(reject)
  })
}

async function resolveSessionForExecution(client: PlatformApiClient, executionId: string, correlationId: string): Promise<SessionListItem> {
  const execution = await client.getExecution(executionId, correlationId)
  const task = await client.getTask(execution.taskId, correlationId)
  return client.getSession(task.sessionId, correlationId)
}

// BUG-1 fix (PROD UX hotfix, 2026-08-30): waitForExecution()'s own bounded
// wait above (~20s) only covers the single action that started/advanced an
// Execution -- it exists to keep that action's own Promise from hanging
// forever, not to guarantee the Execution actually finishes in time. A real
// specialist call routinely outlives it: the 'reasoning' LLM Gateway
// profile alone has a 180s timeout_seconds with up to 2 primary attempts
// plus a fallback profile (database/seed/006_llm_gateway_runtime_dev_seed.sql),
// so a legitimate in-flight Execution can run for several minutes. Once
// run()'s action resolves non-terminal, nothing in VerticalSliceWorkspace
// re-checked it again -- the Owner had to leave "Moje analizy" and reopen
// the same analysis (a fresh getDetail()) to ever see the result, sometimes
// repeatedly. This watches whichever analysis is currently OPEN for as long
// as its Execution stays in flight, re-running the exact same canonical
// getDetail() (which already owns ensureArtifact()) on an interval --
// deliberately reusing that one read instead of a second, competing
// polling mechanism. Bounded (WATCH_POLL_MAX_ATTEMPTS) so a callback that
// genuinely never arrives cannot poll forever.
const WATCH_POLL_INTERVAL_MS = 4_000
const WATCH_POLL_MAX_ATTEMPTS = 150 // ~10 minutes at the interval above

export type DetailPollController = PollController
export type WatchOpenAnalysisOptions = {
  intervalMs?: number
  maxAttempts?: number
  wait?: (milliseconds: number) => Promise<void>
  onDetail?: (detail: Vs1Detail) => void
  onError?: (error: unknown) => void
}

export function watchOpenAnalysis(
  service: Pick<Vs1Service, 'getDetail'>,
  sessionId: string,
  options: WatchOpenAnalysisOptions = {},
): DetailPollController {
  let cancelled = false
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const intervalMs = options.intervalMs ?? WATCH_POLL_INTERVAL_MS
  const maxAttempts = options.maxAttempts ?? WATCH_POLL_MAX_ATTEMPTS

  const whenDone = (async () => {
    let attempts = 0
    while (!cancelled && attempts < maxAttempts) {
      await wait(intervalMs)
      if (cancelled) return
      attempts += 1
      let detail: Vs1Detail
      try {
        detail = await service.getDetail(sessionId)
      } catch (error) {
        if (!cancelled) options.onError?.(error)
        return
      }
      if (cancelled) return
      options.onDetail?.(detail)
      if (!EXECUTION_POLLING_STATUSES.has(detail.execution.status)) return
    }
  })()

  return { stop: () => { cancelled = true }, whenDone }
}

export function createRealVs1Service(baseUrl: string): Vs1Service {
  const client = createPlatformApiClient(baseUrl)
  const correlationId = () => crypto.randomUUID()
  const idempotencyKey = () => crypto.randomUUID()
  async function loadArtifact(artifact: ArtifactResponse, cid: string): Promise<{ artifact: ArtifactResponse; versions: ArtifactVersionResponse[] }> {
    return { artifact, versions: await client.listArtifactVersions(artifact.artifactId, cid) }
  }

  // A specialist's Execution can reach LLM_RESULT_READY without ever going
  // through the Question/Answer path (answer() below already creates the
  // Artifact there). Without this, an Execution that completes directly has
  // no caller that ever issues POST /executions/{id}/artifacts, so no
  // Artifact Version ever appears in the UI for it -- confirmed as a real
  // blocker during Local UI / Browser Validation (2026-08-27/28). The
  // canonical read happens first, and a concurrent create is recovered by
  // the same read after ARTIFACT_ALREADY_EXISTS.
  async function ensureArtifact(executionId: string, status: ExecutionStatusResponse, taskType: string, cid: string): Promise<{ artifact: ArtifactResponse | null; versions: ArtifactVersionResponse[] }> {
    try {
      return await loadArtifact(await client.getArtifactByExecution(executionId, cid), cid)
    } catch (err) {
      if (!(err instanceof PlatformApiError) || err.code !== 'NOT_FOUND') throw err
    }
    if (status.status !== 'LLM_RESULT_READY') return { artifact: null, versions: [] }
    const meta = ARTIFACT_TYPE_BY_TASK_TYPE[taskType] ?? ARTIFACT_TYPE_BY_TASK_TYPE.BUSINESS_ANALYSIS
    try {
      const artifact = await client.createArtifactFromExecution(executionId, meta.artifactType, meta.title, idempotencyKey(), cid)
      return loadArtifact(artifact, cid)
    } catch (err) {
      if (err instanceof PlatformApiError && err.code === 'ARTIFACT_ALREADY_EXISTS') {
        return loadArtifact(await client.getArtifactByExecution(executionId, cid), cid)
      }
      throw err
    }
  }

  return {
    me: () => client.authMe(correlationId()),
    devLogin: (role) => client.devLogin(role, correlationId()),
    logout: () => client.logout(correlationId()),
    listSessions: () => client.listSessionsOwnedByMe(correlationId()),
    archiveSession: async (sessionId, expectedRevision) => { await client.archiveSession(sessionId, expectedRevision, correlationId()) },

    async createSession(input) {
      const cid = correlationId()
      const project = await client.createProject(input.projectName, input.goal, cid)
      const created = await client.createSession(project.projectId, cid)
      const started = await client.startSession(created.sessionId, created.revision, cid) as SessionListItem
      const task = await client.createTask(started.sessionId, `Analiza biznesowa: ${input.projectName}`, input.goal, cid)
      const ready = await client.markTaskReady(task.taskId, task.revision, cid)
      const execution = await client.startExecution(ready.taskId, ready.revision, idempotencyKey(), cid)
      const status = await waitForExecution(client, execution.executionId, cid)
      const { artifact, versions } = await ensureArtifact(execution.executionId, status, task.taskType, cid)
      return { session: started, execution: status, executionRevision: status.revision, artifact, versions }
    },

    async getDetail(sessionId) {
      const cid = correlationId()
      const session = await client.getSession(sessionId, cid)
      const tasks = await client.listSessionTasks(sessionId, cid)
      const task = tasks[tasks.length - 1]
      if (!task) error('NOT_FOUND')
      const executions = await client.listTaskExecutions(task.taskId, cid)
      const execution = executions[executions.length - 1]
      if (!execution) error('NOT_FOUND')
      const status = await client.getExecutionStatus(execution.executionId, cid)
      const { artifact, versions } = await ensureArtifact(execution.executionId, status, task.taskType, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },

    async answer(executionId, expectedRevision, questionId, answerText) {
      if (expectedRevision === null) error('CONTRACT_MISMATCH')
      const cid = correlationId()
      await client.answerExecutionQuestion(executionId, expectedRevision, questionId, answerText, idempotencyKey(), cid)
      const status = await waitForExecution(client, executionId, cid)
      const execution = await client.getExecution(executionId, cid)
      const task = await client.getTask(execution.taskId, cid)
      const { artifact, versions } = await ensureArtifact(executionId, status, task.taskType, cid)
      const session = await resolveSessionForExecution(client, executionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },

    async approve(artifact, version) {
      const cid = correlationId()
      await client.createArtifactReviewDecision(artifact.artifactId, version.artifactVersionId, 'APPROVE', artifact.revision, idempotencyKey(), cid)
      // Backend is the source of truth for both the Artifact and (GAP-010)
      // whether Approval completed the Session -- re-read both rather than
      // assuming the outcome locally (task §15).
      const refreshedArtifact = await client.getArtifact(artifact.artifactId, cid)
      const versions = await client.listArtifactVersions(artifact.artifactId, cid)
      const session = await resolveSessionForExecution(client, artifact.executionId, cid)
      const status = await client.getExecutionStatus(artifact.executionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact: refreshedArtifact, versions }
    },

    async advanceToNextSpecialist(artifactId) {
      const cid = correlationId()
      // createHandoffTask (backend) creates the next specialist's Task
      // already READY in one atomic step -- only startExecution is still
      // needed, mirroring createSession()'s own tail above. But a RETRY of
      // this whole action (e.g. after the first call's polling wait threw
      // transiently) replays the SAME Task via specialist-handoff.mjs's
      // lineage lookup, and by then it is no longer READY -- it already has
      // an Execution from the first, successful startExecution call. Calling
      // startExecution again on a non-READY Task is rejected by the backend
      // (assertTaskReadyForExecution -> 409), which is exactly the bug
      // confirmed live during Local UI / Browser Validation (2026-08-28): a
      // second click could never reach ensureArtifact at all. Only start a
      // fresh Execution when the Task is actually still READY; otherwise
      // reuse its existing (possibly already-finished) one, same as
      // getDetail() already does for the read-only case.
      const task = await client.createNextSpecialistTask(artifactId, idempotencyKey(), cid)
      let execution: ExecutionResponse
      if (task.status === 'READY') {
        execution = await client.startExecution(task.taskId, task.revision, idempotencyKey(), cid)
      } else {
        const executions = await client.listTaskExecutions(task.taskId, cid)
        const latest = executions[executions.length - 1]
        if (!latest) error('NOT_FOUND')
        execution = latest
      }
      const status = await waitForExecution(client, execution.executionId, cid)
      const { artifact, versions } = await ensureArtifact(execution.executionId, status, task.taskType, cid)
      const session = await client.getSession(task.sessionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },

    async retry(executionId, expectedRevision, reason) {
      const cid = correlationId()
      await client.retryExecution(executionId, expectedRevision, reason, idempotencyKey(), cid)
      const status = await waitForExecution(client, executionId, cid)
      const execution = await client.getExecution(executionId, cid)
      const task = await client.getTask(execution.taskId, cid)
      const { artifact, versions } = await ensureArtifact(executionId, status, task.taskType, cid)
      const session = await client.getSession(task.sessionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },

    getWorkflow: (sessionId) => client.getSessionWorkflow(sessionId, correlationId()),

    async getArtifactPreview(artifactId) {
      const cid = correlationId()
      const artifact = await client.getArtifact(artifactId, cid)
      const versions = await client.listArtifactVersions(artifactId, cid)
      return { artifact, versions }
    },

    // Two-step backend contract, matching AnalysisWorkspace.tsx's
    // decideOnArtifact/beginRevisionPolling: REQUEST_REVISION decision
    // first, then the explicit POST /artifacts/:id/revision command that
    // actually creates the new Task + Execution (mirrors the existing
    // requestRevision()-adjacent `/revision` route used for QA-driven
    // revisions elsewhere in this file).
    async requestRevision(artifact, version, feedback) {
      const cid = correlationId()
      await client.createArtifactReviewDecision(artifact.artifactId, version.artifactVersionId, 'REQUEST_REVISION', artifact.revision, idempotencyKey(), cid, feedback)
      const { task, execution } = await client.createArtifactRevision(artifact.artifactId, feedback, idempotencyKey(), cid)
      const status = await waitForExecution(client, execution.executionId, cid)
      const { artifact: refreshedArtifact, versions } = await ensureArtifact(execution.executionId, status, task.taskType, cid)
      const session = await client.getSession(task.sessionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact: refreshedArtifact, versions }
    },

    async returnToStage(sessionId, targetTaskId, feedback, expectedRevision) {
      const cid = correlationId()
      const { task, execution } = await client.returnToStageRevision(sessionId, targetTaskId, feedback, expectedRevision, idempotencyKey(), cid)
      const status = await waitForExecution(client, execution.executionId, cid)
      const { artifact, versions } = await ensureArtifact(execution.executionId, status, task.taskType, cid)
      const session = await client.getSession(sessionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },
  }
}
