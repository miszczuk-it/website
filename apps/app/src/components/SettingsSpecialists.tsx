import { useState } from 'react'
import { SPECIALIST_LABELS, STAGE_ORDER } from '../lib/workflow-labels.js'
import { draftFromVersions, EMPTY_SPECIALIST_PROFILE_DRAFT } from '../lib/specialist-profile-draft.js'
import type { SpecialistProfileResponse, SpecialistProfileVersionCreateInput, SpecialistProfileVersionResponse, SpecialistTaskType } from '../types.js'
import { ConfirmDialog } from './ConfirmDialog.js'

// ADR-009 (GAP-018 finding 2): Settings -> Specjaliści -- lets an
// OWNER/ADMIN inspect the version history of each of the four fixed
// specialist profiles, draft a new system prompt, and activate it.
//
// Purely presentational (mirrors AnalysisList.tsx: data-fetching and the
// actual API calls live in the parent, VerticalSliceWorkspace; only
// UI-only state -- which form is open, which version is pending
// confirmation -- lives here). Read access is open to any authenticated,
// non-OBSERVER identity on the backend; mutation (create draft / activate)
// is OWNER/ADMIN-only -- canMutate here only decides whether to *offer*
// those controls, never whether they are allowed.
const EMPTY_DRAFT = EMPTY_SPECIALIST_PROFILE_DRAFT

type Props = {
  profiles: SpecialistProfileResponse[] | null
  selectedType: SpecialistTaskType | null
  versions: SpecialistProfileVersionResponse[] | null
  canMutate: boolean
  creating: boolean
  activating: boolean
  error: string | null
  notice: string | null
  onSelectType: (specialistType: SpecialistTaskType) => void
  onCreateDraft: (specialistType: SpecialistTaskType, input: SpecialistProfileVersionCreateInput) => Promise<void>
  onActivate: (specialistType: SpecialistTaskType, version: SpecialistProfileVersionResponse) => Promise<void>
  onBack: () => void
}

export function SettingsSpecialists({
  profiles, selectedType, versions, canMutate, creating, activating, error, notice,
  onSelectType, onCreateDraft, onActivate, onBack,
}: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [pendingActivate, setPendingActivate] = useState<SpecialistProfileVersionResponse | null>(null)

  const submitDraft = async () => {
    if (!selectedType || creating || draft.systemPrompt.trim() === '') return
    await onCreateDraft(selectedType, {
      systemPrompt: draft.systemPrompt.trim(),
      responsibilities: draft.responsibilities.trim() || undefined,
      excludedResponsibilities: draft.excludedResponsibilities.trim() || undefined,
      expectedOutputGuidance: draft.expectedOutputGuidance.trim() || undefined,
    })
    setDraft(EMPTY_DRAFT)
    setFormOpen(false)
  }

  const confirmActivate = async () => {
    const target = pendingActivate
    if (!target || !selectedType || activating) return
    try { await onActivate(selectedType, target) } finally { setPendingActivate(null) }
  }

  return <section className="panel settings-specialists">
    <div className="panel-header-row">
      <h2>Ustawienia — Specjaliści</h2>
      <button type="button" onClick={onBack}>Wróć</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status" className="success-message">{notice}</p>}

    {profiles === null
      ? <p>Ładowanie…</p>
      : <ul className="specialist-profile-list">
        {STAGE_ORDER.map((specialistType) => {
          const profile = profiles.find((item) => item.specialistType === specialistType)
          const isSelected = specialistType === selectedType
          return <li key={specialistType}>
            <button type="button" className={isSelected ? 'primary' : undefined} aria-pressed={isSelected} onClick={() => onSelectType(specialistType)}>
              <span className="specialist-profile-name">{SPECIALIST_LABELS[specialistType]}</span>
              <span className="version-meta">Aktywna wersja: {profile?.activeVersion ?? '—'}</span>
            </button>
          </li>
        })}
      </ul>}

    {selectedType && versions && (
      <div className="specialist-profile-versions">
        <div className="panel-header-row">
          <h3>Historia wersji — {SPECIALIST_LABELS[selectedType]}</h3>
          {canMutate && <button className="primary" type="button" onClick={() => {
            if (!formOpen) setDraft(draftFromVersions(versions))
            setFormOpen((open) => !open)
          }}>
            {formOpen ? 'Anuluj' : '+ Nowy DRAFT'}
          </button>}
        </div>

        <ul className="specialist-profile-version-list">
          {[...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
            <li key={version.specialistProfileVersionId}>
              <span>Wersja {version.versionNumber}</span>
              <span className={`status status-${version.status.toLowerCase()}`}>{version.status}</span>
              {canMutate && version.status === 'DRAFT' && (
                <button type="button" onClick={() => setPendingActivate(version)}>Aktywuj</button>
              )}
            </li>
          ))}
        </ul>

        {canMutate && formOpen && (
          <form className="specialist-profile-draft-form" onSubmit={(event) => { event.preventDefault(); void submitDraft() }}>
            <label>System prompt<textarea required value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></label>
            <label>Zakres odpowiedzialności<textarea value={draft.responsibilities} onChange={(event) => setDraft({ ...draft, responsibilities: event.target.value })} /></label>
            <label>Wyłączony zakres<textarea value={draft.excludedResponsibilities} onChange={(event) => setDraft({ ...draft, excludedResponsibilities: event.target.value })} /></label>
            <label>Oczekiwany format wyniku<textarea value={draft.expectedOutputGuidance} onChange={(event) => setDraft({ ...draft, expectedOutputGuidance: event.target.value })} /></label>
            <button className="primary" type="submit" disabled={creating || draft.systemPrompt.trim() === ''}>{creating ? 'Tworzenie…' : 'Utwórz DRAFT'}</button>
          </form>
        )}
      </div>
    )}

    {pendingActivate && <ConfirmDialog
      title="Aktywować tę wersję?"
      body={`Wersja ${pendingActivate.versionNumber} zastąpi bieżący, aktywny system prompt dla roli ${selectedType ? SPECIALIST_LABELS[selectedType] : ''}. Nowe wykonania będą używać nowej wersji; historyczne pozostają bez zmian.`}
      confirmLabel={activating ? 'Aktywowanie…' : 'Aktywuj'}
      onConfirm={() => void confirmActivate()}
      onCancel={() => setPendingActivate(null)}
    />}
  </section>
}
