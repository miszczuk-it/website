import type { AnalysisFormValues, ArtifactNewVersionContent } from '../types.js'

export type FormErrors = Partial<Record<keyof AnalysisFormValues, string>>

export function validateAnalysisForm(values: AnalysisFormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.projectName.trim()) errors.projectName = 'Podaj nazwę projektu.'
  else if (values.projectName.length > 200) errors.projectName = 'Nazwa projektu może mieć maksymalnie 200 znaków.'
  if (!values.goal.trim()) errors.goal = 'Opisz cel lub problem.'
  else if (values.goal.length > 5000) errors.goal = 'Cel lub problem może mieć maksymalnie 5000 znaków.'
  if (!values.taskDescription.trim()) errors.taskDescription = 'Opisz zadanie dla Business Analyst.'
  else if (values.taskDescription.length > 10000) errors.taskDescription = 'Zadanie może mieć maksymalnie 10000 znaków.'
  return errors
}

export type NewVersionValidation = { ok: true; content: ArtifactNewVersionContent } | { ok: false; error: string }

// Plain textarea input, never interpreted as HTML/rich text (task binding
// decision: no rich-text editor for manual ArtifactVersion authoring).
// JSON mode requires JSON.parse to succeed and describe a plain object
// before a request is ever built -- a syntax error here must never reach
// the network.
export function validateNewVersionContent(mode: 'TEXT' | 'JSON', text: string, json: string): NewVersionValidation {
  if (mode === 'JSON') {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (error) {
      return { ok: false, error: `Niepoprawny JSON: ${error instanceof Error ? error.message : 'błąd składni'}` }
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'JSON musi opisywać obiekt.' }
    return { ok: true, content: { contentJson: parsed as Record<string, unknown> } }
  }
  if (text.trim() === '') return { ok: false, error: 'Treść nie może być pusta.' }
  return { ok: true, content: { contentText: text } }
}
