import { PlatformApiError } from './safe-error.js'
import type { PlatformApiClient } from './platform-api.js'
import type { AnalysisFormValues, FlowStep, MvpFlowState } from '../types.js'

export type FlowRunResult = { state: MvpFlowState; error: PlatformApiError | null }
export type StepListener = (state: MvpFlowState) => void

export function createFlowState(formData: AnalysisFormValues, correlationId: string): MvpFlowState {
  return {
    contractVersion: '1.0', correlationId, step: 'VALIDATING', formData,
    projectId: null, sessionId: null, taskId: null,
    projectRevision: null, sessionRevision: null, taskRevision: null,
    lastCompletedStep: null, errorCode: null,
  }
}

export function nextIncompleteStep(state: MvpFlowState): Exclude<FlowStep, 'IDLE' | 'VALIDATING' | 'READY_FOR_EXECUTION' | 'FAILED'> {
  if (!state.projectId) return 'CREATING_PROJECT'
  if (!state.sessionId) return 'CREATING_SESSION'
  if (state.sessionRevision === 0) return 'STARTING_SESSION'
  if (!state.taskId) return 'CREATING_TASK'
  return 'MARKING_TASK_READY'
}

export async function runMvpFlow(client: PlatformApiClient, previous: MvpFlowState, onStep: StepListener = () => {}): Promise<FlowRunResult> {
  let state: MvpFlowState = { ...previous, errorCode: null }
  let activeStep = nextIncompleteStep(state)
  const publish = (patch: Partial<MvpFlowState>) => { state = { ...state, ...patch }; onStep(state) }

  try {
    publish({ step: activeStep })
    if (!state.projectId) {
      const project = await client.createProject(state.formData.projectName, state.formData.goal, state.correlationId)
      publish({ projectId: project.projectId, projectRevision: project.revision, lastCompletedStep: activeStep })
    }
    if (!state.sessionId) {
      activeStep = 'CREATING_SESSION'; publish({ step: activeStep })
      const session = await client.createSession(state.projectId!, state.correlationId)
      publish({ sessionId: session.sessionId, sessionRevision: session.revision, lastCompletedStep: activeStep })
    }
    if (state.sessionRevision === 0) {
      activeStep = 'STARTING_SESSION'; publish({ step: activeStep })
      const session = await client.startSession(state.sessionId!, state.sessionRevision!, state.correlationId)
      publish({ sessionRevision: session.revision, lastCompletedStep: activeStep })
    }
    if (!state.taskId) {
      activeStep = 'CREATING_TASK'; publish({ step: activeStep })
      const task = await client.createTask(state.sessionId!, `Analiza biznesowa: ${state.formData.projectName}`, state.formData.taskDescription, state.correlationId)
      publish({ taskId: task.taskId, taskRevision: task.revision, lastCompletedStep: activeStep })
    }
    if (state.taskRevision === 0) {
      activeStep = 'MARKING_TASK_READY'; publish({ step: activeStep })
      const task = await client.markTaskReady(state.taskId!, state.taskRevision!, state.correlationId)
      publish({ taskRevision: task.revision, lastCompletedStep: activeStep })
    }
    publish({ step: 'READY_FOR_EXECUTION' })
    return { state, error: null }
  } catch (error) {
    const apiError = error instanceof PlatformApiError ? error : new PlatformApiError('UNEXPECTED_ERROR', state.correlationId)
    publish({ step: 'FAILED', errorCode: apiError.code })
    return { state, error: apiError }
  }
}
