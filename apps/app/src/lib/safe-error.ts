export class PlatformApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly correlationId?: string,
  ) {
    super(code)
    this.name = 'PlatformApiError'
  }
}

export type SafeUiError = {
  message: string
  reference?: string
}

export function toSafeUiError(error: unknown): SafeUiError {
  if (error instanceof PlatformApiError) {
    return {
      message: 'Nie udało się wykonać operacji. Spróbuj ponownie później.',
      reference: error.correlationId,
    }
  }
  return { message: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.' }
}
