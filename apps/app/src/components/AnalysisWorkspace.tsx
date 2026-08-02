import { useMemo, useState } from 'react'
import { createPlatformApiClient } from '../lib/platform-api.js'
import { toSafeUiError, type SafeUiError } from '../lib/safe-error.js'
import { validateAnalysisForm, type FormErrors } from '../lib/validation.js'
import type { AnalysisFormValues, AnalysisResult, ExecutionStatus } from '../types.js'

const EMPTY_FORM: AnalysisFormValues = {
  projectName: '',
  goalOrProblem: '',
  businessAnalystTask: '',
}

type Props = {
  apiBaseUrl: string
  apiEnabled: boolean
}

export function AnalysisWorkspace({ apiBaseUrl, apiEnabled }: Props) {
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<ExecutionStatus>('IDLE')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [safeError, setSafeError] = useState<SafeUiError | null>(null)
  const client = useMemo(() => createPlatformApiClient(apiBaseUrl), [apiBaseUrl])

  function updateField(field: keyof AnalysisFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateAnalysisForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || !apiEnabled) return

    setSafeError(null)
    setStatus('SUBMITTING')
    try {
      const response = await client.startAnalysis(values)
      setResult(response)
      setStatus(response.status)
    } catch (error) {
      setStatus('FAILED')
      setSafeError(toSafeUiError(error))
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">AI Platform · app.miszczuk.it</p>
        <h1>Rozpocznij analizę projektu</h1>
        <p>Przygotuj kontekst dla Business Analyst. Platform API pozostaje jedynym punktem komunikacji aplikacji.</p>
      </header>

      {!apiEnabled && (
        <div className="notice" role="status">
          Formularz jest widoczny w trybie bezpiecznego podglądu. Uruchomienie analizy będzie dostępne po wdrożeniu Platform API.
        </div>
      )}

      <section className="panel" aria-labelledby="analysis-form-title">
        <h2 id="analysis-form-title">Dane analizy</h2>
        <form onSubmit={submit} noValidate>
          <label>
            Nazwa projektu
            <input value={values.projectName} onChange={(event) => updateField('projectName', event.target.value)} aria-invalid={Boolean(errors.projectName)} />
            {errors.projectName && <span className="field-error">{errors.projectName}</span>}
          </label>
          <label>
            Cel albo problem
            <textarea value={values.goalOrProblem} onChange={(event) => updateField('goalOrProblem', event.target.value)} aria-invalid={Boolean(errors.goalOrProblem)} />
            {errors.goalOrProblem && <span className="field-error">{errors.goalOrProblem}</span>}
          </label>
          <label>
            Zadanie dla Business Analyst
            <textarea value={values.businessAnalystTask} onChange={(event) => updateField('businessAnalystTask', event.target.value)} aria-invalid={Boolean(errors.businessAnalystTask)} />
            {errors.businessAnalystTask && <span className="field-error">{errors.businessAnalystTask}</span>}
          </label>
          <button className="primary" type="submit" disabled={!apiEnabled || status === 'SUBMITTING'}>Uruchom analizę</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="execution-status-title">
        <h2 id="execution-status-title">Status wykonania</h2>
        <output className={`status status-${status.toLowerCase()}`}>{status}</output>
        {safeError && <p role="alert">{safeError.message}{safeError.reference ? ` Identyfikator zgłoszenia: ${safeError.reference}` : ''}</p>}
      </section>

      <section className="panel" aria-labelledby="analysis-result-title">
        <h2 id="analysis-result-title">Wynik</h2>
        {result?.artifact ? (
          <article>
            <p>Wersja {result.artifact.version}</p>
            <h3>{result.artifact.title}</h3>
            <p>{result.artifact.content}</p>
          </article>
        ) : <p>Brak wyniku. Aplikacja nie prezentuje danych zastępczych.</p>}
        <div className="actions">
          <button type="button" disabled={!result?.artifact}>Zatwierdź</button>
          <button type="button" disabled={!result?.artifact}>Odrzuć</button>
          <button type="button" disabled={!result?.artifact}>Poproś o poprawę</button>
        </div>
      </section>
    </main>
  )
}
