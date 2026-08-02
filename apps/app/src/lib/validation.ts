import type { AnalysisFormValues } from '../types.js'

export type FormErrors = Partial<Record<keyof AnalysisFormValues, string>>

export function validateAnalysisForm(values: AnalysisFormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.projectName.trim()) errors.projectName = 'Podaj nazwę projektu.'
  if (!values.goalOrProblem.trim()) errors.goalOrProblem = 'Opisz cel albo problem.'
  if (!values.businessAnalystTask.trim()) errors.businessAnalystTask = 'Opisz zadanie dla Business Analyst.'
  return errors
}
