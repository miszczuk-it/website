import type { ArtifactResponse, ArtifactVersionResponse } from '../types.js'

// eslint-disable-next-line no-control-regex -- control characters are invalid in filenames on Windows/most filesystems and must be stripped
const INVALID_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeFileName(value: string, fallback = 'wynik'): string {
  const safe = value.replace(/\.\.+/g, '-').replace(INVALID_FILE_NAME, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || fallback
}

export function artifactContent(version: ArtifactVersionResponse): string {
  return typeof version.contentText === 'string' ? version.contentText : JSON.stringify(version.contentJson ?? {}, null, 2)
}

export function artifactExportName(artifact: ArtifactResponse, version: ArtifactVersionResponse, extension: 'md' | 'txt'): string {
  return `${sanitizeFileName(artifact.title)}_v${version.versionNumber}.${extension}`
}

export function artifactMarkdown(artifact: ArtifactResponse, version: ArtifactVersionResponse): string {
  const status = artifact.status === 'APPROVED' ? 'Zatwierdzona' : artifact.status
  return `# ${artifact.title}\n\nSpecjalista: ${artifact.artifactType}\nWersja: ${version.versionNumber}\nStatus: ${status}\nData: ${version.createdAt}\n\n---\n\n${artifactContent(version)}`
}

export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
