import { useState } from 'react'
import type { EffectiveRole } from '../types.js'

type Props = { apiBaseUrl: string; development: boolean; state: 'idle' | 'access_denied' | 'provider_error' | 'session_expired'; onDevLogin: (role: EffectiveRole) => Promise<void> }

export function LoginScreen({ apiBaseUrl, development, state, onDevLogin }: Props) {
  const [redirecting, setRedirecting] = useState(false)
  const [role, setRole] = useState<EffectiveRole>('OWNER')
  const [devOpen, setDevOpen] = useState(false)
  const message = state === 'access_denied' ? 'To konto Google nie ma dostępu do aplikacji.'
    : state === 'session_expired' ? 'Sesja wygasła. Zaloguj się ponownie.'
      : state === 'provider_error' ? 'Nie udało się zalogować. Spróbuj ponownie.' : null
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <div className="brand-mark" aria-hidden="true">AI</div><p className="eyebrow">AI Platform</p>
    <h1 id="login-title">Twój zespół specjalistów AI</h1>
    <p className="login-copy">Do analizy, planowania, implementacji i kontroli jakości.</p>
    <button className="google-button" type="button" disabled={redirecting} onClick={() => { setRedirecting(true); window.location.assign(`${apiBaseUrl.replace(/\/$/, '')}/auth/google`) }}>
      <span aria-hidden="true" className="google-g">G</span>{redirecting ? 'Przekierowuję do Google…' : 'Kontynuuj z Google'}
    </button>
    <button className="microsoft-button" type="button" disabled={redirecting} onClick={() => { setRedirecting(true); window.location.assign(`${apiBaseUrl.replace(/\/$/, '')}/auth/microsoft`) }}>
      <span aria-hidden="true" className="microsoft-m">M</span>{redirecting ? 'Przekierowuję do Microsoft…' : 'Kontynuuj z Microsoft'}
    </button><p className="security-note">Bezpieczne logowanie przez Google lub Microsoft</p>
    {message && <p className="notice" role="alert">{message}</p>}
    {development && <div className="dev-options"><button className="dev-summary" type="button" aria-expanded={devOpen} onClick={() => setDevOpen(!devOpen)}>Opcje deweloperskie</button>
      {devOpen && <div><label>Rola<select value={role} onChange={(event) => setRole(event.target.value as EffectiveRole)}><option>OWNER</option><option>ADMIN</option><option>OBSERVER</option></select></label><button className="secondary" type="button" onClick={() => void onDevLogin(role)}>Zaloguj lokalnie</button></div>}
    </div>}
  </section></main>
}
