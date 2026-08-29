import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactContent, artifactExportName, artifactMarkdown, sanitizeFileName } from '../src/lib/artifact-export.js'

const artifact = { artifactId: 'a', title: 'Plan / ../ ERP', artifactType: 'PROJECT_PLANNING', status: 'APPROVED' } as any
const version = { artifactVersionId: 'v', versionNumber: 2, contentText: '# Plan\n```ts\nconst x = 1\n```', createdAt: '2026-08-29T00:00:00.000Z' } as any

test('artifact export preserves the exact selected version content and code blocks', () => {
  assert.match(artifactContent(version), /```ts/)
  assert.match(artifactMarkdown(artifact, version), /```ts/)
})

test('artifact export sanitizes a browser download filename', () => {
  assert.doesNotMatch(sanitizeFileName('../A/B:*?'), /[\\/:*?"<>|]/)
  assert.match(artifactExportName(artifact, version, 'md'), /_v2\.md$/)
})
