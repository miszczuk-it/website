import { useEffect, useMemo, useState } from 'react'
import type { EffectiveRole } from '../types.js'
import { toSafeUiError } from '../lib/safe-error.js'
import { createMockVs1Service, createRealVs1Service, type Vs1Detail, type Vs1Service } from '../lib/vs1-service.js'

type Props = { apiBaseUrl: string; apiEnabled: boolean; appEnvironment: string }
export function VerticalSliceWorkspace({ apiBaseUrl, apiEnabled, appEnvironment }: Props) {
  const service = useMemo<Vs1Service>(() => apiEnabled ? createRealVs1Service(apiBaseUrl) : createMockVs1Service(), [apiBaseUrl, apiEnabled])
  const dev = appEnvironment !== 'PRODUCTION'
  const [role, setRole] = useState<EffectiveRole>('OWNER'); const [user, setUser] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Vs1Detail['session'][]>([]); const [detail, setDetail] = useState<Vs1Detail | null>(null)
  const [projectName, setProjectName] = useState('Nowa analiza'); const [goal, setGoal] = useState('Zakres integracji z systemem X'); const [answer, setAnswer] = useState('Wyłącznie odczyt danych.'); const [notice, setNotice] = useState<string | null>(null)
  // Every action below can trigger a real, billed LLM Gateway call and takes
  // seconds to round-trip; without this guard a user unsure whether their
  // click registered (no built-in loading affordance) can fire it again,
  // creating a second Project/Session/Execution chain and doubling live
  // OpenAI cost -- confirmed as a real risk during Local UI / Browser
  // Validation (2026-08-28). One flag is enough: these actions never
  // overlap (each is only reachable from its own render branch).
  const [busy, setBusy] = useState(false)
  const report = (error: unknown) => setNotice(toSafeUiError(error).message)
  const load = async () => { try { setSessions(await service.listSessions()) } catch (error) { report(error) } }
  const run = async (action: () => Promise<Vs1Detail>) => {
    // A previous action's failure notice must not linger and look like a
    // fresh action failed too -- confirmed as real, confusing behavior
    // during Local UI / Browser Validation (2026-08-28): the notice was
    // never cleared anywhere, so once shown it stayed on screen regardless
    // of any later successful action.
    setNotice(null)
    setBusy(true)
    try { setDetail(await action()); await load() } catch (error) { report(error) } finally { setBusy(false) }
  }
  useEffect(() => { service.me().then(async (me) => { setUser(me.displayName); setSessions(await service.listSessions()) }).catch(() => undefined) }, [service])
  if (!user) return <main className="app-shell"><section className="panel"><p className="eyebrow">AUTH-01</p><h1>Logowanie</h1><p>Zaloguj się przez Microsoft, aby kontynuować.</p><button className="primary" type="button" onClick={() => setNotice('Logowanie Microsoft jest realizowane przez granicę Entra adaptera.')}>Zaloguj przez Microsoft</button>{dev && <div className="panel"><h2>Tryb deweloperski</h2><label>Rola<select value={role} onChange={(event) => setRole(event.target.value as EffectiveRole)}><option>OWNER</option><option>OBSERVER</option><option>ADMIN</option></select></label><button className="primary" type="button" onClick={() => service.devLogin(role).then((me) => { setUser(me.displayName); return load() }).catch(report)}>Zaloguj lokalnie</button></div>}{notice && <p className="notice">{notice}</p>}</section></main>
  const current = detail
  return <main className="app-shell"><header className="hero"><p className="eyebrow">AI Platform · VS1</p><h1>Sesje</h1><p>Zalogowano: {user}. Ścieżka: Session → pytanie → Artifact Version → approval.</p><button type="button" onClick={() => service.logout().then(() => { setUser(null); setDetail(null) }).catch(report)}>Wyloguj</button></header>{notice && <p className="notice" role="alert">{notice}</p>}<section className="panel"><h2>Lista Session</h2>{sessions.length === 0 ? <p>Brak Session. Utwórz pierwszą.</p> : <ul>{sessions.map((session) => <li key={session.sessionId}><button type="button" disabled={busy} onClick={() => { setNotice(null); service.getDetail(session.sessionId).then(setDetail).catch(report) }}>{session.sessionId} — {session.status}</button></li>)}</ul>}</section><section className="panel"><h2>Utwórz Session</h2><label>Nazwa projektu<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label>Cel<textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></label><button className="primary" type="button" disabled={busy} onClick={() => run(() => service.createSession({ projectName, goal }))}>{busy ? 'Przetwarzanie…' : 'Utwórz Session'}</button></section>{current && <section className="panel"><h2>Session {current.session.status}</h2><p>Execution: <strong>{current.execution.status}</strong></p>{current.execution.pendingQuestion && <><h3>Pytanie</h3><p>{current.execution.pendingQuestion.prompt}</p><label>Odpowiedź<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} /></label><button className="primary" type="button" disabled={busy} onClick={() => run(() => service.answer(current.execution.executionId, current.executionRevision, current.execution.pendingQuestion!.questionId, answer))}>{busy ? 'Przetwarzanie…' : 'Wyślij odpowiedź'}</button></>}{current.artifact && <><h3>Artifact Version</h3><div className="artifact-version-content"><pre>{current.versions[0]?.contentText ?? 'Brak treści'}</pre></div><p>Status Artifact: {current.artifact.status}</p>{current.artifact.status === 'READY_FOR_REVIEW' && <button className="primary" type="button" disabled={busy} onClick={() => run(() => service.approve(current.artifact!, current.versions[0]!))}>{busy ? 'Przetwarzanie…' : 'Zatwierdź bieżącą wersję'}</button>}{current.artifact.status === 'APPROVED' && current.session.status === 'ACTIVE' && <button className="primary" type="button" disabled={busy} onClick={() => run(() => service.advanceToNextSpecialist(current.artifact!.artifactId))}>{busy ? 'Przetwarzanie…' : 'Przejdź do kolejnego specjalisty'}</button>}{current.session.status === 'COMPLETED' && <p className="success-message">Session zakończona po zatwierdzeniu Artifact Version.</p>}</>}</section>}</main>
}
