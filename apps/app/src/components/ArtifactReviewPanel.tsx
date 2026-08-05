import { useState } from 'react'
import type { ArtifactDecisionType, ArtifactResponse, ArtifactReviewDecisionResponse, ArtifactVersionResponse } from '../types.js'

const DECISIONS_REQUIRING_COMMENT: ArtifactDecisionType[] = ['REJECT', 'REQUEST_REVISION', 'COMMENT_ONLY']

const DECISION_LABELS: Record<ArtifactDecisionType, string> = {
  APPROVE: 'Zatwierdź',
  REJECT: 'Odrzuć',
  REQUEST_REVISION: 'Poproś o poprawę',
  COMMENT_ONLY: 'Dodaj komentarz',
}

// Which decisions are offered per Artifact status -- mirrors the backend
// automat in artifact-orchestrator.mjs (decideArtifact) without duplicating
// its transition logic: the frontend only decides what to *show*, the
// backend is still the sole authority on whether a decision is accepted.
function decisionsFor(status: ArtifactResponse['status']): ArtifactDecisionType[] {
  if (status === 'READY_FOR_REVIEW') return ['APPROVE', 'REJECT', 'REQUEST_REVISION', 'COMMENT_ONLY']
  if (status === 'APPROVED' || status === 'REJECTED' || status === 'REVISION_REQUESTED') return ['COMMENT_ONLY']
  return []
}

type Props = {
  artifact: ArtifactResponse
  versions: ArtifactVersionResponse[]
  decisions: ArtifactReviewDecisionResponse[]
  selectedVersionId: string | null
  onSelectVersion: (versionId: string) => void
  submittingForReview: boolean
  deciding: boolean
  revisionGenerating?: boolean
  revisionError?: string | null
  safeErrorMessage: string | null
  versionNotice?: string | null
  onSubmitForReview: () => void
  onDecide: (decisionType: ArtifactDecisionType, comment: string, artifactVersionId: string) => void
}

export function ArtifactReviewPanel({
  artifact, versions, decisions, selectedVersionId, onSelectVersion,
  submittingForReview, deciding, revisionGenerating = false, revisionError = null, safeErrorMessage, versionNotice = null,
  onSubmitForReview, onDecide,
}: Props) {
  const [comment, setComment] = useState('')

  const currentVersion = versions.find((version) => version.artifactVersionId === artifact.currentVersionId) ?? null
  const selectedVersion = versions.find((version) => version.artifactVersionId === selectedVersionId) ?? currentVersion
  const isCurrentVersionSelected = selectedVersion ? selectedVersion.artifactVersionId === artifact.currentVersionId : true

  // APPROVE/REJECT/REQUEST_REVISION are state-changing and, per the backend
  // (decideArtifact), only ever valid against the current version out of
  // READY_FOR_REVIEW -- never a historical one. COMMENT_ONLY carries no such
  // restriction server-side, so it stays available while previewing history.
  const statusDecisions = decisionsFor(artifact.status)
  const availableDecisions = isCurrentVersionSelected ? statusDecisions : statusDecisions.filter((decision) => decision === 'COMMENT_ONLY')

  function submitDecision(decisionType: ArtifactDecisionType) {
    if (deciding || !selectedVersion) return
    if (DECISIONS_REQUIRING_COMMENT.includes(decisionType) && comment.trim() === '') return
    onDecide(decisionType, comment.trim(), selectedVersion.artifactVersionId)
    setComment('')
  }

  return (
    <div className="artifact-review-panel">
      <dl className="result-grid">
        <dt>Artifact</dt><dd>{artifact.title}</dd>
        <dt>Typ</dt><dd>{artifact.artifactType}</dd>
      </dl>
      <p role="status" className={`status status-${artifact.status.toLowerCase()}`}>{artifact.status}</p>

      {versions.length > 0 && (
        <div className="artifact-version-history">
          <h3>Wersje</h3>
          <ul>
            {versions.map((version) => {
              const isCurrent = version.artifactVersionId === artifact.currentVersionId
              const isSelected = version.artifactVersionId === selectedVersion?.artifactVersionId
              return (
                <li key={version.artifactVersionId}>
                  <button
                    type="button"
                    className={isSelected ? 'primary' : undefined}
                    aria-pressed={isSelected}
                    onClick={() => onSelectVersion(version.artifactVersionId)}
                  >
                    Wersja {version.versionNumber}
                    <span className={`version-badge ${isCurrent ? 'version-badge-current' : 'version-badge-historical'}`}>
                      {isCurrent ? 'Bieżąca' : 'Historyczna'}
                    </span>
                    <span className="version-meta">{version.createdByType} · {version.createdAt}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {selectedVersion && (
        <div className="artifact-version-content">
          {typeof selectedVersion.contentText === 'string' && <pre>{selectedVersion.contentText}</pre>}
          {selectedVersion.contentJson && <pre>{JSON.stringify(selectedVersion.contentJson, null, 2)}</pre>}
        </div>
      )}

      {artifact.status === 'DRAFT' && (
        <button className="primary" type="button" onClick={onSubmitForReview} disabled={submittingForReview}>
          {submittingForReview ? 'Przesyłanie…' : 'Prześlij do przeglądu'}
        </button>
      )}

      {safeErrorMessage && <p role="alert">{safeErrorMessage}</p>}
      {versionNotice && <p role="status" className="success-message">{versionNotice}</p>}

      {artifact.status === 'REVISION_REQUESTED' && (
        <div className="artifact-revision-generating">
          {revisionError
            ? <p role="alert">{revisionError}</p>
            : <p role="status" className="status status-generating">{revisionGenerating ? 'Trwa generowanie poprawionej wersji…' : 'Oczekiwanie na wygenerowanie poprawionej wersji…'}</p>}
        </div>
      )}

      {availableDecisions.length > 0 && selectedVersion && (
        <div className="artifact-decisions">
          {!isCurrentVersionSelected && <p className="notice-inline">Podgląd wersji historycznej — dostępny tylko komentarz.</p>}
          <label htmlFor="artifact-decision-comment">Komentarz</label>
          <textarea id="artifact-decision-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000} />
          <div className="artifact-decision-buttons">
            {availableDecisions.map((decisionType) => {
              const requiresComment = DECISIONS_REQUIRING_COMMENT.includes(decisionType)
              return (
                <button
                  key={decisionType}
                  type="button"
                  className={decisionType === 'APPROVE' ? 'primary' : undefined}
                  disabled={deciding || (requiresComment && comment.trim() === '')}
                  onClick={() => submitDecision(decisionType)}
                >
                  {DECISION_LABELS[decisionType]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="artifact-decision-history">
        <h3>Historia decyzji</h3>
        {decisions.length === 0 ? (
          <p>Brak decyzji.</p>
        ) : (
          <ul>
            {decisions.map((decision) => {
              const targetVersion = versions.find((version) => version.artifactVersionId === decision.artifactVersionId)
              return (
                <li key={decision.decisionId}>
                  <strong>{DECISION_LABELS[decision.decisionType]}</strong>
                  {targetVersion && <span className="version-meta"> · wersja {targetVersion.versionNumber}</span>}
                  <span className="version-meta"> · {decision.actorReference} · {decision.createdAt}</span>
                  {decision.comment && <p>{decision.comment}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
