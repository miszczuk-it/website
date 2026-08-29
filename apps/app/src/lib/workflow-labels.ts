import type { SessionResponse, SpecialistTaskType } from '../types.js'

// Central Polish-language glossary for the VS1 workspace (UX redesign task,
// 2026-08-28): the UI speaks in user terms (Analiza/Etap/Specjalista/Wynik),
// never in backend vocabulary (Session/Task/Execution/Artifact). Backend
// identifiers stay backend identifiers -- only user-facing labels live here.
export const STAGE_ORDER: SpecialistTaskType[] = ['BUSINESS_ANALYSIS', 'PROJECT_PLANNING', 'CODE_IMPLEMENTATION', 'QUALITY_REVIEW']

export const STAGE_LABELS: Record<SpecialistTaskType, string> = {
  BUSINESS_ANALYSIS: 'Analiza biznesowa',
  PROJECT_PLANNING: 'Plan projektu',
  CODE_IMPLEMENTATION: 'Implementacja',
  QUALITY_REVIEW: 'Kontrola jakości',
}

export const SPECIALIST_LABELS: Record<SpecialistTaskType, string> = {
  BUSINESS_ANALYSIS: 'Business Analyst',
  PROJECT_PLANNING: 'Project Manager',
  CODE_IMPLEMENTATION: 'Developer',
  QUALITY_REVIEW: 'QA',
}

export const SESSION_STATUS_LABELS: Record<SessionResponse['status'], string> = {
  CREATED: 'Utworzona',
  ACTIVE: 'W toku',
  COMPLETED: 'Zakończona',
  CANCELLED: 'Anulowana',
  ARCHIVED: 'Zarchiwizowana',
}

export const STAGE_STATE_ICON: Record<'COMPLETED' | 'CURRENT' | 'UPCOMING', string> = {
  COMPLETED: '✓',
  CURRENT: '●',
  UPCOMING: '○',
}

// Owner UX Follow-up (GAP-017): server-owned cost, USD only for now (task
// §16 -- no PLN conversion without a real exchange rate). null/undefined
// (never dispatched, or provider usage not yet settled) renders as an
// em-dash, never "$NaN"/"undefined".
export function formatUsd(costUsd: number | null | undefined): string {
  if (costUsd === null || costUsd === undefined || Number.isNaN(costUsd)) return '—'
  return `$${costUsd.toFixed(4)}`
}

// Distinguishes the two revision kinds in the language of §24 of the task:
// returnToStageSourceArtifactId set => the Task was created by "Wróć do
// wcześniejszego etapu"; revisionOfTaskId set without it => "Poproś o
// poprawę" on the same stage. Neither set => not a revision at all.
export type RevisionKind = 'CURRENT_STAGE_REVISION' | 'RETURN_TO_STAGE' | null
export function revisionKindOf(task: { revisionOfTaskId?: string | null; returnToStageSourceArtifactId?: string | null }): RevisionKind {
  if (task.returnToStageSourceArtifactId) return 'RETURN_TO_STAGE'
  if (task.revisionOfTaskId) return 'CURRENT_STAGE_REVISION'
  return null
}
export const REVISION_KIND_LABELS: Record<Exclude<RevisionKind, null>, string> = {
  CURRENT_STAGE_REVISION: 'Poprawa bieżącego etapu',
  RETURN_TO_STAGE: 'Powrót do wcześniejszego etapu',
}
