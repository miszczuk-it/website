export type AnalysisFormValues = {
  projectName: string
  goalOrProblem: string
  businessAnalystTask: string
}

export type ExecutionStatus =
  | 'IDLE'
  | 'SUBMITTING'
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN'

export type AnalysisResult = {
  executionId: string
  status: ExecutionStatus
  artifact?: {
    version: string
    title: string
    content: string
  }
  warnings?: string[]
}
