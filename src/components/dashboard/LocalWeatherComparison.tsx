import type { DashboardLocalComparison, DashboardWeatherSnapshot } from '../../lib/dashboardTypes'
import { formatDateTime } from '../../lib/format'

interface LocalWeatherComparisonProps {
  comparison: DashboardLocalComparison
  weather: DashboardWeatherSnapshot
}

function formatTemperature(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} °C`
}

function formatTemperatureDelta(value: number | null): string {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}°C`
}

function formatHumidity(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} %`
}

function formatHumidityDelta(value: number | null): string {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${Math.round(value)} pp`
}

function formatPressure(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(0)} hPa`
}

function formatLux(value: number | null): string {
  return value == null ? '—' : `${new Intl.NumberFormat('pl-PL').format(Math.round(value))} lux`
}

function formatCloud(value: number | null): string {
  return value == null ? '—' : `Zachmurzenie ${Math.round(value)}%`
}

interface ComparisonRow {
  key: string
  label: string
  local: string
  weatherApi: string
  delta: string
}

// Whether fresh LOCAL data exists is a single binary switch: local_observed_at is null
// whenever the backend has no usable (or too-stale) comparison row for this location, in
// which case WeatherAPI must still come from the always-live `weather` snapshot, not from
// the (also empty) comparison fields.
export function LocalWeatherComparison({ comparison, weather }: LocalWeatherComparisonProps) {
  const hasFreshLocal = comparison.local_observed_at != null

  const localTempC = hasFreshLocal ? comparison.local_temperature_c : null
  const apiTempC = hasFreshLocal ? comparison.api_temperature_c : weather.temperature_c
  const deltaTempC = hasFreshLocal ? comparison.temperature_delta_c : null

  const localHumidity = hasFreshLocal ? comparison.local_humidity_percent : null
  const apiHumidity = hasFreshLocal ? comparison.api_humidity_percent : weather.humidity_pct
  const deltaHumidity = hasFreshLocal ? comparison.humidity_delta_pp : null

  const localPressure = hasFreshLocal ? comparison.local_pressure_hpa : null
  const apiPressure = hasFreshLocal ? comparison.api_pressure_hpa : weather.pressure_hpa

  const localLux = hasFreshLocal ? comparison.light_lux : null
  const cloudPercent = hasFreshLocal ? comparison.cloud_percent : null

  const rows: ComparisonRow[] = [
    {
      key: 'temperature',
      label: 'Temperatura',
      local: formatTemperature(localTempC),
      weatherApi: formatTemperature(apiTempC),
      delta: formatTemperatureDelta(deltaTempC),
    },
    {
      key: 'humidity',
      label: 'Wilgotność',
      local: formatHumidity(localHumidity),
      weatherApi: formatHumidity(apiHumidity),
      delta: formatHumidityDelta(deltaHumidity),
    },
    {
      key: 'pressure',
      label: 'Ciśnienie',
      local: formatPressure(localPressure),
      weatherApi: formatPressure(apiPressure),
      // No pressure_delta field exists: WeatherAPI and BME280 pressure definitions are not
      // confirmed comparable, so this is never computed, regardless of data freshness.
      delta: '—',
    },
    {
      key: 'light',
      label: 'Światło',
      local: formatLux(localLux),
      weatherApi: formatCloud(cloudPercent),
      // Lux and cloud % are related signals, not a shared scale -- never a delta.
      delta: '—',
    },
  ]

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lokalnie vs WeatherAPI</h4>
      {comparison.local_observed_at != null && (
        // KI-001: after the backend fix, this comparison row can legitimately be a bit older
        // than the newest raw local telemetry (it waits for a matched WeatherAPI observation),
        // so the row's own timestamp is shown here -- deliberately not labeled "ostatnia
        // aktualizacja", which would read as the newest telemetry timestamp.
        <p className="mt-1 text-xs text-slate-500">Porównanie dla: {formatDateTime(comparison.local_observed_at)}</p>
      )}

      <table className="mt-3 hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Porównanie pomiarów lokalnych z WeatherAPI</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-4 font-medium">
              Metryka
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Lokalnie
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              WeatherAPI
            </th>
            <th scope="col" className="py-2 font-medium">
              Różnica
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-800">
              <th scope="row" className="py-2 pr-4 font-medium text-slate-300">
                {row.label}
              </th>
              <td className="py-2 pr-4 text-white">{row.local}</td>
              <td className="py-2 pr-4 text-white">{row.weatherApi}</td>
              <td className="py-2 text-white">{row.delta}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 space-y-3 md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{row.label}</dt>
            <dd className="mt-2 space-y-1 text-sm text-white">
              <div className="flex justify-between">
                <span className="text-slate-400">Lokalnie</span>
                <span>{row.local}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">WeatherAPI</span>
                <span>{row.weatherApi}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Różnica</span>
                <span>{row.delta}</span>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
