// Absolute-only timestamp formatting -- never paired with a relative "x min temu" label, which
// goes stale the instant the page stops re-rendering (see CHANGELOG.md M5.7).
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
