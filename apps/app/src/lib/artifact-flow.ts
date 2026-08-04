import type { ArtifactDecisionType, ArtifactNewVersionContent, ArtifactResponse, ArtifactReviewDecisionResponse, ArtifactVersionResponse } from '../types.js'
import type { PlatformApiClient } from './platform-api.js'
import { PlatformApiError } from './safe-error.js'

function findCurrentVersion(versions: ArtifactVersionResponse[], currentVersionId: string | null): ArtifactVersionResponse | null {
  return versions.find((version) => version.artifactVersionId === currentVersionId) ?? null
}

export type ArtifactVersionCreateResult =
  | { outcome: 'CREATED'; artifact: ArtifactResponse; version: ArtifactVersionResponse | null; versions: ArtifactVersionResponse[]; notice: string }
  | { outcome: 'CONFLICT'; artifact: ArtifactResponse; version: ArtifactVersionResponse | null; versions: ArtifactVersionResponse[]; message: string }
  | { outcome: 'ERROR'; error: unknown }

// POST /api/artifacts/:id/versions only ever creates a brand new version --
// its request contract (artifact-version-create.schema.json) carries no
// artifactVersionId, so there is no way to target and mutate an existing
// one. The prior current version therefore always stays reachable, byte-
// identical, through listArtifactVersions -- this function never rewrites
// it, only appends and re-points currentVersionId.
//
// Mirrors runMvpFlow's shape (mvp-flow.ts): a pure, DOM-free orchestration
// step the caller can unit test directly, then wire into component state.
export async function createArtifactVersionAndRefresh(
  client: PlatformApiClient,
  artifact: ArtifactResponse,
  currentVersion: ArtifactVersionResponse,
  content: ArtifactNewVersionContent,
  idempotencyKey: string,
  correlationId: string,
): Promise<ArtifactVersionCreateResult> {
  try {
    const updated = await client.createArtifactVersion(
      artifact.artifactId, artifact.revision, currentVersion.contentSchemaVersion, content, idempotencyKey, correlationId,
    )
    const versions = await client.listArtifactVersions(updated.artifactId, correlationId)
    return { outcome: 'CREATED', artifact: updated, version: findCurrentVersion(versions, updated.currentVersionId), versions, notice: 'Nowa wersja została utworzona.' }
  } catch (error) {
    if (error instanceof PlatformApiError && error.code === 'CONFLICT') {
      // No automatic replay of the write on conflict -- only a read-only
      // refresh, so the user can review the changed state before retrying.
      try {
        const [freshArtifact, freshVersions] = await Promise.all([
          client.getArtifact(artifact.artifactId, correlationId),
          client.listArtifactVersions(artifact.artifactId, correlationId),
        ])
        return {
          outcome: 'CONFLICT', artifact: freshArtifact, version: findCurrentVersion(freshVersions, freshArtifact.currentVersionId), versions: freshVersions,
          message: 'Stan Artifact zmienił się w międzyczasie. Odświeżono dane.',
        }
      } catch { /* best-effort refresh; report the original conflict below */ }
    }
    return { outcome: 'ERROR', error }
  }
}

type ArtifactHistorySnapshot = { artifact: ArtifactResponse; versions: ArtifactVersionResponse[]; decisions: ArtifactReviewDecisionResponse[] }

export type ArtifactDecisionResult =
  | ({ outcome: 'DECIDED' } & ArtifactHistorySnapshot)
  | { outcome: 'ERROR'; error: unknown; refreshed: ArtifactHistorySnapshot | null }

async function snapshotArtifactHistory(client: PlatformApiClient, artifactId: string, correlationId: string): Promise<ArtifactHistorySnapshot> {
  const [artifact, versions, decisions] = await Promise.all([
    client.getArtifact(artifactId, correlationId),
    client.listArtifactVersions(artifactId, correlationId),
    client.listArtifactReviewDecisions(artifactId, correlationId),
  ])
  return { artifact, versions, decisions }
}

// artifactVersionId is caller-supplied (not always artifact.currentVersionId)
// because COMMENT_ONLY may legitimately target a historical version --
// decideArtifact places no current-version restriction on COMMENT_ONLY,
// only on the state-changing decisions (enforced server-side regardless).
export async function decideArtifactAndRefresh(
  client: PlatformApiClient,
  artifact: ArtifactResponse,
  artifactVersionId: string,
  decisionType: ArtifactDecisionType,
  comment: string,
  idempotencyKey: string,
  correlationId: string,
): Promise<ArtifactDecisionResult> {
  try {
    await client.createArtifactReviewDecision(artifact.artifactId, artifactVersionId, decisionType, artifact.revision, idempotencyKey, correlationId, comment || undefined)
  } catch (error) {
    // The decision write itself failed (e.g. stale expectedVersion, or a
    // decision already resolved this Artifact) -- refresh read-only state
    // so the reviewer sees what actually changed, without ever retrying
    // the write automatically.
    try {
      return { outcome: 'ERROR', error, refreshed: await snapshotArtifactHistory(client, artifact.artifactId, correlationId) }
    } catch {
      return { outcome: 'ERROR', error, refreshed: null }
    }
  }
  return { outcome: 'DECIDED', ...(await snapshotArtifactHistory(client, artifact.artifactId, correlationId)) }
}
