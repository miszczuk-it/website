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
export type SessionStatus = 'CREATED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'
export type SessionResponse = { contractVersion: '1.0'; sessionId: string; projectId: string; status: SessionStatus; revision: number }
// ADR-009 / GAP-018: Shared Analysis Context. `section` is the canonical
// (technical) category enum -- CONTEXT_SECTION_LABELS in workflow-labels.ts
// maps it to the Polish category the Owner actually sees (Cel/Zakres/...).
// `classification` is provenance only (who/what proposed the entry), never
// visibility -- an entry renders in a prompt/export iff `status==='ACTIVE'`,
// regardless of classification (an approved AGENT_PROPOSED entry keeps that
// classification forever, per the backend's own isEntryVisible).
export type ContextSection = 'GOAL' | 'SCOPE' | 'ASSUMPTIONS' | 'CONSTRAINTS' | 'OWNER_DECISIONS' | 'REQUIREMENTS' | 'OPEN_QUESTIONS' | 'IMPORTANT_NOTES'
export type ContextEntryClassification = 'OWNER_CONFIRMED' | 'AGENT_PROPOSED' | 'DERIVED'
export type ContextEntryStatus = 'ACTIVE' | 'PENDING' | 'REJECTED' | 'WITHDRAWN'
export type AnalysisContextEntry = {
  entryId: string
  section: ContextSection
  classification: ContextEntryClassification
  status: ContextEntryStatus
  content: string
  source: string | null
  createdBy: string
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
}
export type AnalysisContextResponse = {
  contractVersion: '1.0'; analysisContextVersionId: string; analysisContextId: string
  versionNumber: number; entries: AnalysisContextEntry[]; createdAt: string; createdBy: string
}
export type ContextVersionSummary = { analysisContextVersionId: string; versionNumber: number; createdAt: string; createdBy: string; current: boolean }
export type ContextEntryCreateInput = { section: ContextSection; classification: 'OWNER_CONFIRMED' | 'DERIVED'; content: string; source?: string }

// ADR-009 (GAP-018): Settings -> Specjaliści. GET /api/specialist-profiles
// lists one row per fixed specialist type with its currently ACTIVE
// version number; GET .../versions lists the full DRAFT/ACTIVE/SUPERSEDED
// history for one type. The system prompt is real content here (unlike
// everywhere else in this app, which never exposes it) -- this screen is
// exactly the place an Owner edits it.
export type SpecialistProfileResponse = { specialistType: SpecialistTaskType; name: string; activeVersion: number | null }
export type SpecialistProfileVersionStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED'
export type SpecialistProfileVersionResponse = {
  specialistProfileVersionId: string
  specialistType: SpecialistTaskType
  versionNumber: number
  status: SpecialistProfileVersionStatus
  systemPrompt: string
  responsibilities: string
  excludedResponsibilities: string
  expectedOutputGuidance: string
  modelProfileKey: string
}
export type SpecialistProfileVersionCreateInput = {
  systemPrompt: string
  responsibilities?: string
  excludedResponsibilities?: string
  expectedOutputGuidance?: string
  modelProfileKey?: string
}
export type EffectiveRole = 'OWNER' | 'OBSERVER' | 'ADMIN'
export type AuthMeResponse = {
  contractVersion: '1.0'
  userId: string
  displayName: string
  picture?: string | null
  effectiveRole: EffectiveRole
  permissions: string[]
}
// GAP-014: GET /api/sessions enriches each row with human-readable
// metadata so the frontend never has to show a raw sessionId GUID as a
// session's primary label -- projectName/currentTaskType/updatedAt are all
// optional (older cached shapes without them are still structurally valid).
export type SpecialistTaskType = 'BUSINESS_ANALYSIS' | 'PROJECT_PLANNING' | 'CODE_IMPLEMENTATION' | 'QUALITY_REVIEW'
export type SessionListItem = SessionResponse & {
  ownerId: string
  createdAt: string
  projectName?: string | null
  currentTaskType?: SpecialistTaskType | null
  updatedAt?: string
}
export type TaskResponse = {
  contractVersion: '1.0'
  taskId: string
  sessionId: string
  taskType: string
  status: 'CREATED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  revision: number
  title?: string
  description?: string
  revisionOfTaskId?: string | null
  // Owner UX Follow-up (GAP-017): only populated on Task entries embedded in
  // SessionWorkflowResponse.chain[] (activeTask/historicalTasks) -- absent
  // (not just null) on every other endpoint that returns a raw TaskResponse.
  // costUsd sums every Attempt of every Execution of this one Task (retries
  // included); undefined/never-set in the source map means "never
  // dispatched", which is distinct from a real $0 settlement.
  costUsd?: number | null
  // The human feedback that caused this Task to be created as a revision --
  // read back from its own CREATE audit event's `reason` (server-owned,
  // persisted since this Task was created, not a frontend-only value).
  revisionReason?: string | null
  // Already existed on Task (migration 062) but was not exposed to the
  // frontend until now. Set => this Task is a RETURN_TO_STAGE revision
  // ("Powrót do wcześniejszego etapu"); unset with revisionOfTaskId set =>
  // CURRENT_STAGE_REVISION ("Poprawa bieżącego etapu").
  returnToStageSourceArtifactId?: string | null
  // The Artifact this Task produced, if any -- lets the frontend fetch a
  // historical Task's read-only content via the existing GET
  // /artifacts/{id} + GET /artifacts/{id}/versions endpoints.
  artifactId?: string | null
}

// GAP-015: GET /api/sessions/:id/workflow -- the server-computed active
// lineage of the fixed BA->PM->Developer->QA chain. The frontend never
// infers which Task/Artifact is active vs. historical itself.
export type WorkflowStageState = 'COMPLETED' | 'CURRENT' | 'UPCOMING'
export type SessionWorkflowStage = {
  taskType: SpecialistTaskType
  state: WorkflowStageState
  activeTask: TaskResponse | null
  activeArtifact: ArtifactResponse | null
  historicalTasks: TaskResponse[]
  // Owner UX Follow-up (GAP-017): sum of activeTask.costUsd + every
  // historicalTasks[].costUsd for this one stage. null, not 0, when none of
  // this stage's Tasks have a settled Attempt yet.
  stageCostUsd?: number | null
}
export type SessionWorkflowResponse = {
  contractVersion: '1.0'
  sessionId: string
  sessionStatus: SessionStatus
  chain: SessionWorkflowStage[]
  currentStageIndex: number
  totalStages: number
  currentSpecialistTaskType: SpecialistTaskType | null
  nextSpecialistTaskType: SpecialistTaskType | null
  // Owner UX Follow-up (GAP-017): server-owned sum across the whole
  // analysis (every stage, revision, retry) -- the frontend never computes
  // cost from tokens locally. null when nothing has settled yet.
  analysisTotalCostUsd?: number | null
  costCurrency?: string | null
}

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
