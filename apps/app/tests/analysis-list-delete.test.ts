import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisList } from '../src/components/AnalysisList.js'
import { ConfirmDialog } from '../src/components/ConfirmDialog.js'
import type { SessionListItem } from '../src/types.js'

// Owner UX Follow-up (GAP-017 §4-§9): "..." menu / "Usuń analizę" on
// AnalysisList, and the shared ConfirmDialog it opens. Same static-render
// convention as analysis-workspace-ux.test.ts (no fireEvent anywhere in
// this repo) -- interactive open/confirm/cancel wiring is exercised at the
// service level in vs1-service-archive.test.ts.

const SESSION_ID = '00000000-0000-4000-8000-000000000002'
function noop(): never { throw new Error('not called in this test') }
async function noopAsync(): Promise<void> { throw new Error('not called in this test') }

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return { contractVersion: '1.0', sessionId: SESSION_ID, projectId: 'prj-1', ownerId: 'dev-owner', status: 'ACTIVE', revision: 3, createdAt: '2026-08-29T09:00:00Z', projectName: 'Skrypt PowerShell', ...overrides }
}

test('AnalysisList offers the "..." delete menu when canDelete is true', () => {
  const html = renderToStaticMarkup(createElement(AnalysisList, {
    sessions: [session()], busy: false, canDelete: true, onOpen: noop, onCreate: noopAsync, onDelete: noopAsync,
  }))
  assert.ok(html.includes('Więcej akcji'), 'the "..." menu trigger must exist')
  assert.ok(html.includes('Usuń analizę'))
})

test('AnalysisList hides the delete menu entirely when canDelete is false (e.g. OBSERVER)', () => {
  const html = renderToStaticMarkup(createElement(AnalysisList, {
    sessions: [session()], busy: false, canDelete: false, onOpen: noop, onCreate: noopAsync, onDelete: noopAsync,
  }))
  assert.equal(html.includes('Usuń analizę'), false)
  assert.equal(html.includes('Więcej akcji'), false)
})

test('AnalysisList never nests the delete menu inside the row-open button (no nested interactive elements)', () => {
  const html = renderToStaticMarkup(createElement(AnalysisList, {
    sessions: [session()], busy: false, canDelete: true, onOpen: noop, onCreate: noopAsync, onDelete: noopAsync,
  }))
  const openButtonEnd = html.indexOf('</button>')
  const menuStart = html.indexOf('Więcej akcji')
  assert.ok(openButtonEnd > 0 && menuStart > openButtonEnd, 'the "..." menu must be a sibling of the open button, not nested inside it')
})

test('ConfirmDialog renders the exact deletion confirmation copy (task §5)', () => {
  const html = renderToStaticMarkup(createElement(ConfirmDialog, {
    title: 'Usunąć analizę?',
    body: '„Skrypt PowerShell”\n\nTa operacja usunie analizę z listy.',
    confirmLabel: 'Usuń analizę',
    onConfirm: noop,
    onCancel: noop,
  }))
  assert.ok(html.includes('Usunąć analizę?'))
  assert.ok(html.includes('Skrypt PowerShell'))
  assert.ok(html.includes('Ta operacja usunie analizę z listy.'))
  assert.ok(html.includes('Anuluj'), 'default cancel label')
  assert.ok(html.includes('Usuń analizę'))
})

test('ConfirmDialog supports a custom cancel label', () => {
  const html = renderToStaticMarkup(createElement(ConfirmDialog, {
    title: 'Tytuł', body: 'Treść', confirmLabel: 'Potwierdź', cancelLabel: 'Wróć', onConfirm: noop, onCancel: noop,
  }))
  assert.ok(html.includes('Wróć'))
  assert.equal(html.includes('>Anuluj<'), false)
})
