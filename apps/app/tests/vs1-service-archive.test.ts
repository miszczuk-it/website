import assert from 'node:assert/strict'
import test from 'node:test'
import { PlatformApiError } from '../src/lib/safe-error.js'
import { createMockVs1Service, createRealVs1Service } from '../src/lib/vs1-service.js'

// Owner UX Follow-up (GAP-017): archiveSession() for both Vs1Service
// implementations, mirroring vs1-service-return-to-stage.test.ts's
// fakeFetch pattern for the real adapter.
const BASE = 'http://test.local/api'

type Route = { method: string; path: string; respond: (body: unknown) => { status: number; body: unknown } }

function fakeFetch(routes: Route[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const path = url.replace(BASE, '')
    const method = (init?.method ?? 'GET') as string
    const body = init?.body ? JSON.parse(init.body as string) : null
    const route = routes.find((candidate) => candidate.method === method && candidate.path === path)
    if (!route) throw new Error(`Unexpected request: ${method} ${path}`)
    const { status, body: responseBody } = route.respond(body)
    return { ok: status >= 200 && status < 300, status, json: async () => responseBody } as Response
  }) as typeof fetch
}

test('real VS1 adapter archiveSession sends expectedRevision and resolves without leaking the response body', async () => {
  const sessionId = 'ses-archive'
  const captured: { body: Record<string, unknown> | null } = { body: null }
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/sessions/${sessionId}/archive`, respond: (body) => {
      captured.body = body as Record<string, unknown>
      return { status: 200, body: { contractVersion: '1.0', sessionId, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ARCHIVED', revision: 4, createdAt: '2026-08-29T09:00:00Z' } }
    } },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const result = await createRealVs1Service(BASE).archiveSession(sessionId, 3)
    assert.equal(captured.body?.expectedRevision, 3)
    assert.equal(result, undefined, 'archiveSession resolves void -- the caller re-lists sessions instead of trusting a stale local copy')
  } finally { globalThis.fetch = originalFetch }
})

test('real VS1 adapter surfaces a stale-revision archive attempt as a machine-readable CONFLICT', async () => {
  const sessionId = 'ses-archive-stale'
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/sessions/${sessionId}/archive`, respond: () => ({ status: 409, body: { contractVersion: '1.0', errorCode: 'CONFLICT', message: 'Stan się zmienił.', correlationId: 'corr-1', currentRevision: 5 } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    await assert.rejects(
      createRealVs1Service(BASE).archiveSession(sessionId, 3),
      (error: unknown) => error instanceof PlatformApiError && error.code === 'CONFLICT',
    )
  } finally { globalThis.fetch = originalFetch }
})

test('real VS1 adapter surfaces OBSERVER rejection from archiveSession as NOT_AUTHORIZED', async () => {
  const sessionId = 'ses-archive-observer'
  const fetchImpl = fakeFetch([
    { method: 'POST', path: `/sessions/${sessionId}/archive`, respond: () => ({ status: 403, body: { contractVersion: '1.0', errorCode: 'NOT_AUTHORIZED', message: 'Brak uprawnień.', correlationId: 'corr-2' } }) },
  ])
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    await assert.rejects(
      createRealVs1Service(BASE).archiveSession(sessionId, 1),
      (error: unknown) => error instanceof PlatformApiError && error.code === 'NOT_AUTHORIZED',
    )
  } finally { globalThis.fetch = originalFetch }
})

test('mock VS1 service archiveSession removes the analysis from listSessions()', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OWNER')
  const created = await service.createSession({ projectName: 'Do usunięcia', goal: 'Cel' })
  assert.ok((await service.listSessions()).some((item) => item.sessionId === created.session.sessionId))

  await service.archiveSession(created.session.sessionId, created.session.revision)
  assert.equal((await service.listSessions()).some((item) => item.sessionId === created.session.sessionId), false)
})

test('mock VS1 service archiveSession rejects a stale revision and an OBSERVER caller, leaving the analysis untouched', async () => {
  const service = createMockVs1Service()
  await service.devLogin('OWNER')
  const created = await service.createSession({ projectName: 'Chroniona', goal: 'Cel' })

  await assert.rejects(
    service.archiveSession(created.session.sessionId, created.session.revision + 1),
    (error: unknown) => error instanceof PlatformApiError && error.code === 'CONFLICT',
  )
  assert.ok((await service.listSessions()).some((item) => item.sessionId === created.session.sessionId), 'a rejected (stale-revision) archive attempt must not remove the analysis')

  // Same backing store (one mock service instance), different identity --
  // mirrors the real backend where OWNER/OBSERVER share one Session table.
  await service.devLogin('OBSERVER')
  await assert.rejects(
    service.archiveSession(created.session.sessionId, created.session.revision),
    (error: unknown) => error instanceof PlatformApiError && error.code === 'NOT_AUTHORIZED',
  )
  await service.devLogin('OWNER')
  assert.ok((await service.listSessions()).some((item) => item.sessionId === created.session.sessionId), 'the OBSERVER-rejected attempt must not remove the analysis either')
})
