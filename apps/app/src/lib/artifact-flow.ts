import type { ArtifactNewVersionContent, ArtifactResponse, ArtifactVersionResponse } from '../types.js'
import type { PlatformApiClient } from './platform-api.js'
import { PlatformApiError } from './safe-error.js'

function findCurrentVersion(versions: ArtifactVersionResponse[], currentVersionId: string | null): ArtifactVersionResponse | null {
  return versions.find((version) => version.artifactVersionId === currentVersionId) ?? null
}

export type ArtifactVersionCreateResult =
  | { outcome: 'CREATED'; artifact: ArtifactResponse; version: ArtifactVersionResponse | null; notice: string }
  | { outcome: 'CONFLICT'; artifact: ArtifactResponse; version: ArtifactVersionResponse | null; message: string }
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
    return { outcome: 'CREATED', artifact: updated, version: findCurrentVersion(versions, updated.currentVersionId), notice: 'Nowa wersja została utworzona.' }
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
          outcome: 'CONFLICT', artifact: freshArtifact, version: findCurrentVersion(freshVersions, freshArtifact.currentVersionId),
          message: 'Stan Artifact zmienił się w międzyczasie. Odświeżono dane.',
        }
      } catch { /* best-effort refresh; report the original conflict below */ }
    }
    return { outcome: 'ERROR', error }
  }
}
