import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsSpecialists } from '../src/components/SettingsSpecialists.js'
import { draftFromVersions, selectDisplayedVersion } from '../src/lib/specialist-profile-draft.js'
import type { SpecialistProfileResponse, SpecialistProfileVersionResponse } from '../src/types.js'

// ADR-009 (GAP-018 finding 2): Settings -> Specjaliści. Purely presentational
// (data lives in props, mirroring AnalysisList.tsx), so a static render is
// enough to prove OBSERVER never sees mutation controls -- the backend is
// still the sole authority on whether create/activate is actually allowed.
//
// Specialist Settings UX follow-up: "Aktualna konfiguracja" / per-version
// "Podgląd" adds a second read path into the same version data. Which
// version that panel shows is driven by the pure selectDisplayedVersion
// helper (lib/specialist-profile-draft.ts), so the "click Podgląd on a
// historical version" behavior is unit-tested there directly rather than by
// simulating a click -- this suite never does, see analysis-workspace-ux.test.ts.
// Component-level tests below cover only what a static render of a given
// prop combination can prove: the default (no preview requested) view.

const PROFILES: SpecialistProfileResponse[] = [
  { specialistType: 'BUSINESS_ANALYSIS', name: 'BUSINESS_ANALYSIS', activeVersion: 2 },
  { specialistType: 'PROJECT_PLANNING', name: 'PROJECT_PLANNING', activeVersion: 1 },
  { specialistType: 'CODE_IMPLEMENTATION', name: 'CODE_IMPLEMENTATION', activeVersion: 1 },
  { specialistType: 'QUALITY_REVIEW', name: 'QUALITY_REVIEW', activeVersion: 1 },
]

const BA_VERSIONS: SpecialistProfileVersionResponse[] = [
  { specialistProfileVersionId: 'technical-id-old000', specialistType: 'BUSINESS_ANALYSIS', versionNumber: 1, status: 'SUPERSEDED', systemPrompt: 'SYSTEM_PROMPT_SECRET_CONTENT_OLD', responsibilities: 'RESP_OLD', excludedResponsibilities: 'EXCLUDED_OLD', expectedOutputGuidance: 'OUTPUT_OLD', modelProfileKey: 'default' },
  { specialistProfileVersionId: 'technical-id-aaa111', specialistType: 'BUSINESS_ANALYSIS', versionNumber: 2, status: 'ACTIVE', systemPrompt: 'SYSTEM_PROMPT_SECRET_CONTENT_V1', responsibilities: 'RESP_ACTIVE', excludedResponsibilities: 'EXCLUDED_ACTIVE', expectedOutputGuidance: 'OUTPUT_ACTIVE', modelProfileKey: 'reasoning', maxOutputTokensOverride: 4096 },
  { specialistProfileVersionId: 'technical-id-bbb222', specialistType: 'BUSINESS_ANALYSIS', versionNumber: 3, status: 'DRAFT', systemPrompt: 'SYSTEM_PROMPT_SECRET_CONTENT_V2', responsibilities: 'RESP_DRAFT', excludedResponsibilities: 'EXCLUDED_DRAFT', expectedOutputGuidance: 'OUTPUT_DRAFT', modelProfileKey: 'default' },
]

const PM_VERSIONS: SpecialistProfileVersionResponse[] = [
  { specialistProfileVersionId: 'technical-id-pm001', specialistType: 'PROJECT_PLANNING', versionNumber: 1, status: 'ACTIVE', systemPrompt: 'SYSTEM_PROMPT_PM_ACTIVE', responsibilities: 'RESP_PM_ACTIVE', excludedResponsibilities: 'EXCLUDED_PM_ACTIVE', expectedOutputGuidance: 'OUTPUT_PM_ACTIVE', modelProfileKey: 'default' },
]

function render(canMutate: boolean, selectedType: 'BUSINESS_ANALYSIS' | 'PROJECT_PLANNING' | null = 'BUSINESS_ANALYSIS', versions: SpecialistProfileVersionResponse[] | null = BA_VERSIONS) {
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
  assert.match(html, /Wersja 3/)
})

test('OBSERVER (canMutate=false) never sees the Aktywuj button or the + Nowy DRAFT action, even though it still sees version history', () => {
  const html = render(false)
  assert.doesNotMatch(html, /Aktywuj/)
  assert.doesNotMatch(html, /Nowy DRAFT/)
  assert.match(html, /Wersja 1/)
  assert.match(html, /Wersja 2/)
})

test('every version in the history list -- ACTIVE, DRAFT and SUPERSEDED alike -- offers a Podgląd control', () => {
  const html = render(true)
  assert.equal((html.match(/>Podgląd</g) ?? []).length, 3)
})

test('the history list clearly marks each version\'s status (ACTIVE, DRAFT, SUPERSEDED all distinct)', () => {
  const html = render(true)
  assert.match(html, /status status-active">ACTIVE</)
  assert.match(html, /status status-draft">DRAFT</)
  assert.match(html, /status status-superseded">SUPERSEDED</)
})

test('the version history list rows never render system prompt content or the raw specialistProfileVersionId', () => {
  const html = render(true)
  const listHtml = html.match(/<ul class="specialist-profile-version-list">[\s\S]*?<\/ul>/)?.[0]
  assert.ok(listHtml, 'expected to find the version history list markup')
  assert.doesNotMatch(listHtml, /SYSTEM_PROMPT_SECRET_CONTENT/)
})

test('no raw specialistProfileVersionId (technical/UUID identifier) ever appears anywhere in the rendered screen', () => {
  const html = render(true)
  assert.doesNotMatch(html, /technical-id-old000|technical-id-aaa111|technical-id-bbb222/)
})

test('Aktualna konfiguracja defaults to the ACTIVE version and shows its full profile: system prompt, responsibilities, excluded scope, expected output, model profile', () => {
  const html = render(true)
  assert.match(html, />Aktualna konfiguracja</)
  assert.match(html, /SYSTEM_PROMPT_SECRET_CONTENT_V1</)
  assert.match(html, /RESP_ACTIVE/)
  assert.match(html, /EXCLUDED_ACTIVE/)
  assert.match(html, /OUTPUT_ACTIVE/)
  assert.match(html, /reasoning/)
  // The SUPERSEDED and DRAFT versions' own content must not leak into the
  // default (ACTIVE) view.
  assert.doesNotMatch(html, /SYSTEM_PROMPT_SECRET_CONTENT_OLD/)
  assert.doesNotMatch(html, /SYSTEM_PROMPT_SECRET_CONTENT_V2/)
})

test('Limit odpowiedzi shows the token count when maxOutputTokensOverride is present on the ACTIVE version', () => {
  const html = render(true)
  assert.match(html, /4096 tokenów/)
})

test('Limit odpowiedzi falls back to a placeholder when the ACTIVE version has no maxOutputTokensOverride', () => {
  const versionsWithoutOverride: SpecialistProfileVersionResponse[] = [
    { ...BA_VERSIONS[1]!, maxOutputTokensOverride: undefined },
  ]
  const html = render(true, 'BUSINESS_ANALYSIS', versionsWithoutOverride)
  assert.match(html, /domyślny limit modelu/)
})

test('switching the selected specialist from Business Analyst to Project Manager changes the displayed Aktualna konfiguracja', () => {
  const baHtml = render(true, 'BUSINESS_ANALYSIS', BA_VERSIONS)
  const pmHtml = render(true, 'PROJECT_PLANNING', PM_VERSIONS)
  assert.match(baHtml, /SYSTEM_PROMPT_SECRET_CONTENT_V1</)
  assert.doesNotMatch(baHtml, /SYSTEM_PROMPT_PM_ACTIVE/)
  assert.match(pmHtml, /SYSTEM_PROMPT_PM_ACTIVE/)
  assert.doesNotMatch(pmHtml, /SYSTEM_PROMPT_SECRET_CONTENT_V1</)
})

// §22: "+ Nowy DRAFT" must start from the current ACTIVE version's content,
// never blank -- regression for a bug where the draft form always opened
// empty regardless of what was already ACTIVE.
test('draftFromVersions copies the ACTIVE version content, not the DRAFT or SUPERSEDED ones', () => {
  const draft = draftFromVersions(BA_VERSIONS)
  assert.equal(draft.systemPrompt, 'SYSTEM_PROMPT_SECRET_CONTENT_V1')
  assert.equal(draft.responsibilities, 'RESP_ACTIVE')
})

test('draftFromVersions falls back to an empty draft when no ACTIVE version exists', () => {
  const draft = draftFromVersions([{ ...BA_VERSIONS[1]!, status: 'DRAFT' }])
  assert.equal(draft.systemPrompt, '')
})

// Podgląd (Preview): the same version-detail panel switches from "Aktualna
// konfiguracja" (the ACTIVE version) to a specific historical/DRAFT version
// via this pure lookup -- see this file's header comment for why the click
// itself isn't simulated here.
test('selectDisplayedVersion shows the ACTIVE version by default (no preview requested)', () => {
  const displayed = selectDisplayedVersion(BA_VERSIONS, null)
  assert.equal(displayed?.status, 'ACTIVE')
  assert.equal(displayed?.systemPrompt, 'SYSTEM_PROMPT_SECRET_CONTENT_V1')
})

test('selectDisplayedVersion returns the exact SUPERSEDED version requested via Podgląd, with its own historical content', () => {
  const displayed = selectDisplayedVersion(BA_VERSIONS, 'technical-id-old000')
  assert.equal(displayed?.status, 'SUPERSEDED')
  assert.equal(displayed?.versionNumber, 1)
  assert.equal(displayed?.systemPrompt, 'SYSTEM_PROMPT_SECRET_CONTENT_OLD')
  assert.equal(displayed?.responsibilities, 'RESP_OLD')
})

test('selectDisplayedVersion returns the exact DRAFT version requested via Podgląd', () => {
  const displayed = selectDisplayedVersion(BA_VERSIONS, 'technical-id-bbb222')
  assert.equal(displayed?.status, 'DRAFT')
  assert.equal(displayed?.systemPrompt, 'SYSTEM_PROMPT_SECRET_CONTENT_V2')
})

test('selectDisplayedVersion falls back to the new specialist type\'s ACTIVE version when previewVersionId belongs to a different type', () => {
  // Simulates switching BA -> PM while a BA version was being previewed:
  // the stale id from BA cannot be found in PM's own versions array.
  const displayed = selectDisplayedVersion(PM_VERSIONS, 'technical-id-old000')
  assert.equal(displayed?.status, 'ACTIVE')
  assert.equal(displayed?.systemPrompt, 'SYSTEM_PROMPT_PM_ACTIVE')
})
