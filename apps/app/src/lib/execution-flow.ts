import type { ExecutionStatus, ExecutionStatusResponse } from '../types.js'
import type { PlatformApiClient } from './platform-api.js'

// Statuses where the LLM Gateway lifecycle is still in flight and the
// frontend keeps polling GET /executions/:id/status (MVP-IMPL-004C.2+ API).
// Everything else (LLM_RESULT_READY, FAILED_RETRYABLE, FAILED_FINAL,
// UNKNOWN, and any other status the backend may report) is treated as a
// stopping point -- polling never guesses beyond what the API states.
export const EXECUTION_POLLING_STATUSES = new Set<ExecutionStatus>(['WAITING_FOR_LLM_GATEWAY', 'RUNNING'])

export type PollController = { stop: () => void; whenDone: Promise<void> }

type PollOptions = {
  intervalMs?: number
  wait?: (milliseconds: number) => Promise<void>
  onState?: (status: ExecutionStatusResponse) => void
  onError?: (error: unknown) => void
}

// Polls the status endpoint on a fixed interval while the Execution is
// still in flight and stops as soon as a non-polling status is observed or
// the caller calls stop() (component unmount). No WebSocket/SSE -- plain
// interval polling, matching the rest of this app's style.
export function trackExecutionStatus(client: PlatformApiClient, input: { executionId: string; correlationId: string }, options: PollOptions = {}): PollController {
  let cancelled = false
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const intervalMs = options.intervalMs ?? 2_500

  const whenDone = (async () => {
    while (!cancelled) {
      await wait(intervalMs)
      if (cancelled) return
      let status: ExecutionStatusResponse
      try {
        status = await client.getExecutionStatus(input.executionId, input.correlationId)
      } catch (error) {
        if (!cancelled) options.onError?.(error)
        return
      }
      if (cancelled) return
      options.onState?.(status)
      if (!EXECUTION_POLLING_STATUSES.has(status.status)) return
    }
  })()

  return { stop: () => { cancelled = true }, whenDone }
}

export type SingleFlightGuard = { busy: boolean }

// Blocks a concurrent duplicate call while one is already in flight --
// the double-click / browser-retry protection shared by "start analysis"
// and "retry analysis". The guard object is owned by the caller (one per
// user intent) so start and retry never share a lock.
export async function runGuarded<T>(guard: SingleFlightGuard, action: () => Promise<T>): Promise<T | null> {
  if (guard.busy) return null
  guard.busy = true
  try {
    return await action()
  } finally {
    guard.busy = false
  }
}
