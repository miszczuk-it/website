export class PlatformApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly correlationId?: string,
    public readonly httpStatus?: number,
    public readonly currentRevision?: number,
  ) {
    super(code)
    this.name = 'PlatformApiError'
  }
}

export type SafeUiError = { message: string; reference?: string }

const SAFE_MESSAGES: Record<string, string> = {
  CONFLICT: 'Dane zostały zmienione. Odśwież stan przed ponowieniem.',
  NOT_FOUND: 'Nie znaleziono wymaganego elementu procesu.',
  VALIDATION_ERROR: 'Platform API odrzuciło dane formularza.',
  SERVICE_UNAVAILABLE: 'Usługa jest chwilowo niedostępna. Spróbuj ponownie później.',
  TIMEOUT: 'Przekroczono czas oczekiwania na odpowiedź. Sprawdź stan przed ponowieniem.',
  NETWORK_ERROR: 'Nie udało się połączyć z Platform API.',
  INVALID_RESPONSE: 'Odpowiedź Platform API jest niezgodna z kontraktem.',
}

export function toSafeUiError(error: unknown): SafeUiError {
  if (error instanceof PlatformApiError) return {
    message: SAFE_MESSAGES[error.code] ?? 'Nie udało się wykonać operacji. Spróbuj ponownie później.',
    reference: error.correlationId,
  }
  return { message: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.' }
}
