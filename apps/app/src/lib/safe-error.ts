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
  CONTRACT_MISMATCH: 'Kontrakt API nie zawiera danych wymaganych do bezpiecznego wykonania tej akcji.',
  ARTIFACT_CONTENT_INVALID: 'Treść nowej wersji nie spełnia wymagań kontraktu.',
  UNAUTHENTICATED: 'Sesja wygasła lub nie jesteś zalogowany. Zaloguj się ponownie.',
  SESSION_EXPIRED: 'Sesja wygasła. Zaloguj się ponownie.',
  NOT_AUTHORIZED: 'Nie masz uprawnień do wykonania tej akcji.',
  ARTIFACT_VERSION_NOT_CURRENT: 'Ta wersja Artifact przestała być bieżąca. Odśwież stan przed ponowieniem.',
  EXTERNAL_LLM_CALLS_DISABLED: 'Wywołania modelu LLM są wyłączone w tym środowisku.',
  N8N_INTEGRATION_DISABLED: 'Integracja z bramą wykonawczą jest wyłączona w tym środowisku.',
  GATEWAY_NOT_CONFIGURED: 'Brama wykonawcza nie jest skonfigurowana w tym środowisku.',
  GATEWAY_MOCK_DISABLED: 'Scenariusz testowy bramy jest niedostępny w tym środowisku.',
  IDEMPOTENCY_BLOCKED: 'Powtórzone żądanie z innymi danymi zostało odrzucone.',
  NOT_ACTIVE_LINEAGE: 'Wybrany etap nie jest już częścią aktywnej ścieżki tej analizy. Odśwież stan i spróbuj ponownie.',
  NOT_EARLIER_STAGE: 'Można wrócić wyłącznie do wcześniejszego, zakończonego etapu.',
  LINEAGE_MISMATCH: 'Wybrany etap nie odpowiada wskazanym danym. Odśwież stan i spróbuj ponownie.',
}

export function toSafeUiError(error: unknown): SafeUiError {
  if (error instanceof PlatformApiError) return {
    message: SAFE_MESSAGES[error.code] ?? 'Nie udało się wykonać operacji. Spróbuj ponownie później.',
    reference: error.correlationId,
  }
  return { message: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.' }
}
