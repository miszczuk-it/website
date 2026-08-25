import { useEffect, useRef, useState } from 'react'
import { getDeviceActivityHourly } from '../../lib/dashboardApi'
import type { DashboardDeviceActivityHourly } from '../../lib/dashboardTypes'
import { BarChart } from './BarChart'

const HOURS = 24

interface DeviceActivitySectionProps {
  refreshKey: number
  onRefreshComplete: (source: 'activity', key: number, successful: boolean) => void
}

// M5.8: source is public.telemetry_raw (live PostgreSQL), never Databricks -- fetched on the same
// refresh cycle as the current-conditions/history cards (see RoadMonitorPage.tsx), not on the
// faster DEVICE_STATUS_POLL_MS cadence, since there is no separate server-side cache to bypass.
export function DeviceActivitySection({ refreshKey, onRefreshComplete }: DeviceActivitySectionProps) {
  const [activity, setActivity] = useState<DashboardDeviceActivityHourly | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const activityRef = useRef<DashboardDeviceActivityHourly | null>(null)

  useEffect(() => {
    let cancelled = false
    let successful = false
    getDeviceActivityHourly(undefined, HOURS)
      .then((data) => {
        successful = true
        if (!cancelled) {
          activityRef.current = data
          setActivity(data)
          setError(false)
        }
      })
      .catch(() => {
        if (!cancelled && !activityRef.current) setError(true)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          onRefreshComplete('activity', refreshKey, successful)
        }
      })
    return () => {
      cancelled = true
    }
  }, [onRefreshComplete, refreshKey])

  const points = activity?.points ?? []
  const chartPoints = points.map((point) => ({ x: new Date(point.hour_start), y: point.upload_count }))
  const totalUploads = points.reduce((sum, point) => sum + point.upload_count, 0)
  const noData = !loading && !error && activity !== null && totalUploads === 0
  const hardError = !loading && error && !activity
  const refreshError = !loading && error && activity !== null

  return (
    <section aria-labelledby="activity-heading" className="mt-16">
      <h2 id="activity-heading" className="text-2xl font-bold tracking-tight text-white">
        Transmisje ESP
      </h2>
      <p className="mt-2 text-sm text-slate-500">Liczba poprawnie odebranych pakietów telemetrycznych na godzinę (ostatnie 24 h).</p>

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
