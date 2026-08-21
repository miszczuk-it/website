import type { DashboardCurrentStatus } from '../../lib/dashboardTypes'

interface CurrentConditionsCardProps {
  status: DashboardCurrentStatus | null
  loading: boolean
  error: boolean
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes < 1) return 'przed chwilą'
  if (minutes < 60) return `${minutes} min temu`
  const hours = Math.floor(minutes / 60)
  return `${hours} godz. temu`
}

function formatObservedAt(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
    </div>
  )
}

export function CurrentConditionsCard({ status, loading, error }: CurrentConditionsCardProps) {
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

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Aktualne warunki — {status.location_id}</h3>
        {weather.condition_text && <span className="text-sm text-sky-400">{weather.condition_text}</span>}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Temperatura" value={`${weather.temperature_c} °C`} />
        <Metric label="Wilgotność" value={`${weather.humidity_pct} %`} />
        <Metric label="Ciśnienie" value={`${weather.pressure_hpa} hPa`} />
        <Metric label="Opady" value={`${weather.precipitation_mm} mm`} />
        <Metric label="Wiatr" value={`${weather.wind_kph} km/h`} />
        <Metric label="Widoczność" value={`${weather.visibility_km} km`} />
      </dl>

      <p className="mt-4 text-sm text-slate-400">
        Ostatnia aktualizacja: {formatObservedAt(status.weather_observed_at)} ({formatRelativeMinutes(status.weather_age_minutes)})
      </p>
    </div>
  )
}
