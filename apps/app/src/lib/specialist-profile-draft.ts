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
