import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SharedContextPanel } from '../src/components/SharedContextPanel.js'
import type { AnalysisContextEntry, AnalysisContextResponse, ContextVersionSummary } from '../src/types.js'

// ADR-009 / GAP-018 completion (task §24-§28): "Kontekst analizy" write
// model. Purely presentational (data lives in props, mirroring
// SettingsSpecialists.tsx), so a static render is enough to prove category
// labels/visibility/canMutate gating -- the backend is the sole authority
// on whether a mutation actually succeeds.

function entry(overrides: Partial<AnalysisContextEntry> = {}): AnalysisContextEntry {
  return {
    entryId: 'entry-1', section: 'GOAL', classification: 'OWNER_CONFIRMED', status: 'ACTIVE',
    content: 'Zaprojektuj prosty endpoint produktów', source: null, createdBy: 'owner-1',
    createdAt: '2026-08-29T09:00:00Z', approvedBy: null, approvedAt: null, ...overrides,
  }
}

function context(entries: AnalysisContextEntry[], versionNumber = 1): AnalysisContextResponse {
  return { contractVersion: '1.0', analysisContextVersionId: 'ctx-v1', analysisContextId: 'ctx-1', versionNumber, entries, createdAt: '2026-08-29T09:00:00Z', createdBy: 'owner-1' }
}

const noopAsync = async () => undefined

function render(props: Partial<Parameters<typeof SharedContextPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(SharedContextPanel, {
    context: context([entry()]), versions: null, canMutate: true, busy: false, error: null, notice: null,
    onAdd: noopAsync, onEdit: noopAsync, onApprove: noopAsync, onReject: noopAsync,
    ...props,
  }))
}

test('renders an ACTIVE entry under its Polish category label, not the raw section enum', () => {
  const html = render()
  assert.match(html, /Cel/)
  assert.doesNotMatch(html, />GOAL</)
  assert.match(html, /Zaprojektuj prosty endpoint produktów/)
})

test('a PENDING AGENT_PROPOSED entry never renders as a confirmed finding', () => {
  const html = render({ context: context([entry({ entryId: 'p1', classification: 'AGENT_PROPOSED', status: 'PENDING', content: 'Endpoint powinien obsługiwać paginację.' })]) })
  assert.match(html, /Propozycje specjalistów/)
  assert.match(html, /Endpoint powinien obsługiwać paginację/)
  assert.match(html, /Brak jeszcze żadnych ustaleń/) // no CONFIRMED finding exists yet -- the proposal is separate, still PENDING
  assert.equal(html.includes('class="context-section"'), false) // no confirmed-findings section rendered at all
})

test('an approved AGENT_PROPOSED entry (status ACTIVE) renders as a confirmed finding, keeping its classification as provenance only', () => {
  const html = render({ context: context([entry({ entryId: 'p1', classification: 'AGENT_PROPOSED', status: 'ACTIVE', content: 'Endpoint powinien obsługiwać paginację.', approvedBy: 'owner-1' })]) })
  assert.match(html, /Endpoint powinien obsługiwać paginację/)
  assert.doesNotMatch(html, /Propozycje specjalistów/) // no longer PENDING, so not listed as an open proposal
})

test('REJECTED and WITHDRAWN entries never render as confirmed findings', () => {
  const html = render({ context: context([
    entry({ entryId: 'r1', status: 'REJECTED', content: 'Odrzucona propozycja' }),
    entry({ entryId: 'w1', status: 'WITHDRAWN', content: 'Wycofane ustalenie' }),
  ]) })
  assert.doesNotMatch(html, /Odrzucona propozycja/)
  assert.doesNotMatch(html, /Wycofane ustalenie/)
  assert.match(html, /Brak jeszcze żadnych ustaleń/)
})

test('canMutate=false hides Dodaj ustalenie, Edytuj, and proposal decision buttons but still shows content', () => {
  const html = render({
    canMutate: false,
    context: context([entry(), entry({ entryId: 'p1', classification: 'AGENT_PROPOSED', status: 'PENDING', content: 'Propozycja X' })]),
  })
  assert.doesNotMatch(html, /Dodaj ustalenie/)
  assert.doesNotMatch(html, /Edytuj/)
  assert.doesNotMatch(html, /Zatwierdź/)
  assert.doesNotMatch(html, /Odrzuć/)
  assert.match(html, /Zaprojektuj prosty endpoint produktów/)
  assert.match(html, /Propozycja X/)
})

test('canMutate=true shows Dodaj ustalenie, Edytuj, and proposal decision buttons', () => {
  const html = render({
    context: context([entry(), entry({ entryId: 'p1', classification: 'AGENT_PROPOSED', status: 'PENDING', content: 'Propozycja X' })]),
  })
  assert.match(html, /Dodaj ustalenie/)
  assert.match(html, /Edytuj/)
  assert.match(html, /Zatwierdź/)
  assert.match(html, /Odrzuć/)
})

test('version history is collapsed by default and lists current vs historical, without a diff view', () => {
  const versions: ContextVersionSummary[] = [
    { analysisContextVersionId: 'v1', versionNumber: 1, createdAt: '2026-08-29T09:00:00Z', createdBy: 'owner-1', current: false },
    { analysisContextVersionId: 'v2', versionNumber: 2, createdAt: '2026-08-29T10:00:00Z', createdBy: 'owner-1', current: true },
  ]
  const collapsed = render({ versions })
  assert.match(collapsed, /Wersje kontekstu/)
  assert.doesNotMatch(collapsed, /Kontekst v1/) // collapsed: list content not rendered until toggled (no JS in a static render)
})

test('rendering never leaks a raw entryId or analysisContextVersionId as visible text', () => {
  const html = render({
    context: context([entry({ entryId: 'technical-entry-id-xyz' })]),
    versions: [{ analysisContextVersionId: 'technical-version-id-abc', versionNumber: 1, createdAt: '2026-08-29T09:00:00Z', createdBy: 'owner-1', current: true }],
  })
  assert.doesNotMatch(html, /technical-entry-id-xyz/)
  assert.doesNotMatch(html, /technical-version-id-abc/)
})

test('a null context renders nothing (mock/demo mode with no real backend)', () => {
  const html = render({ context: null })
  assert.equal(html, '')
})
