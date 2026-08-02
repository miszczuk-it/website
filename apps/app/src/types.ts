export type AnalysisFormValues = {
  projectName: string
  goal: string
  taskDescription: string
}

export type FlowStep =
  | 'IDLE'
  | 'VALIDATING'
  | 'CREATING_PROJECT'
  | 'CREATING_SESSION'
  | 'STARTING_SESSION'
  | 'CREATING_TASK'
  | 'MARKING_TASK_READY'
  | 'READY_FOR_EXECUTION'
  | 'FAILED'

export type CompletedStep = Exclude<FlowStep, 'IDLE' | 'VALIDATING' | 'FAILED'>

export type MvpFlowState = {
  contractVersion: '1.0'
  correlationId: string
  step: FlowStep
  formData: AnalysisFormValues
  projectId: string | null
  sessionId: string | null
  taskId: string | null
  projectRevision: number | null
  sessionRevision: number | null
  taskRevision: number | null
  lastCompletedStep: CompletedStep | null
  errorCode: string | null
}

export type ProjectResponse = { contractVersion: '1.0'; projectId: string; status: 'ACTIVE' | 'ARCHIVED'; revision: number }
export type SessionResponse = { contractVersion: '1.0'; sessionId: string; projectId: string; status: 'CREATED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; revision: number }
export type TaskResponse = { contractVersion: '1.0'; taskId: string; sessionId: string; status: 'CREATED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; revision: number }

export type ExecutionStatus = 'CREATED' | 'BUILDING_CONTEXT' | 'WAITING_FOR_LLM_GATEWAY' | 'RUNNING' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CANCELLED' | 'UNKNOWN'
export type ExecutionResponse = {
  contractVersion: '1.0'
  executionId: string
  taskId: string
  correlationId: string
  idempotencyKey: string
  status: ExecutionStatus
  revision: number
}
