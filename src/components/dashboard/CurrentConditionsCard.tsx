import type { DashboardCurrentStatus, DashboardDeviceStatus, DashboardLocalComparison } from '../../lib/dashboardTypes'
import { formatDateTime, formatHumidity, formatLux, formatPressure, formatTemperature } from '../../lib/format'
import { LocalWeatherComparison } from './LocalWeatherComparison'
import { DeviceStatusBadge } from './DeviceStatusBadge'

interface CurrentConditionsCardProps {
  status: DashboardCurrentStatus | null
  loading: boolean
  error: boolean
  deviceStatus: DashboardDeviceStatus | null
  deviceStatusError: boolean
}

// Normalized once, here, at the single point local_comparison enters the render tree -- an
// API response from before this field's rollout omits it entirely (see dashboardTypes.ts).
const EMPTY_LOCAL_COMPARISON: DashboardLocalComparison = {
  local_temperature_c: null,
  api_temperature_c: null,
  temperature_delta_c: null,
  local_humidity_percent: null,
  api_humidity_percent: null,
  humidity_delta_pp: null,
  local_pressure_hpa: null,
  api_pressure_hpa: null,
  light_lux: null,
  cloud_percent: null,
  local_observed_at: null,
}

function Metric({ label, value, source }: { label: string; value: string; source: 'local' | 'weatherapi' }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <dt className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <span className={source === 'local' ? 'text-emerald-400' : 'text-sky-400'}>
          {source === 'local' ? 'Lokalnie' : 'WeatherAPI'}
        </span>
      </dt>
      <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
    </div>
  )
}

export function CurrentConditionsCard({ status, loading, error, deviceStatus, deviceStatusError }: CurrentConditionsCardProps) {
  if (loading) {
    return (
      <div role="status" className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300">
        Ładowanie danych...
      </div>
    )
  }

  if (error || !status) {
    return (
      <div role="alert" className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300">
        Aktualne dane są chwilowo niedostępne. Spróbuj ponownie później.
      </div>
    )
  }

  const { weather } = status
  const comparison = status.local_comparison ?? EMPTY_LOCAL_COMPARISON
  // Same freshness switch as LocalWeatherComparison.tsx: local_observed_at is null whenever the
  // backend has no usable (or too-stale) LOCAL row for this location. WeatherAPI must never
  // stand in for a missing LOCAL value here -- unlike LocalWeatherComparison's WeatherAPI column,
  // this card shows LOCAL only, so a stale/absent reading renders as unavailable, not a fallback.
  const hasFreshLocal = comparison.local_observed_at != null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Aktualne warunki — {status.location_id}</h3>
        <DeviceStatusBadge status={deviceStatus} error={deviceStatusError} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Temperatura" value={hasFreshLocal ? formatTemperature(comparison.local_temperature_c) : '—'} source="local" />
        <Metric label="Wilgotność" value={hasFreshLocal ? formatHumidity(comparison.local_humidity_percent) : '—'} source="local" />
        <Metric label="Ciśnienie" value={hasFreshLocal ? formatPressure(comparison.local_pressure_hpa) : '—'} source="local" />
        <Metric label="Jasność" value={hasFreshLocal ? formatLux(comparison.light_lux) : '—'} source="local" />
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Opady" value={`${weather.precipitation_mm} mm`} source="weatherapi" />
        <Metric label="Wiatr" value={`${weather.wind_kph} km/h`} source="weatherapi" />
        <Metric label="Widoczność" value={`${weather.visibility_km} km`} source="weatherapi" />
        <Metric label="Warunki" value={weather.condition_text ?? '—'} source="weatherapi" />
      </dl>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
        <span>Pomiar lokalny: {comparison.local_observed_at ? formatDateTime(comparison.local_observed_at) : '—'}</span>
        <span>WeatherAPI: {formatDateTime(status.weather_observed_at)}</span>
      </div>

      <LocalWeatherComparison comparison={comparison} weather={weather} />
    </div>
  )
}
