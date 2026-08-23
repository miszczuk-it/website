import { useEffect, useState } from 'react'
import { getWeatherHistory } from '../../lib/dashboardApi'
import type { DashboardWeatherHistory } from '../../lib/dashboardTypes'
import { LineChart } from './LineChart'

const RANGES = [
  { label: '24 h', hours: 24 },
  { label: '7 dni', hours: 168 },
] as const

interface HistoryResult {
  hours: number
  history: DashboardWeatherHistory | null
  error: boolean
}

interface WeatherHistorySectionProps {
  refreshKey: number
  forceRefresh: boolean
  onRefreshComplete: (source: 'history', key: number, successful: boolean) => void
}

export function WeatherHistorySection({ refreshKey, forceRefresh, onRefreshComplete }: WeatherHistorySectionProps) {
  const [hours, setHours] = useState<number>(24)
  const [result, setResult] = useState<HistoryResult | null>(null)

  useEffect(() => {
    let cancelled = false
    let successful = false
    getWeatherHistory(hours, forceRefresh)
      .then((data) => {
        successful = true
        if (!cancelled) setResult({ hours, history: data, error: false })
      })
      .catch(() => {
        if (!cancelled) {
          setResult((previous) =>
            previous?.hours === hours && previous.history
              ? { ...previous, error: true }
              : { hours, history: null, error: true },
          )
        }
      })
      .finally(() => {
        if (!cancelled) onRefreshComplete('history', refreshKey, successful)
      })
    return () => {
      cancelled = true
    }
  }, [forceRefresh, hours, onRefreshComplete, refreshKey])

  const loading = result === null || result.hours !== hours
  const history = !loading ? result.history : null
  const error = !loading && result.error && !history
  const refreshError = !loading && result.error && Boolean(history)
  const points = history?.points ?? []
  const temperaturePoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.temperature_avg_c }))
  const pressurePoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.pressure_avg_hpa }))
  const humidityPoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.humidity_avg_pct }))
  const localTemperaturePoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.local_temperature_avg_c }))
  const temperatureDeltaPoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.temperature_delta_avg_c }))
  const localHumidityPoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.local_humidity_avg_pct }))
  const humidityDeltaPoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.humidity_delta_avg_pp }))
  const localPressurePoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.local_pressure_avg_hpa }))
  const localLightPoints = points.map((p) => ({ x: new Date(p.observation_hour), y: p.local_light_avg_lux }))

  return (
    <section aria-labelledby="history-heading" className="mt-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="history-heading" className="text-2xl font-bold tracking-tight text-white">
          Historia pomiarów pogodowych
        </h2>

        <div role="group" aria-label="Zakres historii" className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range.hours}
              type="button"
              onClick={() => setHours(range.hours)}
              aria-pressed={hours === range.hours}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                hours === range.hours
                  ? 'border-sky-400 bg-sky-400/10 text-sky-300'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p role="status" className="mt-6 text-slate-300">
          Ładowanie danych...
        </p>
      )}

      {!loading && error && (
        <p role="alert" className="mt-6 text-slate-300">
          Dane historyczne są chwilowo niedostępne. Spróbuj ponownie później.
        </p>
      )}

      {refreshError && (
        <p role="status" className="mt-6 text-sm text-amber-200">
          Nie udało się odświeżyć danych. Wyświetlane są ostatnie dostępne dane.
        </p>
      )}

      {!loading && history?.data_status === 'stale' && (
        <p role="status" className="mt-6 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Databricks jest chwilowo niedostÄ™pny. WyĹ›wietlane sÄ… ostatnie poprawne dane.
        </p>
      )}

      {!loading && history && (
        <>
          {points.length === 0 ? (
            <p className="mt-6 text-slate-400">Brak jeszcze danych historycznych dla wybranego okresu.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Historia obejmuje dane dostępne od{' '}
              {new Date(points[0].observation_hour).toLocaleString('pl-PL', {
                timeZone: 'Europe/Warsaw',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </p>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <LineChart
              title="Temperatura"
              unit=" °C"
              points={temperaturePoints}
              color="#f97316"
              primaryLabel="WeatherAPI"
              secondary={{ label: 'Lokalnie', points: localTemperaturePoints }}
              deltaPoints={temperatureDeltaPoints}
            />
            <LineChart
              title="Ciśnienie"
              unit=" hPa"
              points={pressurePoints}
              color="#38bdf8"
              formatValue={(v) => v.toFixed(0)}
              primaryLabel="WeatherAPI"
              secondary={{ label: 'Lokalnie', points: localPressurePoints }}
            />
            <LineChart
              title="Wilgotność"
              unit=" %"
              points={humidityPoints}
              color="#a78bfa"
              formatValue={(v) => v.toFixed(0)}
              primaryLabel="WeatherAPI"
              secondary={{ label: 'Lokalnie', points: localHumidityPoints }}
              deltaPoints={humidityDeltaPoints}
              deltaUnit=" pp"
            />
            <LineChart
              title="Światło (lokalnie)"
              unit=" lux"
              points={localLightPoints}
              color="#facc15"
              formatValue={(v) => new Intl.NumberFormat('pl-PL').format(Math.round(v))}
            />
          </div>
        </>
      )}
    </section>
  )
}
