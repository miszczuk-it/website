import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactContent, artifactExportName, artifactMarkdown, sanitizeFileName } from '../src/lib/artifact-export.js'
import type { ArtifactResponse, ArtifactVersionResponse } from '../src/types.js'

function baseArtifact(overrides: Partial<ArtifactResponse> = {}): ArtifactResponse {
  return { contractVersion: '1.0', artifactId: 'a', projectId: 'prj-1', sessionId: 'ses-1', taskId: 'task-1', executionId: 'exe-1', artifactType: 'PROJECT_PLANNING', title: 'Plan / ../ ERP', status: 'APPROVED', currentVersionId: 'v', revision: 1, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z', ...overrides }
}
function baseVersion(overrides: Partial<ArtifactVersionResponse> = {}): ArtifactVersionResponse {
  return { contractVersion: '1.0', artifactVersionId: 'v', artifactId: 'a', versionNumber: 2, sourceAttemptId: null, contentText: '# Plan\n```ts\nconst x = 1\n```', contentSchemaVersion: '1.0', checksum: 'sha256:x', createdByType: 'SYSTEM', createdByReference: 'attempt:1', createdAt: '2026-08-29T00:00:00.000Z', ...overrides }
}

const artifact = baseArtifact()
const version = baseVersion()

test('artifact export preserves the exact selected version content and code blocks', () => {
  assert.match(artifactContent(version), /```ts/)
  assert.match(artifactMarkdown(artifact, version), /```ts/)
})

test('artifact export sanitizes a browser download filename', () => {
  assert.doesNotMatch(sanitizeFileName('../A/B:*?'), /[\\/:*?"<>|]/)
  assert.match(artifactExportName(artifact, version, 'md'), /_v2\.md$/)
})
