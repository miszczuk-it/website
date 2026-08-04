import { useState } from 'react'
import { validateNewVersionContent } from '../lib/validation.js'
import type { ArtifactDecisionType, ArtifactNewVersionContent, ArtifactResponse, ArtifactVersionResponse } from '../types.js'

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
  version: ArtifactVersionResponse | null
  submittingForReview: boolean
  deciding: boolean
  creatingVersion?: boolean
  safeErrorMessage: string | null
  versionNotice?: string | null
  onSubmitForReview: () => void
  onDecide: (decisionType: ArtifactDecisionType, comment: string) => void
  onCreateVersion?: (content: ArtifactNewVersionContent) => void
}

export function ArtifactReviewPanel({
  artifact, version, submittingForReview, deciding, creatingVersion = false, safeErrorMessage, versionNotice = null,
  onSubmitForReview, onDecide, onCreateVersion = () => {},
}: Props) {
  const [comment, setComment] = useState('')
  const [newVersionText, setNewVersionText] = useState('')
  const [newVersionJson, setNewVersionJson] = useState('')
  const [newVersionError, setNewVersionError] = useState<string | null>(null)
  const availableDecisions = decisionsFor(artifact.status)
  const isJsonMode = version ? typeof version.contentJson === 'object' && version.contentJson !== null : false

  function submitDecision(decisionType: ArtifactDecisionType) {
    if (deciding) return
    if (DECISIONS_REQUIRING_COMMENT.includes(decisionType) && comment.trim() === '') return
    onDecide(decisionType, comment.trim())
    setComment('')
  }

  function submitNewVersion() {
    if (creatingVersion) return
    const result = validateNewVersionContent(isJsonMode ? 'JSON' : 'TEXT', newVersionText, newVersionJson)
    if (!result.ok) { setNewVersionError(result.error); return }
    setNewVersionError(null)
    onCreateVersion(result.content)
    // Not cleared here: on success the Artifact leaves REVISION_REQUESTED
    // and this whole form unmounts (see the guard below), which resets its
    // local state for free. On failure the status is unchanged, the form
    // stays mounted, and the user's typed content must survive so they can
    // fix and retry instead of retyping everything.
  }

  return (
    <div className="artifact-review-panel">
      <dl className="result-grid">
        <dt>Artifact</dt><dd>{artifact.title}</dd>
        <dt>Typ</dt><dd>{artifact.artifactType}</dd>
      </dl>
      <p role="status" className={`status status-${artifact.status.toLowerCase()}`}>{artifact.status}</p>

      {version && (
        <div className="artifact-version-content">
          {typeof version.contentText === 'string' && <pre>{version.contentText}</pre>}
          {version.contentJson && <pre>{JSON.stringify(version.contentJson, null, 2)}</pre>}
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
        <div className="artifact-new-version-form">
          <h3>Nowa wersja</h3>
          {isJsonMode ? (
            <>
              <label htmlFor="artifact-new-version-json">Treść (JSON)</label>
              <textarea id="artifact-new-version-json" value={newVersionJson} onChange={(event) => setNewVersionJson(event.target.value)} aria-invalid={Boolean(newVersionError)} />
            </>
          ) : (
            <>
              <label htmlFor="artifact-new-version-text">Treść</label>
              <textarea id="artifact-new-version-text" value={newVersionText} onChange={(event) => setNewVersionText(event.target.value)} aria-invalid={Boolean(newVersionError)} />
            </>
          )}
          {newVersionError && <span className="field-error">{newVersionError}</span>}
          <button className="primary" type="button" onClick={submitNewVersion} disabled={creatingVersion}>
            {creatingVersion ? 'Tworzenie…' : 'Utwórz nową wersję'}
          </button>
        </div>
      )}

      {availableDecisions.length > 0 && (
        <div className="artifact-decisions">
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
    </div>
  )
}
