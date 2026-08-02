import { PlatformApiError } from './safe-error.js'
import type { ProjectResponse, SessionResponse, TaskResponse } from '../types.js'

type FetchLike = typeof fetch

export type PlatformApiClient = {
  createProject(name: string, description: string, correlationId: string): Promise<ProjectResponse>
  createSession(projectId: string, correlationId: string): Promise<SessionResponse>
  startSession(sessionId: string, expectedRevision: number, correlationId: string): Promise<SessionResponse>
  createTask(sessionId: string, title: string, description: string, correlationId: string): Promise<TaskResponse>
  markTaskReady(taskId: string, expectedRevision: number, correlationId: string): Promise<TaskResponse>
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

function assertResponse(value: unknown, kind: 'project' | 'session' | 'task') {
  if (!isRecord(value) || value.contractVersion !== '1.0' || !Number.isInteger(value.revision)) {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  if (typeof value[`${kind}Id`] !== 'string' || typeof value.status !== 'string') {
    throw new PlatformApiError('INVALID_RESPONSE')
  }
  return value
}

export function createPlatformApiClient(baseUrl: string, options: ClientOptions = {}): PlatformApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const createId = options.createId ?? (() => crypto.randomUUID())

  async function post<T>(path: string, body: object, correlationId: string, kind: 'project' | 'session' | 'task'): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId, 'x-request-id': createId() },
        body: JSON.stringify(body),
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
      return assertResponse(await response.json(), kind) as T
    } catch (error) {
      if (error instanceof PlatformApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new PlatformApiError('TIMEOUT', correlationId)
      throw new PlatformApiError('NETWORK_ERROR', correlationId)
    } finally { clearTimeout(timeout) }
  }

  return {
    createProject: (name, description, correlationId) => post('/projects', { contractVersion: '1.0', name, description }, correlationId, 'project'),
    createSession: (projectId, correlationId) => post(`/projects/${projectId}/sessions`, { contractVersion: '1.0' }, correlationId, 'session'),
    startSession: (sessionId, expectedRevision, correlationId) => post(`/sessions/${sessionId}/start`, { contractVersion: '1.0', expectedRevision }, correlationId, 'session'),
    createTask: (sessionId, title, description, correlationId) => post(`/sessions/${sessionId}/tasks`, { contractVersion: '1.0', taskType: 'BUSINESS_ANALYSIS', title, description }, correlationId, 'task'),
    markTaskReady: (taskId, expectedRevision, correlationId) => post(`/tasks/${taskId}/ready`, { contractVersion: '1.0', expectedRevision }, correlationId, 'task'),
  }
}
