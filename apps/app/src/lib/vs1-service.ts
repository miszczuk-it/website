import { PlatformApiError } from './safe-error.js'
import type { ArtifactResponse, ArtifactVersionResponse, AuthMeResponse, EffectiveRole, ExecutionStatusResponse, SessionListItem, SessionResponse } from '../types.js'

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
        execution: { contractVersion: '1.0', executionId, status: 'WAITING_FOR_USER_INPUT', attemptId: null, attemptNumber: null, attemptStatus: null, providerRequestId: null, provider: null, model: null, workflowExecutionId: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null, actualCost: null, currency: null, isIncomplete: false, incompleteReason: null, fallbackUsed: false, retryAllowed: false, reconcileRequired: false, safeErrorCode: null, safeErrorMessage: null, updatedAt: new Date().toISOString(), pendingQuestion: { questionId: 'q_1', prompt: `Jaki jest oczekiwany zakres dla: ${input.goal}?`, inputSchema: null } }, executionRevision: 1,
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
      detail.execution = { ...detail.execution, status: 'LLM_RESULT_READY', pendingQuestion: null, updatedAt: new Date().toISOString() }
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

export function createRealVs1Service(baseUrl: string): Vs1Service {
  const api = baseUrl.replace(/\/$/, '')
  const request = async <T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> => {
    let response: Response
    try { response = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }) } catch { error('NETWORK_ERROR') }
    const value = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) error(typeof value?.errorCode === 'string' ? value.errorCode : `HTTP_${response.status}`)
    return value as T
  }
  return {
    me: () => request('GET', '/auth/me'),
    devLogin: (role) => request('POST', '/auth/dev-login', { contractVersion: '1.0', role }),
    logout: async () => { await request('POST', '/auth/logout', { contractVersion: '1.0' }) },
    async listSessions() { return (await request<{ sessions: SessionListItem[] }>('GET', '/sessions?ownerId=me')).sessions },
    async createSession(input) {
      const project = await request<{ projectId: string }>('POST', '/projects', { contractVersion: '1.0', name: input.projectName, description: input.goal })
      const created = await request<SessionResponse>('POST', `/projects/${project.projectId}/sessions`, { contractVersion: '1.0' })
      const session = await request<SessionListItem>('POST', `/sessions/${created.sessionId}/start`, { contractVersion: '1.0', expectedRevision: created.revision })
      return { session, execution: await request('GET', `/executions/${session.sessionId}/status`), executionRevision: null, artifact: null, versions: [] }
    },
    async getDetail(sessionId) { const session = await request<SessionListItem>('GET', `/sessions/${sessionId}`); return { session, execution: await request('GET', `/executions/${sessionId}/status`), executionRevision: null, artifact: null, versions: [] } },
    async answer(executionId, expectedRevision, questionId, answer) { if (expectedRevision === null) error('CONTRACT_MISMATCH'); await request('POST', `/executions/${executionId}/answer`, { contractVersion: '1.0', idempotencyKey: crypto.randomUUID(), expectedRevision, questionId, answer }); error('INVALID_RESPONSE') },
    async approve() { error('INVALID_RESPONSE') },
  }
}
