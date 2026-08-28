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
}

export const STAGE_STATE_ICON: Record<'COMPLETED' | 'CURRENT' | 'UPCOMING', string> = {
  COMPLETED: '✓',
  CURRENT: '●',
  UPCOMING: '○',
}
