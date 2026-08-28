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
export type EffectiveRole = 'OWNER' | 'OBSERVER' | 'ADMIN'
export type AuthMeResponse = {
  contractVersion: '1.0'
  userId: string
  displayName: string
  effectiveRole: EffectiveRole
  permissions: string[]
}
export type SessionListItem = SessionResponse & { ownerId: string; createdAt: string }
export type TaskResponse = { contractVersion: '1.0'; taskId: string; sessionId: string; taskType: string; status: 'CREATED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; revision: number }

export type ExecutionStatus = 'CREATED' | 'BUILDING_CONTEXT' | 'WAITING_FOR_LLM_GATEWAY' | 'WAITING_FOR_USER_INPUT' | 'RUNNING' | 'LLM_RESULT_READY' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CANCELLED' | 'UNKNOWN'
export type AttemptStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CANCELLED' | 'UNKNOWN'
export type ExecutionResponse = {
  contractVersion: '1.0'
  executionId: string
  taskId: string
  correlationId: string
  idempotencyKey: string
  status: ExecutionStatus
  revision: number
}

// Composed, frontend-safe read model from GET /executions/:id/status
// (MVP-IMPL-004C.2+). Never carries prompts, raw provider responses, raw
// callback payloads, secrets or HMAC signatures -- those are never
// persisted on the Platform Application side in the first place.
export type ExecutionStatusResponse = {
  contractVersion: '1.0'
  executionId: string
  status: ExecutionStatus
  // Real backend field since GAP-009 (ai-platform PR #49): the value POST
  // /executions/:id/answer requires as expectedRevision. Superseded the
  // app-state-only Vs1Detail.executionRevision tracking the mock still
  // documents for its own reasons.
  revision: number
  attemptId: string | null
  attemptNumber: number | null
  attemptStatus: AttemptStatus | null
  providerRequestId: string | null
  provider: string | null
  model: string | null
  workflowExecutionId: string | null
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  totalTokens: number | null
  actualCost: number | null
  currency: string | null
  isIncomplete: boolean
  incompleteReason: string | null
  fallbackUsed: boolean
  retryAllowed: boolean
  reconcileRequired: boolean
  safeErrorCode: string | null
  safeErrorMessage: string | null
  updatedAt: string
  pendingQuestion?: { questionId: string; prompt: string; inputSchema: null } | null
}

// Artifact / Human-in-the-Loop review types (MVP-IMPL-005D), mirroring
// contracts/mvp/artifact-*.schema.json in ai-platform 1:1.
export type ArtifactStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'ARCHIVED'
export type ArtifactDecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_REVISION' | 'COMMENT_ONLY'
export type ArtifactActorType = 'HUMAN' | 'SYSTEM'

export type ArtifactResponse = {
  contractVersion: '1.0'
  artifactId: string
  projectId: string
  sessionId: string
  taskId: string
  executionId: string
  artifactType: string
  title: string
  status: ArtifactStatus
  currentVersionId: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

// contentJson XOR contentText per artifact-version-response.schema.json anyOf.
export type ArtifactVersionResponse = {
  contractVersion: '1.0'
  artifactVersionId: string
  artifactId: string
  versionNumber: number
  sourceAttemptId: string | null
  contentJson?: Record<string, unknown>
  contentText?: string
  contentSchemaVersion: string
  checksum: string
  createdByType: 'SYSTEM' | 'HUMAN'
  createdByReference: string
  createdAt: string
}

// Request-shaped, not response-shaped: exactly one of the two content
// forms, matching artifact-version-create.schema.json's anyOf.
export type ArtifactNewVersionContent = { contentText: string } | { contentJson: Record<string, unknown> }

export type ArtifactReviewDecisionResponse = {
  contractVersion: '1.0'
  decisionId: string
  artifactId: string
  artifactVersionId: string
  decisionType: ArtifactDecisionType
  comment: string | null
  actorType: ArtifactActorType
  actorReference: string
  idempotencyKey: string
  createdAt: string
}

// Response envelope for POST /artifacts/:id/decisions (MVP-TASK-006):
// the decision write and the REQUEST_REVISION-triggered Execution are
// reported together so the frontend can start tracking the new Execution
// without a second round-trip. GET /decisions (list/detail) is unaffected
// and still returns bare ArtifactReviewDecisionResponse shapes.
export type ArtifactReviewDecisionEnvelope = {
  contractVersion: '1.0'
  reviewDecision: ArtifactReviewDecisionResponse
  triggeredExecutionId: string | null
}
