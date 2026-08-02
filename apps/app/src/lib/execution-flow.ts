import type { ExecutionResponse, ExecutionStatus } from '../types.js'
import type { PlatformApiClient } from './platform-api.js'

export type ExecutionTrackingState = {
  executionId: string | null
  status: ExecutionStatus | 'STARTING_EXECUTION' | 'FAILED'
  error: unknown | null
}

type Options = {
  intervalMs?: number
  maxPolls?: number
  wait?: (milliseconds: number) => Promise<void>
  onState?: (state: ExecutionTrackingState) => void
}

const TERMINAL_FOR_MVP = new Set<ExecutionStatus>(['WAITING_FOR_LLM_GATEWAY', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED'])

export async function startAndTrackExecution(client: PlatformApiClient, input: {
  taskId: string; taskRevision: number; correlationId: string; idempotencyKey: string
}, options: Options = {}): Promise<ExecutionTrackingState> {
  const publish = options.onState ?? (() => {})
  let state: ExecutionTrackingState = { executionId: null, status: 'STARTING_EXECUTION', error: null }
  publish(state)
  try {
    let execution: ExecutionResponse = await client.startExecution(input.taskId, input.taskRevision, input.idempotencyKey, input.correlationId)
    state = { executionId: execution.executionId, status: execution.status, error: null }; publish(state)
    const maxPolls = options.maxPolls ?? 20
    const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
    for (let poll = 0; !TERMINAL_FOR_MVP.has(execution.status) && poll < maxPolls; poll += 1) {
      await wait(options.intervalMs ?? 2_000)
      execution = await client.getExecution(execution.executionId, input.correlationId)
      state = { executionId: execution.executionId, status: execution.status, error: null }; publish(state)
    }
    return state
  } catch (error) {
    state = { ...state, status: 'FAILED', error }; publish(state); return state
  }
}
