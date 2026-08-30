import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalysisContextEntry, AnalysisContextResponse, ArtifactResponse, ArtifactVersionResponse, AuthMeResponse, ContextSection, ContextVersionSummary, ExecutionStatusResponse, SessionListItem, SessionWorkflowResponse,
  SpecialistProfileResponse, SpecialistProfileVersionCreateInput, SpecialistProfileVersionResponse, SpecialistTaskType,
} from '../types.js'
import { runGuarded, type SingleFlightGuard } from '../lib/execution-flow.js'
import { createPlatformApiClient } from '../lib/platform-api.js'
import { PlatformApiError, toSafeUiError } from '../lib/safe-error.js'
import { createMockVs1Service, createRealVs1Service, type Vs1Detail, type Vs1Service } from '../lib/vs1-service.js'
import { AnalysisList } from './AnalysisList.js'
import { AnalysisDetail } from './AnalysisDetail.js'
import { SettingsSpecialists } from './SettingsSpecialists.js'

const DEFAULT_FAILED_FINAL_MESSAGE = 'Wykonanie zakończyło się błędem, którego nie można ponowić.'

// Renders the incomplete/failed-Execution state and Retry affordance for the
// VS1 golden path (task §3/§4): a truncated LLM_RESULT_READY response
// (isIncomplete, e.g. incomplete_reason=max_output_tokens) gets its own
// readable banner instead of the generic crash notice VerticalSliceWorkspace
// otherwise shows for thrown errors, and the Retry button is gated purely on
// the backend's own retryAllowed flag -- the frontend never guesses which
// states are retryable. Kept exported at this path (used by AnalysisDetail
// and by tests/frontend.test.ts) even though the rest of the workspace has
// moved into AnalysisList/AnalysisDetail below.
type ExecutionRetryStatusProps = { execution: ExecutionStatusResponse; retrying: boolean; onRetry: () => void }
export function ExecutionRetryStatus({ execution, retrying, onRetry }: ExecutionRetryStatusProps) {
  return <>
    {execution.isIncomplete && <p className="notice" role="alert">Wynik modelu jest niekompletny{execution.incompleteReason ? ` (${execution.incompleteReason})` : ''}.</p>}
    {execution.status === 'FAILED_FINAL' && <p className="notice" role="alert">{execution.safeErrorMessage ?? DEFAULT_FAILED_FINAL_MESSAGE}</p>}
    {execution.retryAllowed && <button className="primary" type="button" disabled={retrying} onClick={onRetry}>{retrying ? 'Ponawianie…' : 'Ponów wykonanie'}</button>}
  </>
}

// VS1 UX redesign (2026-08-28): the workspace now lands on "Moje analizy"
// (AnalysisList) first, never an expanded create form, and an opened
// analysis renders through AnalysisDetail's workflow-progress /
// current-specialist / result-by-stage / revision-navigation layout instead
// of the previous flat, GUID-labelled single panel.
type Props = { apiBaseUrl: string; apiEnabled: boolean; appEnvironment: string; identity?: AuthMeResponse | null; onLogout?: () => Promise<void> }
export function VerticalSliceWorkspace({ apiBaseUrl, apiEnabled, identity: initialIdentity = null, onLogout }: Props) {
  const service = useMemo<Vs1Service>(() => apiEnabled ? createRealVs1Service(apiBaseUrl) : createMockVs1Service(), [apiBaseUrl, apiEnabled])
  // Settings -> Specjaliści (ADR-009 / GAP-018) talks to the Platform API
  // directly, not through Vs1Service -- that abstraction exists for the VS1
  // golden-path demo/mock mode, which has no equivalent for administering
  // Specialist Profiles. Unreachable (and its own nav entry hidden) in mock
  // mode, since there is no real backend to administer.
  const platformApi = useMemo(() => apiEnabled ? createPlatformApiClient(apiBaseUrl) : null, [apiBaseUrl, apiEnabled])
  const [view, setView] = useState<'workspace' | 'settings'>('workspace')
  const [specialistProfiles, setSpecialistProfiles] = useState<SpecialistProfileResponse[] | null>(null)
  const [selectedSpecialistType, setSelectedSpecialistType] = useState<SpecialistTaskType | null>(null)
  const [specialistProfileVersions, setSpecialistProfileVersions] = useState<SpecialistProfileVersionResponse[] | null>(null)
  const [specialistCreating, setSpecialistCreating] = useState(false)
  const [specialistActivating, setSpecialistActivating] = useState(false)
  const [specialistError, setSpecialistError] = useState<string | null>(null)
  const [specialistNotice, setSpecialistNotice] = useState<string | null>(null)
  const [user, setUser] = useState<AuthMeResponse | null>(initialIdentity)
  const [sessions, setSessions] = useState<Vs1Detail['session'][]>([])
  const [detail, setDetail] = useState<Vs1Detail | null>(null)
  const [workflow, setWorkflow] = useState<SessionWorkflowResponse | null>(null)
  // ADR-009 / GAP-018 completion: Shared Analysis Context, same
  // direct-to-Platform-API pattern as Settings -> Specjaliści above (null,
  // and the panel itself renders nothing, when there is no real backend).
  const [sharedContext, setSharedContext] = useState<AnalysisContextResponse | null>(null)
  const [contextVersions, setContextVersions] = useState<ContextVersionSummary[] | null>(null)
  const [contextBusy, setContextBusy] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [contextNotice, setContextNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ artifact: ArtifactResponse; versions: ArtifactVersionResponse[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Every action below can trigger a real, billed LLM Gateway call and takes
  // seconds to round-trip; without this guard a user unsure whether their
  // click registered (no built-in loading affordance) can fire it again,
  // creating a second Project/Session/Execution chain and doubling live
  // OpenAI cost -- confirmed as a real risk during Local UI / Browser
  // Validation (2026-08-28). One flag is enough: these actions never
  // overlap (each is only reachable from its own render branch).
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // Retry gets its own SingleFlightGuard (task §4's busy guard, same utility
  // AnalysisWorkspace already uses for its retry button) rather than sharing
  // the general `busy` flag: `busy` only disables buttons synchronously on
  // render, but a genuine double-click can still fire two overlapping async
  // calls before the first setBusy(true) commits. runGuarded closes that gap
  // so a double-click can never trigger two paid retry attempts.
  const retryGuard = useRef<SingleFlightGuard>({ busy: false })
  const report = (error: unknown) => setNotice(toSafeUiError(error).message)
  const load = async () => { try { setSessions(await service.listSessions()) } catch (error) { report(error) } }

  const loadWorkflow = async (sessionId: string) => {
    try { setWorkflow(await service.getWorkflow(sessionId)) } catch { setWorkflow(null) }
  }

  // ADR-009 / GAP-018 completion: loads the current Shared Context and its
  // version-history summary together. Best-effort like loadWorkflow --
  // absent in mock mode (no platformApi) and never blocks opening the
  // Analysis itself on failure.
  const loadSharedContext = async (sessionId: string) => {
    if (!platformApi) { setSharedContext(null); setContextVersions(null); return }
    setContextError(null)
    try {
      const [context, versions] = await Promise.all([
        platformApi.getSessionContext(sessionId, crypto.randomUUID()),
        platformApi.listContextVersions(sessionId, crypto.randomUUID()),
      ])
      setSharedContext(context)
      setContextVersions(versions)
    } catch { setSharedContext(null); setContextVersions(null) }
  }

  const openAnalysis = async (sessionId: string) => {
    setNotice(null)
    setPreview(null)
    setContextNotice(null)
    try {
      const [nextDetail] = await Promise.all([service.getDetail(sessionId), loadWorkflow(sessionId), loadSharedContext(sessionId)])
      setDetail(nextDetail)
    } catch (error) { report(error) }
  }

  // Every Shared Context mutation below follows the same shape: send
  // `sharedContext.versionNumber` as expectedRevision, replace state with
  // the full new context the backend returns (which already carries the
  // bumped versionNumber, so the *next* mutation's expectedRevision is
  // automatically current), and on a real CONFLICT (context changed
  // elsewhere in the meantime) resync silently instead of leaving stale
  // state that would just conflict again.
  const mutateContext = async (mutate: (sessionId: string, expectedRevision: number) => Promise<AnalysisContextResponse>) => {
    if (!platformApi || !detail || !sharedContext || contextBusy) return
    setContextBusy(true)
    setContextError(null)
    setContextNotice(null)
    try {
      const next = await mutate(detail.session.sessionId, sharedContext.versionNumber)
      setSharedContext(next)
      setContextVersions(await platformApi.listContextVersions(detail.session.sessionId, crypto.randomUUID()))
    } catch (error) {
      if (error instanceof PlatformApiError && error.code === 'CONFLICT') {
        setContextNotice('Kontekst zmienił się w międzyczasie. Odświeżono.')
        await loadSharedContext(detail.session.sessionId)
      } else {
        setContextError(toSafeUiError(error).message)
      }
    } finally {
      setContextBusy(false)
    }
  }
  const addContextFinding = (section: ContextSection, content: string) => mutateContext((sessionId, expectedRevision) =>
    platformApi!.addContextEntry(sessionId, { section, classification: 'OWNER_CONFIRMED', content }, expectedRevision, crypto.randomUUID()))
  // §7: editing an ACTIVE entry is never an in-place update -- withdraw the
  // old entry, then add the new content as a fresh OWNER_CONFIRMED entry.
  // Two Context versions are created (both preserved in history), not one;
  // the edit is itself an Owner action, so the replacement is always
  // OWNER_CONFIRMED regardless of the original entry's classification.
  const editContextFinding = (entry: AnalysisContextEntry, newContent: string) => mutateContext(async (sessionId, expectedRevision) => {
    const withdrawn = await platformApi!.withdrawContextEntry(sessionId, entry.entryId, expectedRevision, crypto.randomUUID())
    return platformApi!.addContextEntry(sessionId, { section: entry.section, classification: 'OWNER_CONFIRMED', content: newContent }, withdrawn.versionNumber, crypto.randomUUID())
  })
  const approveContextProposal = (entryId: string) => mutateContext((sessionId, expectedRevision) =>
    platformApi!.approveContextEntry(sessionId, entryId, expectedRevision, crypto.randomUUID()))
  const rejectContextProposal = (entryId: string) => mutateContext((sessionId, expectedRevision) =>
    platformApi!.rejectContextEntry(sessionId, entryId, expectedRevision, crypto.randomUUID()))

  // Owner UX Follow-up (GAP-017): "Usuń analizę" -- soft-delete/archive.
  // Mirrors the shape of run()/retry() (clear stale notice, report safely
  // on failure) but skips the shared `busy` guard: archiving is a cheap,
  // unbilled action, and AnalysisList already disables its own confirm
  // button for the duration of the call.
  const deleteAnalysis = async (session: SessionListItem) => {
    setNotice(null)
    try {
      await service.archiveSession(session.sessionId, session.revision)
      await load()
    } catch (error) { report(error) }
  }

  // ADR-009 / GAP-018: Settings -> Specjaliści. Mirrors load()/deleteAnalysis's
  // shape (own notice/error state, no shared `busy` guard -- these are cheap,
  // unbilled admin actions on a separate screen).
  const loadSpecialistProfiles = async () => {
    if (!platformApi) return
    try { setSpecialistProfiles(await platformApi.listSpecialistProfiles(crypto.randomUUID())) }
    catch (error) { setSpecialistError(toSafeUiError(error).message) }
  }
  const openSettings = () => { setView('settings'); setSpecialistError(null); setSpecialistNotice(null); void loadSpecialistProfiles() }
  const selectSpecialistType = async (specialistType: SpecialistTaskType) => {
    if (!platformApi) return
    setSelectedSpecialistType(specialistType)
    setSpecialistError(null)
    setSpecialistNotice(null)
    try { setSpecialistProfileVersions(await platformApi.listSpecialistProfileVersions(specialistType, crypto.randomUUID())) }
    catch (error) { setSpecialistError(toSafeUiError(error).message) }
  }
  const createSpecialistDraft = async (specialistType: SpecialistTaskType, input: SpecialistProfileVersionCreateInput) => {
    if (!platformApi) return
    setSpecialistCreating(true)
    setSpecialistError(null)
    try {
      await platformApi.createSpecialistProfileVersion(specialistType, input, crypto.randomUUID())
      setSpecialistProfileVersions(await platformApi.listSpecialistProfileVersions(specialistType, crypto.randomUUID()))
      setSpecialistNotice('Utworzono nowy DRAFT.')
    } catch (error) { setSpecialistError(toSafeUiError(error).message) } finally { setSpecialistCreating(false) }
  }
  const activateSpecialistVersion = async (specialistType: SpecialistTaskType, version: SpecialistProfileVersionResponse) => {
    if (!platformApi) return
    setSpecialistActivating(true)
    setSpecialistError(null)
    try {
      await platformApi.activateSpecialistProfileVersion(specialistType, version.specialistProfileVersionId, crypto.randomUUID())
      setSpecialistProfileVersions(await platformApi.listSpecialistProfileVersions(specialistType, crypto.randomUUID()))
      await loadSpecialistProfiles()
      setSpecialistNotice(`Aktywowano wersję ${version.versionNumber}.`)
    } catch (error) { setSpecialistError(toSafeUiError(error).message) } finally { setSpecialistActivating(false) }
  }

  // Owner UX Follow-up (GAP-017, Feature 4): read-only "Podgląd" of a
  // historical/completed Task's Artifact -- never touches `detail`/
  // `workflow`, so returning to the current stage needs no re-fetch.
  const openPreview = async (artifactId: string) => {
    setNotice(null)
    try { setPreview(await service.getArtifactPreview(artifactId)) } catch (error) { report(error) }
  }

  const run = async (action: () => Promise<Vs1Detail>) => {
    // A previous action's failure notice must not linger and look like a
    // fresh action failed too -- confirmed as real, confusing behavior
    // during Local UI / Browser Validation (2026-08-28): the notice was
    // never cleared anywhere, so once shown it stayed on screen regardless
    // of any later successful action.
    setNotice(null)
    setBusy(true)
    try {
      const next = await action()
      setDetail(next)
      await Promise.all([load(), loadWorkflow(next.session.sessionId)])
    } catch (error) { report(error) } finally { setBusy(false) }
  }
  const retry = async (current: Vs1Detail) => {
    if (!current.execution.retryAllowed) return
    setNotice(null)
    setRetrying(true)
    try {
      const result = await runGuarded(retryGuard.current, () => service.retry(current.execution.executionId, current.execution.revision, 'Ponowienie wykonania przez użytkownika.'))
      if (result) { setDetail(result); await Promise.all([load(), loadWorkflow(result.session.sessionId)]) }
    } catch (error) {
      if (error instanceof PlatformApiError && error.code === 'CONFLICT') {
        setNotice('Stan wykonania zmienił się w międzyczasie. Odświeżono status.')
        try { setDetail(await service.getDetail(current.session.sessionId)) } catch { /* best-effort refresh; keep last known state */ }
      } else {
        report(error)
      }
    } finally {
      setRetrying(false)
    }
  }
  useEffect(() => { service.me().then(async (me) => { setUser(me); setSessions(await service.listSessions()) }).catch(() => undefined) }, [service])

  if (!user) return <main className="app-shell"><section className="panel"><h1>Sesja wygasła</h1><p>Zaloguj się ponownie, aby kontynuować.</p></section></main>

  return <main className="app-shell">
    <header className="hero">
      <p className="eyebrow">AI Platform</p>
      <h1>Moje analizy</h1>
      <div className="user-menu">
        {user.picture ? <img className="user-avatar" src={user.picture} alt="" /> : <span className="user-avatar user-avatar-fallback" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>}
        <details><summary>{user.displayName}</summary><div className="user-menu-content">
          <span>Profil</span>
          {platformApi && user.effectiveRole !== 'OBSERVER' && <button type="button" onClick={() => (view === 'settings' ? setView('workspace') : openSettings())}>
            {view === 'settings' ? 'Moje analizy' : 'Ustawienia'}
          </button>}
          <button type="button" onClick={() => (onLogout ? onLogout() : service.logout()).then(() => { setUser(null); setDetail(null); setWorkflow(null) }).catch(report)}>Wyloguj</button>
        </div></details>
      </div>
    </header>
    {notice && <p className="notice" role="alert">{notice}</p>}

    {view === 'settings' && platformApi && <SettingsSpecialists
      profiles={specialistProfiles}
      selectedType={selectedSpecialistType}
      versions={specialistProfileVersions}
      canMutate={user.effectiveRole === 'OWNER' || user.effectiveRole === 'ADMIN'}
      creating={specialistCreating}
      activating={specialistActivating}
      error={specialistError}
      notice={specialistNotice}
      onSelectType={(specialistType) => void selectSpecialistType(specialistType)}
      onCreateDraft={createSpecialistDraft}
      onActivate={activateSpecialistVersion}
      onBack={() => setView('workspace')}
    />}

    {view === 'workspace' && !detail && <AnalysisList
      sessions={sessions}
      busy={busy}
      canDelete={user.permissions.includes('session.archive_own') || user.permissions.includes('session.archive_any')}
      onOpen={openAnalysis}
      onCreate={async (input) => { await run(() => service.createSession(input)) }}
      onDelete={deleteAnalysis}
    />}

    {view === 'workspace' && detail && <AnalysisDetail
      detail={detail}
      workflowResponse={workflow}
      busy={busy}
      retrying={retrying}
      onBack={() => { setDetail(null); setWorkflow(null); setPreview(null); setSharedContext(null); setContextVersions(null); void load() }}
      onAnswer={(answer) => run(() => service.answer(detail.execution.executionId, detail.executionRevision, detail.execution.pendingQuestion!.questionId, answer))}
      onApprove={() => run(() => service.approve(detail.artifact!, detail.versions.find((version) => version.artifactVersionId === detail.artifact!.currentVersionId) ?? detail.versions[0]!))}
      onRequestRevision={(feedback) => run(() => service.requestRevision(detail.artifact!, detail.versions.find((version) => version.artifactVersionId === detail.artifact!.currentVersionId) ?? detail.versions[0]!, feedback))}
      onAdvance={() => run(() => service.advanceToNextSpecialist(detail.artifact!.artifactId))}
      onRetry={() => retry(detail)}
      onReturnToStage={(targetTaskId, feedback) => run(() => service.returnToStage(detail.session.sessionId, targetTaskId, feedback, detail.session.revision))}
      preview={preview}
      onPreview={openPreview}
      onClosePreview={() => setPreview(null)}
      sharedContext={sharedContext}
      contextVersions={contextVersions}
      canMutateContext={user.effectiveRole === 'OWNER' || user.effectiveRole === 'ADMIN'}
      contextBusy={contextBusy}
      contextError={contextError}
      contextNotice={contextNotice}
      onAddContextEntry={addContextFinding}
      onEditContextEntry={editContextFinding}
      onApproveContextEntry={approveContextProposal}
      onRejectContextEntry={rejectContextProposal}
    />}
  </main>
}
