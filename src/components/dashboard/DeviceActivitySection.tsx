import { useEffect, useState } from 'react'
import { getDeviceActivityHourly } from '../../lib/dashboardApi'
import type { DashboardDeviceActivityHourly, HistoryRangeHours } from '../../lib/dashboardTypes'
import { BarChart } from './BarChart'

interface ActivityResult {
  hours: HistoryRangeHours
  activity: DashboardDeviceActivityHourly | null
  error: boolean
}

interface DeviceActivitySectionProps {
  hours: HistoryRangeHours
  refreshKey: number
  onRefreshComplete: (source: 'activity', key: number, successful: boolean) => void
}

// M5.8: source is public.telemetry_raw (live PostgreSQL), never Databricks -- fetched on the same
// refresh cycle as the current-conditions/history cards (see RoadMonitorPage.tsx), not on the
// faster DEVICE_STATUS_POLL_MS cadence, since there is no separate server-side cache to bypass.
// `hours` is the same 24h/7d range shared with WeatherHistorySection (see RoadMonitorPage.tsx).
export function DeviceActivitySection({ hours, refreshKey, onRefreshComplete }: DeviceActivitySectionProps) {
  const [result, setResult] = useState<ActivityResult | null>(null)

  useEffect(() => {
    let cancelled = false
    let successful = false
    getDeviceActivityHourly(undefined, hours)
      .then((data) => {
        successful = true
        if (!cancelled) setResult({ hours, activity: data, error: false })
      })
      .catch(() => {
        if (!cancelled) {
          setResult((previous) =>
            previous?.hours === hours && previous.activity
              ? { ...previous, error: true }
              : { hours, activity: null, error: true },
          )
        }
      })
      .finally(() => {
        if (!cancelled) onRefreshComplete('activity', refreshKey, successful)
      })
    return () => {
      cancelled = true
    }
  }, [hours, onRefreshComplete, refreshKey])

  const loading = result === null || result.hours !== hours
  const activity = !loading ? result.activity : null
  const error = !loading && result.error && !activity
  const refreshError = !loading && result.error && Boolean(activity)

  const points = activity?.points ?? []
  const chartPoints = points.map((point) => ({ x: new Date(point.hour_start), y: point.upload_count }))
  const totalUploads = points.reduce((sum, point) => sum + point.upload_count, 0)
  const noData = !loading && !error && activity !== null && totalUploads === 0
  const hardError = !loading && error && !activity
  const rangeLabel = hours === 24 ? 'ostatnie 24 h' : 'ostatnie 7 dni'

  return (
    <section aria-labelledby="activity-heading" className="mt-16">
      <h2 id="activity-heading" className="text-2xl font-bold tracking-tight text-white">
        Transmisje ESP
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Liczba poprawnie odebranych pakietów telemetrycznych na godzinę — {rangeLabel}.
      </p>

      {loading && (
        <p role="status" className="mt-6 text-slate-300">
          Ładowanie danych...
        </p>
      )}

      {hardError && (
        <p role="alert" className="mt-6 text-slate-300">
          Statystyka transmisji jest chwilowo niedostępna.
        </p>
      )}

      {refreshError && (
        <p role="status" className="mt-6 text-sm text-amber-200">
          Nie udało się odświeżyć danych. Wyświetlane są ostatnie dostępne dane.
        </p>
      )}

      {!loading && !hardError && activity && (
        <>
          {noData ? (
            <p className="mt-6 text-slate-400">Brak transmisji ESP w wybranym okresie.</p>
          ) : (
            <div className="mt-6">
              <BarChart title="Transmisje na godzinę" points={chartPoints} currentIndex={chartPoints.length - 1} />
              <p className="mt-2 text-xs text-slate-500">
                Nominalnie ok. 12 transmisji/h przy obecnym interwale telemetrii co 5 minut — wartości rzeczywiste zależą od
                jakości łącza i mogą się różnić.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
