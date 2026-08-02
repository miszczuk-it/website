import { PlatformApiError } from './safe-error.js'
import type { AnalysisFormValues, AnalysisResult } from '../types.js'

type FetchLike = typeof fetch

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, '')
  if (normalized.startsWith('/')) return normalized
  const parsed = new URL(normalized)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported Platform API protocol')
  return normalized
}

export function createPlatformApiClient(baseUrl: string, fetchImpl: FetchLike = fetch) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  return {
    async startAnalysis(values: AnalysisFormValues): Promise<AnalysisResult> {
      const correlationId = crypto.randomUUID()
      const requestId = crypto.randomUUID()
      const response = await fetchImpl(`${normalizedBaseUrl}/mvp/analyses`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': correlationId,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ contractVersion: '1.0', ...values }),
      })
      if (!response.ok) {
        let reference = response.headers.get('x-correlation-id') ?? correlationId
        let code = 'API_ERROR'
        try {
          const body = await response.json() as { error?: { code?: string; correlationId?: string } }
          code = body.error?.code ?? code
          reference = body.error?.correlationId ?? reference
        } catch {
          // The UI intentionally ignores untrusted technical response details.
        }
        throw new PlatformApiError(code, reference)
      }
      return await response.json() as AnalysisResult
    },
  }
}
