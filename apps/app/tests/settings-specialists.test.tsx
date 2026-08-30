import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsSpecialists } from '../src/components/SettingsSpecialists.js'
import { draftFromVersions } from '../src/lib/specialist-profile-draft.js'
import type { SpecialistProfileResponse, SpecialistProfileVersionResponse } from '../src/types.js'

// ADR-009 (GAP-018 finding 2): Settings -> Specjaliści. Purely presentational
// (data lives in props, mirroring AnalysisList.tsx), so a static render is
// enough to prove OBSERVER never sees mutation controls -- the backend is
// still the sole authority on whether create/activate is actually allowed.

const PROFILES: SpecialistProfileResponse[] = [
  { specialistType: 'BUSINESS_ANALYSIS', name: 'BUSINESS_ANALYSIS', activeVersion: 1 },
  { specialistType: 'PROJECT_PLANNING', name: 'PROJECT_PLANNING', activeVersion: 1 },
  { specialistType: 'CODE_IMPLEMENTATION', name: 'CODE_IMPLEMENTATION', activeVersion: 1 },
  { specialistType: 'QUALITY_REVIEW', name: 'QUALITY_REVIEW', activeVersion: 1 },
]

const VERSIONS: SpecialistProfileVersionResponse[] = [
  { specialistProfileVersionId: 'technical-id-aaa111', specialistType: 'BUSINESS_ANALYSIS', versionNumber: 1, status: 'ACTIVE', systemPrompt: 'SYSTEM_PROMPT_SECRET_CONTENT_V1', responsibilities: '', excludedResponsibilities: '', expectedOutputGuidance: '', modelProfileKey: 'default' },
  { specialistProfileVersionId: 'technical-id-bbb222', specialistType: 'BUSINESS_ANALYSIS', versionNumber: 2, status: 'DRAFT', systemPrompt: 'SYSTEM_PROMPT_SECRET_CONTENT_V2', responsibilities: '', excludedResponsibilities: '', expectedOutputGuidance: '', modelProfileKey: 'default' },
]

function render(canMutate: boolean, selectedType: 'BUSINESS_ANALYSIS' | null = 'BUSINESS_ANALYSIS', versions: SpecialistProfileVersionResponse[] | null = VERSIONS) {
  return renderToStaticMarkup(createElement(SettingsSpecialists, {
    profiles: PROFILES, selectedType, versions, canMutate,
    creating: false, activating: false, error: null, notice: null,
    onSelectType: () => undefined, onCreateDraft: async () => undefined, onActivate: async () => undefined, onBack: () => undefined,
  }))
}

test('lists all four specialist profiles with their active version', () => {
  const html = render(true, null, null)
  assert.match(html, /Business Analyst/)
  assert.match(html, /Project Manager/)
  assert.match(html, /Developer/)
  assert.match(html, /QA/)
  assert.match(html, /Aktywna wersja: 1/)
})

test('OWNER/ADMIN (canMutate) sees the Aktywuj button for a DRAFT version and the + Nowy DRAFT action', () => {
  const html = render(true)
  assert.match(html, /Aktywuj/)
  assert.match(html, /Nowy DRAFT/)
  assert.match(html, /Wersja 1/)
  assert.match(html, /Wersja 2/)
})

test('OBSERVER (canMutate=false) never sees the Aktywuj button or the + Nowy DRAFT action, even though it still sees version history', () => {
  const html = render(false)
  assert.doesNotMatch(html, /Aktywuj/)
  assert.doesNotMatch(html, /Nowy DRAFT/)
  assert.match(html, /Wersja 1/)
  assert.match(html, /Wersja 2/)
})

test('the version history list never renders the system prompt content or the raw specialistProfileVersionId', () => {
  const html = render(true)
  assert.doesNotMatch(html, /SYSTEM_PROMPT_SECRET_CONTENT/)
  assert.doesNotMatch(html, /technical-id-aaa111|technical-id-bbb222/)
})

// §22: "+ Nowy DRAFT" must start from the current ACTIVE version's content,
// never blank -- regression for a bug where the draft form always opened
// empty regardless of what was already ACTIVE.
test('draftFromVersions copies the ACTIVE version content, not the DRAFT one', () => {
  const draft = draftFromVersions(VERSIONS)
  assert.equal(draft.systemPrompt, 'SYSTEM_PROMPT_SECRET_CONTENT_V1')
})

test('draftFromVersions falls back to an empty draft when no ACTIVE version exists', () => {
  const draft = draftFromVersions([{ ...VERSIONS[1]!, status: 'DRAFT' }])
  assert.equal(draft.systemPrompt, '')
})
