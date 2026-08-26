import { PlatformApiError } from './safe-error.js'
import { createPlatformApiClient, type PlatformApiClient } from './platform-api.js'
import { EXECUTION_POLLING_STATUSES, trackExecutionStatus } from './execution-flow.js'
import type { ArtifactResponse, ArtifactVersionResponse, AuthMeResponse, EffectiveRole, ExecutionStatusResponse, SessionListItem } from '../types.js'

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
  createSession(input: { projectName: string; goal: string }): Promise<Vs1Detail>
  getDetail(sessionId: string): Promise<Vs1Detail>
  answer(executionId: string, expectedRevision: number | null, questionId: string, answer: string): Promise<Vs1Detail>
  approve(artifact: ArtifactResponse, version: ArtifactVersionResponse): Promise<Vs1Detail>
}

const owner: AuthMeResponse = { contractVersion: '1.0', userId: 'usr_owner_demo', displayName: 'Anna Kowalska', effectiveRole: 'OWNER', permissions: ['session.view', 'session.create', 'session.answer_question', 'session.comment', 'session.feedback', 'session.approve', 'session.request_revision', 'session.cancel_own'] }
const roles: Record<EffectiveRole, AuthMeResponse> = {
  OWNER: owner,
  OBSERVER: { ...owner, userId: 'usr_observer_demo', displayName: 'Jan Nowak', effectiveRole: 'OBSERVER', permissions: ['session.view'] },
  ADMIN: { ...owner, userId: 'usr_admin_demo', displayName: 'Administrator', effectiveRole: 'ADMIN', permissions: ['session.view'] },
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
  }
}

// Bridges the mounted VS1 UI's Vs1Service contract onto the mature
// PlatformApiClient (correlation IDs, timeouts, credentialed cookies,
// response-shape validation, CONFLICT/currentRevision mapping) instead of a
// second ad-hoc fetch layer. The only adapter-local state is a best-effort
// executionId -> artifactId cache: no backend endpoint lists an Artifact by
// its owning Execution (contract gap, see frontend-backend-contract-pack.md
// §7), so it is reconstructed fresh from the Session on every getDetail()
// call except for that one field, which is lost across a page reload -- the
// same limitation the mock's in-memory Map has.
const DEFAULT_POLL_INTERVAL_MS = 2_500
const DEFAULT_POLL_MAX_ATTEMPTS = 8

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

export function createRealVs1Service(baseUrl: string): Vs1Service {
  const client = createPlatformApiClient(baseUrl)
  const correlationId = () => crypto.randomUUID()
  const idempotencyKey = () => crypto.randomUUID()
  // Best-effort only -- see the module comment above for why this exists
  // and what it does not survive (page reload).
  const artifactByExecution = new Map<string, string>()

  async function loadArtifact(executionId: string, cid: string): Promise<{ artifact: ArtifactResponse | null; versions: ArtifactVersionResponse[] }> {
    const artifactId = artifactByExecution.get(executionId)
    if (!artifactId) return { artifact: null, versions: [] }
    const artifact = await client.getArtifact(artifactId, cid)
    return { artifact, versions: await client.listArtifactVersions(artifactId, cid) }
  }

  return {
    me: () => client.authMe(correlationId()),
    devLogin: (role) => client.devLogin(role, correlationId()),
    logout: () => client.logout(correlationId()),
    listSessions: () => client.listSessionsOwnedByMe(correlationId()),

    async createSession(input) {
      const cid = correlationId()
      const project = await client.createProject(input.projectName, input.goal, cid)
      const created = await client.createSession(project.projectId, cid)
      const started = await client.startSession(created.sessionId, created.revision, cid) as SessionListItem
      const task = await client.createTask(started.sessionId, `Analiza biznesowa: ${input.projectName}`, input.goal, cid)
      const ready = await client.markTaskReady(task.taskId, task.revision, cid)
      const execution = await client.startExecution(ready.taskId, ready.revision, idempotencyKey(), cid)
      const status = await waitForExecution(client, execution.executionId, cid)
      return { session: started, execution: status, executionRevision: status.revision, artifact: null, versions: [] }
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
      const { artifact, versions } = await loadArtifact(execution.executionId, cid)
      return { session, execution: status, executionRevision: status.revision, artifact, versions }
    },

    async answer(executionId, expectedRevision, questionId, answerText) {
      if (expectedRevision === null) error('CONTRACT_MISMATCH')
      const cid = correlationId()
      await client.answerExecutionQuestion(executionId, expectedRevision, questionId, answerText, idempotencyKey(), cid)
      const status = await waitForExecution(client, executionId, cid)
      let artifact: ArtifactResponse | null = null
      let versions: ArtifactVersionResponse[] = []
      if (status.status === 'LLM_RESULT_READY') {
        artifact = await client.createArtifactFromExecution(executionId, 'ANALYSIS', 'Wynik analizy', idempotencyKey(), cid)
        artifactByExecution.set(executionId, artifact.artifactId)
        versions = await client.listArtifactVersions(artifact.artifactId, cid)
      }
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
  }
}
