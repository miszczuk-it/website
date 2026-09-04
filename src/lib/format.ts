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

// Short form (no year) shared by chart axis labels and table rows -- BarChart.tsx and
// LineChart.tsx both plot Date objects derived from API UTC timestamps.
export function formatHour(date: Date): string {
  return date.toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Speed values without a unit suffix -- for callers (e.g. chart tooltips) that already append
// their own unit string. Backend averages carry full float precision; rounding is a display-only
// concern (see hotfix report).
export function formatSpeedValue(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1)
}

// Speed values with the "km/h" unit baked in, for KPI tiles and inline text.
export function formatSpeed(value: number | null | undefined): string {
  const formatted = formatSpeedValue(value)
  return formatted === '—' ? formatted : `${formatted} km/h`
}

// Shared by CurrentConditionsCard (LOCAL primary metrics) and LocalWeatherComparison (LOCAL vs
// WeatherAPI table) so both surfaces format the same underlying fields identically.
export function formatTemperature(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} °C`
}

export function formatHumidity(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} %`
}

export function formatPressure(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(0)} hPa`
}

export function formatLux(value: number | null): string {
  return value == null ? '—' : `${new Intl.NumberFormat('pl-PL').format(Math.round(value))} lux`
}
