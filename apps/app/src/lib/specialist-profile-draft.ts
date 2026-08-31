import type { SpecialistProfileVersionResponse } from '../types.js'

export type SpecialistProfileDraft = { systemPrompt: string; responsibilities: string; excludedResponsibilities: string; expectedOutputGuidance: string }

export const EMPTY_SPECIALIST_PROFILE_DRAFT: SpecialistProfileDraft = { systemPrompt: '', responsibilities: '', excludedResponsibilities: '', expectedOutputGuidance: '' }

// §22: "Utwórz nową wersję" copies the current ACTIVE version's content
// into the new DRAFT -- an Owner making a small tweak should never have to
// retype the whole system prompt from scratch. Falls back to an empty
// draft only if no ACTIVE version exists yet (should not happen once a
// specialistType is bootstrapped, but this stays a total function).
export function draftFromVersions(versions: SpecialistProfileVersionResponse[]): SpecialistProfileDraft {
  const active = versions.find((version) => version.status === 'ACTIVE')
  return active
    ? { systemPrompt: active.systemPrompt, responsibilities: active.responsibilities, excludedResponsibilities: active.excludedResponsibilities, expectedOutputGuidance: active.expectedOutputGuidance }
    : EMPTY_SPECIALIST_PROFILE_DRAFT
}

// Specialist Settings UX: "Aktualna konfiguracja" shows the ACTIVE version by
// default; clicking "Podgląd" on any history row (ACTIVE, DRAFT, or
// SUPERSEDED) switches the same panel to that exact version instead.
// Extracted as a pure function (rather than inline component logic) so it
// stays unit-testable without simulating clicks -- this suite never does,
// see settings-specialists.test.tsx. Also covers the specialist-switch case
// for free: a previewVersionId left over from a different specialistType
// simply won't be found in the new `versions` array, so this naturally
// falls back to that type's own ACTIVE version.
export function selectDisplayedVersion(versions: SpecialistProfileVersionResponse[], previewVersionId: string | null): SpecialistProfileVersionResponse | null {
  const previewed = previewVersionId ? versions.find((version) => version.specialistProfileVersionId === previewVersionId) : undefined
  return previewed ?? versions.find((version) => version.status === 'ACTIVE') ?? null
}
