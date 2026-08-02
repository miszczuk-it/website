import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisWorkspace } from '../src/components/AnalysisWorkspace.js'
import { createPlatformApiClient } from '../src/lib/platform-api.js'
import { PlatformApiError, toSafeUiError } from '../src/lib/safe-error.js'
import { validateAnalysisForm } from '../src/lib/validation.js'

test('renders the required form, status, result and decision controls', () => {
  const html = renderToStaticMarkup(createElement(AnalysisWorkspace, { apiBaseUrl: '/api', apiEnabled: false }))
  for (const label of ['Nazwa projektu', 'Cel albo problem', 'Zadanie dla Business Analyst', 'Uruchom analizę', 'Status wykonania', 'Wynik', 'Zatwierdź', 'Odrzuć', 'Poproś o poprawę']) {
    assert.equal(html.includes(label), true, label)
  }
  assert.match(html, /Uruchom analizę<\/button>/)
  assert.match(html, /disabled=""/)
})

test('validates all required fields', () => {
  assert.deepEqual(validateAnalysisForm({ projectName: '', goalOrProblem: ' ', businessAnalystTask: '' }), {
    projectName: 'Podaj nazwę projektu.',
    goalOrProblem: 'Opisz cel albo problem.',
    businessAnalystTask: 'Opisz zadanie dla Business Analyst.',
  })
  assert.deepEqual(validateAnalysisForm({ projectName: 'MVP', goalOrProblem: 'Cel', businessAnalystTask: 'Analiza' }), {})
})

test('maps API failures to a safe message and keeps only a support reference', () => {
  const error = toSafeUiError(new PlatformApiError('INTERNAL_DATABASE_FAILURE', 'correlation-safe-1'))
  assert.equal(error.message.includes('DATABASE'), false)
  assert.equal(error.reference, 'correlation-safe-1')
})

test('Platform API client uses the configured API URL and propagates request context', async () => {
  let requestedUrl = ''
  let requestHeaders = new Headers()
  const fetchMock: typeof fetch = async (input, init) => {
    requestedUrl = String(input)
    requestHeaders = new Headers(init?.headers)
    return new Response(JSON.stringify({
      executionId: 'execution-test-1',
      status: 'CREATED',
    }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  const client = createPlatformApiClient('/platform-api', fetchMock)
  const result = await client.startAnalysis({
    projectName: 'MVP',
    goalOrProblem: 'Test',
    businessAnalystTask: 'Przygotuj analizę',
  })

  assert.equal(requestedUrl, '/platform-api/mvp/analyses')
  assert.ok(requestHeaders.get('x-correlation-id'))
  assert.ok(requestHeaders.get('x-request-id'))
  assert.equal(result.status, 'CREATED')
})
