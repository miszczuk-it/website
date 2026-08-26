import { PlatformApiError } from './safe-error.js'
import type {
  ArtifactDecisionType, ArtifactNewVersionContent, ArtifactResponse, ArtifactReviewDecisionEnvelope, ArtifactReviewDecisionResponse, ArtifactVersionResponse,
  AuthMeResponse, EffectiveRole, ExecutionResponse, ExecutionStatusResponse, ProjectResponse, SessionListItem, SessionResponse, TaskResponse,
} from '../types.js'

type FetchLike = typeof fetch

export type PlatformApiClient = {
  authMe(correlationId: string): Promise<AuthMeResponse>
  devLogin(role: EffectiveRole, correlationId: string): Promise<AuthMeResponse>
  logout(correlationId: string): Promise<void>
  listSessionsOwnedByMe(correlationId: string): Promise<SessionListItem[]>
  getSession(sessionId: string, correlationId: string): Promise<SessionListItem>
  listSessionTasks(sessionId: string, correlationId: string): Promise<TaskResponse[]>
  getTask(taskId: string, correlationId: string): Promise<TaskResponse>
  listTaskExecutions(taskId: string, correlationId: string): Promise<ExecutionResponse[]>
  answerExecutionQuestion(executionId: string, expectedRevision: number, questionId: string, answer: string, idempotencyKey: string, correlationId: string): Promise<ExecutionStatusResponse>
  createProject(name: string, description: string, correlationId: string): Promise<ProjectResponse>
  createSession(projectId: string, correlationId: string): Promise<SessionResponse>
  startSession(sessionId: string, expectedRevision: number, correlationId: string): Promise<SessionResponse>
  createTask(sessionId: string, title: string, description: string, correlationId: string): Promise<TaskResponse>
  markTaskReady(taskId: string, expectedRevision: number, correlationId: string): Promise<TaskResponse>
  startExecution(taskId: string, expectedTaskRevision: number, idempotencyKey: string, correlationId: string): Promise<ExecutionResponse>
  getExecution(executionId: string, correlationId: string): Promise<ExecutionResponse>
  getExecutionStatus(executionId: string, correlationId: string): Promise<ExecutionStatusResponse>
  retryExecution(executionId: string, expectedRevision: number, reason: string, idempotencyKey: string, correlationId: string): Promise<ExecutionResponse>
  createArtifactFromExecution(executionId: string, artifactType: string, title: string, idempotencyKey: string, correlationId: string): Promise<ArtifactResponse>
  getArtifact(artifactId: string, correlationId: string): Promise<ArtifactResponse>
  listArtifactVersions(artifactId: string, correlationId: string): Promise<ArtifactVersionResponse[]>
  submitArtifactForReview(artifactId: string, expectedRevision: number, artifactVersionId: string, idempotencyKey: string, correlationId: string): Promise<ArtifactResponse>
  createArtifactVersion(artifactId: string, expectedArtifactRevision: number, contentSchemaVersion: string, content: ArtifactNewVersionContent, idempotencyKey: string, correlationId: string): Promise<ArtifactResponse>
  createArtifactReviewDecision(artifactId: string, artifactVersionId: string, decisionType: ArtifactDecisionType, expectedVersion: number, idempotencyKey: string, correlationId: string, comment?: string): Promise<ArtifactReviewDecisionEnvelope>
  listArtifactReviewDecisions(artifactId: string, correlationId: string): Promise<ArtifactReviewDecisionResponse[]>
}

type ClientOptions = { fetchImpl?: FetchLike; timeoutMs?: number; createId?: () => string }

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, '')
  if (normalized.startsWith('/')) return normalized
  const parsed = new URL(normalized)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported Platform API protocol')
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertAuthMe(value: unknown): AuthMeResponse {
  if (!isRecord(value) || value.contractVersion !== '1.0' || typeof value.userId !== 'string'
    || typeof value.displayName !== 'string' || typeof value.effectiveRole !== 'string' || !Array.isArray(value.permissions)) {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value as unknown as AuthMeResponse
}

function assertResponse(value: unknown, kind: 'project' | 'session' | 'task' | 'execution' | 'executionStatus') {
  if (!isRecord(value) || value.contractVersion !== '1.0') throw new PlatformApiError('INVALID_RESPONSE')
  if (kind === 'executionStatus') {
    if (typeof value.executionId !== 'string' || typeof value.status !== 'string'
      || typeof value.retryAllowed !== 'boolean' || typeof value.reconcileRequired !== 'boolean'
      || typeof value.updatedAt !== 'string') {
      throw new PlatformApiError('INVALID_RESPONSE')
    }
    return value
  }
  if (!Number.isInteger(value.revision) || typeof value[`${kind}Id`] !== 'string' || typeof value.status !== 'string') {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value
}

// Artifact response shapes don't fit the `${kind}Id` + revision + status
// convention above: ArtifactVersion has no `status`/`revision` (it uses
// `versionNumber` and is immutable), and a decision has neither -- each
// gets its own minimal structural check instead of stretching assertResponse.
function assertArtifact(value: unknown): ArtifactResponse {
  if (!isRecord(value) || value.contractVersion !== '1.0' || typeof value.artifactId !== 'string'
    || typeof value.status !== 'string' || !Number.isInteger(value.revision)) {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value as unknown as ArtifactResponse
}

function assertArtifactVersion(value: unknown): ArtifactVersionResponse {
  if (!isRecord(value) || value.contractVersion !== '1.0' || typeof value.artifactVersionId !== 'string'
    || !Number.isInteger(value.versionNumber) || (typeof value.contentJson !== 'object' && typeof value.contentText !== 'string')) {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value as unknown as ArtifactVersionResponse
}

function assertArtifactDecision(value: unknown): ArtifactReviewDecisionResponse {
  if (!isRecord(value) || value.contractVersion !== '1.0' || typeof value.decisionId !== 'string'
    || typeof value.decisionType !== 'string' || typeof value.idempotencyKey !== 'string') {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value as unknown as ArtifactReviewDecisionResponse
}

// POST /artifacts/:id/decisions response (MVP-TASK-006): the decision is
// nested under `reviewDecision` alongside `triggeredExecutionId`, unlike
// GET /decisions which still returns bare ArtifactReviewDecisionResponse
// shapes (assertArtifactDecision above, reused here for the nested object).
function assertArtifactDecisionEnvelope(value: unknown): ArtifactReviewDecisionEnvelope {
  if (!isRecord(value) || value.contractVersion !== '1.0' || !isRecord(value.reviewDecision)
    || (value.triggeredExecutionId !== null && typeof value.triggeredExecutionId !== 'string')) {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return { contractVersion: '1.0', reviewDecision: assertArtifactDecision(value.reviewDecision), triggeredExecutionId: value.triggeredExecutionId as string | null }
}

export function createPlatformApiClient(baseUrl: string, options: ClientOptions = {}): PlatformApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const createId = options.createId ?? (() => crypto.randomUUID())

  async function fetchJson(method: 'GET' | 'POST', path: string, body: object | null, correlationId: string): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method, signal: controller.signal, credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId, 'x-request-id': createId() },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!response.ok) {
        let errorCode = response.status === 409 ? 'CONFLICT' : `HTTP_${response.status}`
        let currentRevision: number | undefined
        try {
          const error = await response.json() as unknown
          if (isRecord(error)) {
            if (typeof error.errorCode === 'string') errorCode = error.errorCode
            if (Number.isInteger(error.currentRevision)) currentRevision = error.currentRevision as number
          }
        } catch { /* Ignore untrusted technical response details. */ }
        throw new PlatformApiError(errorCode, correlationId, response.status, currentRevision)
      }
      return await response.json()
    } catch (error) {
      if (error instanceof PlatformApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new PlatformApiError('TIMEOUT', correlationId)
      throw new PlatformApiError('NETWORK_ERROR', correlationId)
    } finally { clearTimeout(timeout) }
  }

  async function call<T>(method: 'GET' | 'POST', path: string, body: object | null, correlationId: string, kind: 'project' | 'session' | 'task' | 'execution' | 'executionStatus'): Promise<T> {
    return assertResponse(await fetchJson(method, path, body, correlationId), kind) as T
  }

  async function callValidated<T>(method: 'GET' | 'POST', path: string, body: object | null, correlationId: string, validate: (value: unknown) => T): Promise<T> {
    return validate(await fetchJson(method, path, body, correlationId))
  }

  async function callList<T>(path: string, correlationId: string, validate: (value: unknown) => T): Promise<T[]> {
    const value = await fetchJson('GET', path, null, correlationId)
    if (!Array.isArray(value)) throw new PlatformApiError('INVALID_RESPONSE')
    return value.map(validate)
  }

  return {
    authMe: (correlationId) => callValidated('GET', '/auth/me', null, correlationId, assertAuthMe),
    devLogin: (role, correlationId) => callValidated('POST', '/auth/dev-login', { contractVersion: '1.0', role }, correlationId, assertAuthMe),
    logout: async (correlationId) => { await fetchJson('POST', '/auth/logout', { contractVersion: '1.0' }, correlationId) },
    listSessionsOwnedByMe: (correlationId) => callList('/sessions?ownerId=me', correlationId, (value) => assertResponse(value, 'session') as unknown as SessionListItem),
    getSession: (sessionId, correlationId) => callValidated('GET', `/sessions/${sessionId}`, null, correlationId, (value) => assertResponse(value, 'session') as unknown as SessionListItem),
    listSessionTasks: (sessionId, correlationId) => callList(`/sessions/${sessionId}/tasks`, correlationId, (value) => assertResponse(value, 'task') as unknown as TaskResponse),
    getTask: (taskId, correlationId) => call('GET', `/tasks/${taskId}`, null, correlationId, 'task'),
    listTaskExecutions: (taskId, correlationId) => callList(`/tasks/${taskId}/executions`, correlationId, (value) => assertResponse(value, 'execution') as unknown as ExecutionResponse),
    answerExecutionQuestion: (executionId, expectedRevision, questionId, answer, idempotencyKey, correlationId) => call('POST', `/executions/${executionId}/answer`, {
      contractVersion: '1.0', expectedRevision, questionId, answer, idempotencyKey,
    }, correlationId, 'executionStatus'),
    createProject: (name, description, correlationId) => call('POST', '/projects', { contractVersion: '1.0', name, description }, correlationId, 'project'),
    createSession: (projectId, correlationId) => call('POST', `/projects/${projectId}/sessions`, { contractVersion: '1.0' }, correlationId, 'session'),
    startSession: (sessionId, expectedRevision, correlationId) => call('POST', `/sessions/${sessionId}/start`, { contractVersion: '1.0', expectedRevision }, correlationId, 'session'),
    createTask: (sessionId, title, description, correlationId) => call('POST', `/sessions/${sessionId}/tasks`, { contractVersion: '1.0', taskType: 'BUSINESS_ANALYSIS', title, description }, correlationId, 'task'),
    markTaskReady: (taskId, expectedRevision, correlationId) => call('POST', `/tasks/${taskId}/ready`, { contractVersion: '1.0', expectedRevision }, correlationId, 'task'),
    startExecution: (taskId, expectedTaskRevision, idempotencyKey, correlationId) => call('POST', `/tasks/${taskId}/executions`, {
      contractVersion: '1.0', idempotencyKey, expectedTaskRevision,
    }, correlationId, 'execution'),
    getExecution: (executionId, correlationId) => call('GET', `/executions/${executionId}`, null, correlationId, 'execution'),
    getExecutionStatus: (executionId, correlationId) => call('GET', `/executions/${executionId}/status`, null, correlationId, 'executionStatus'),
    retryExecution: (executionId, expectedRevision, reason, idempotencyKey, correlationId) => call('POST', `/executions/${executionId}/retry`, {
      contractVersion: '1.0', expectedRevision, reason, idempotencyKey,
    }, correlationId, 'execution'),
    createArtifactFromExecution: (executionId, artifactType, title, idempotencyKey, correlationId) => callValidated('POST', `/executions/${executionId}/artifacts`, {
      contractVersion: '1.0', artifactType, title, idempotencyKey,
    }, correlationId, assertArtifact),
    getArtifact: (artifactId, correlationId) => callValidated('GET', `/artifacts/${artifactId}`, null, correlationId, assertArtifact),
    listArtifactVersions: (artifactId, correlationId) => callList(`/artifacts/${artifactId}/versions`, correlationId, assertArtifactVersion),
    submitArtifactForReview: (artifactId, expectedRevision, artifactVersionId, idempotencyKey, correlationId) => callValidated('POST', `/artifacts/${artifactId}/submit-for-review`, {
      contractVersion: '1.0', expectedRevision, artifactVersionId, idempotencyKey,
    }, correlationId, assertArtifact),
    createArtifactVersion: (artifactId, expectedArtifactRevision, contentSchemaVersion, content, idempotencyKey, correlationId) => callValidated('POST', `/artifacts/${artifactId}/versions`, {
      contractVersion: '1.0', idempotencyKey, expectedArtifactRevision, contentSchemaVersion, ...content,
    }, correlationId, assertArtifact),
    createArtifactReviewDecision: (artifactId, artifactVersionId, decisionType, expectedVersion, idempotencyKey, correlationId, comment) => callValidated('POST', `/artifacts/${artifactId}/decisions`, {
      contractVersion: '1.0', artifactVersionId, decisionType, idempotencyKey, expectedVersion, ...(comment ? { comment } : {}),
    }, correlationId, assertArtifactDecisionEnvelope),
    listArtifactReviewDecisions: (artifactId, correlationId) => callList(`/artifacts/${artifactId}/decisions`, correlationId, assertArtifactDecision),
  }
}
