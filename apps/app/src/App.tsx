import { useEffect, useMemo, useState } from 'react'
import { VerticalSliceWorkspace } from './components/VerticalSliceWorkspace.js'
import { LoginScreen } from './components/LoginScreen.js'
import { createPlatformApiClient } from './lib/platform-api.js'
import type { AuthMeResponse, EffectiveRole } from './types.js'
import './styles.css'

function App() {
  const apiBaseUrl = import.meta.env.VITE_PLATFORM_API_URL ?? '/api'
  const apiEnabled = import.meta.env.VITE_PLATFORM_API_ENABLED === 'true'
  const appEnvironment = import.meta.env.VITE_APP_ENV ?? 'LOCAL'
  const api = useMemo(() => createPlatformApiClient(apiBaseUrl), [apiBaseUrl])
  const [identity, setIdentity] = useState<AuthMeResponse | null>(null)
  const [checked, setChecked] = useState(!apiEnabled)
  useEffect(() => {
    if (!apiEnabled) return
    void api.authMe(crypto.randomUUID()).then(setIdentity).catch(() => undefined).finally(() => setChecked(true))
  }, [api, apiEnabled])
  if (!checked) return <main className="login-page" aria-busy="true" />
  if (!identity && apiEnabled) {
    const auth = new URLSearchParams(window.location.search).get('auth')
    const state = auth === 'access_denied' ? 'access_denied' : auth === 'provider_error' ? 'provider_error' : 'idle'
    return <LoginScreen apiBaseUrl={apiBaseUrl} development={appEnvironment !== 'PRODUCTION'} state={state} onDevLogin={async (role: EffectiveRole) => setIdentity(await api.devLogin(role, crypto.randomUUID()))} />
  }
  return (
    <VerticalSliceWorkspace
      apiBaseUrl={apiBaseUrl}
      apiEnabled={apiEnabled}
      appEnvironment={appEnvironment}
      identity={identity}
      onLogout={async () => { await api.logout(crypto.randomUUID()); setIdentity(null) }}
    />
  )
}

export default App
