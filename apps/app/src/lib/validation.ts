import type { AnalysisFormValues } from '../types.js'

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
