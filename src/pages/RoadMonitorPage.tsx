import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '../router'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import { getCurrentStatus, getDeviceStatus } from '../lib/dashboardApi'
import type { DashboardCurrentStatus, DashboardDeviceStatus } from '../lib/dashboardTypes'
import { CurrentConditionsCard } from '../components/dashboard/CurrentConditionsCard'
import { WeatherHistorySection } from '../components/dashboard/WeatherHistorySection'
import { TrafficSection } from '../components/dashboard/TrafficSection'

// M5.7: device status is polled far more often than the Databricks-backed dashboard refresh
// (AUTO_REFRESH_MS below) -- it reads live from Postgres, not from the hourly-batched GOLD
// pipeline, so a 60-minute cadence would defeat its purpose for a device that POSTs every 5
// minutes. This interval is intentionally independent of AUTO_REFRESH_MS.
export const DEVICE_STATUS_POLL_MS = 60 * 1000

const TECH_STACK: { name: string; status: 'operational' | 'planned' }[] = [
  { name: 'ESP32', status: 'planned' },
  { name: 'ASP.NET Core', status: 'operational' },
  { name: 'PostgreSQL', status: 'operational' },
  { name: 'n8n', status: 'operational' },
  { name: 'Databricks', status: 'operational' },
  { name: 'Docker', status: 'operational' },
  { name: 'GitHub Actions', status: 'operational' },
]

export const AUTO_REFRESH_MS = 60 * 60 * 1000

type RefreshSource = 'current' | 'history'

export function RoadMonitorPage() {
  useDocumentMeta(
    'IoT Road Monitor | miszczuk.it',
    'Eksperymentalny system monitorowania warunków przy drodze łączący czujniki IoT, dane pogodowe i analitykę Databricks.',
  )

  const [status, setStatus] = useState<DashboardCurrentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<DashboardDeviceStatus | null>(null)
  const [deviceStatusError, setDeviceStatusError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [forceRefresh, setForceRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<number | null>(null)
  const statusRef = useRef<DashboardCurrentStatus | null>(null)
  const refreshKeyRef = useRef(0)
  const refreshingRef = useRef(true)
  const refreshCycleRef = useRef({ key: 0, sources: new Set<RefreshSource>(), successful: true })

  const startRefresh = useCallback((force = false) => {
    if (refreshingRef.current || document.visibilityState !== 'visible') return

    const key = refreshKeyRef.current + 1
    refreshKeyRef.current = key
    refreshCycleRef.current = { key, sources: new Set(), successful: true }
    refreshingRef.current = true
    setRefreshing(true)
    setForceRefresh(force)
    setRefreshKey(key)
  }, [])

  const handleRefreshComplete = useCallback((source: RefreshSource, key: number, successful: boolean) => {
    const cycle = refreshCycleRef.current
    if (cycle.key !== key || cycle.sources.has(source)) return

    cycle.sources.add(source)
    cycle.successful &&= successful
    if (cycle.sources.size !== 2) return

    refreshingRef.current = false
    setRefreshing(false)
    if (cycle.successful) setLastSuccessfulRefresh(Date.now())
  }, [])

  useEffect(() => {
    let cancelled = false
    let successful = false
    getCurrentStatus(undefined, forceRefresh)
      .then((data) => {
        successful = true
        if (!cancelled) {
          statusRef.current = data
          setStatus(data)
          setError(false)
        }
      })
      .catch(() => {
        if (!cancelled && !statusRef.current) setError(true)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          handleRefreshComplete('current', refreshKey, successful)
        }
      })
    return () => {
      cancelled = true
    }
  }, [forceRefresh, handleRefreshComplete, refreshKey])

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') startRefresh(false)
    }
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        (!lastSuccessfulRefresh || Date.now() - lastSuccessfulRefresh >= AUTO_REFRESH_MS)
      ) {
        startRefresh(false)
      }
    }

    const intervalId = window.setInterval(poll, AUTO_REFRESH_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [lastSuccessfulRefresh, startRefresh])

  useEffect(() => {
    let cancelled = false
    const fetchDeviceStatus = () => {
      getDeviceStatus()
        .then((data) => {
          if (!cancelled) {
            setDeviceStatus(data)
            setDeviceStatusError(false)
          }
        })
        .catch(() => {
          if (!cancelled) setDeviceStatusError(true)
        })
    }

    fetchDeviceStatus()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchDeviceStatus()
    }, DEVICE_STATUS_POLL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchDeviceStatus()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const lastChecked = lastSuccessfulRefresh
    ? new Date(lastSuccessfulRefresh).toLocaleTimeString('pl-PL', {
        timeZone: 'Europe/Warsaw',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Link to="/" className="text-sm text-slate-400 transition-colors hover:text-sky-400">
          ← miszczuk.it
        </Link>

        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">Projekt</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">IoT Road Monitor</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Eksperymentalny system monitorowania warunków przy drodze, łączący czujniki IoT, dane pogodowe i analitykę
          Databricks.
        </p>

        <section aria-labelledby="architecture-heading" className="mt-16">
          <h2 id="architecture-heading" className="text-2xl font-bold tracking-tight text-white">
            Architektura
          </h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <pre className="whitespace-pre text-sm leading-6 text-slate-300">
{`ESP32 / czujniki (planned)
      │
      ▼
IoT API (ASP.NET Core)
      │
      ▼
PostgreSQL
      │
      ▼
n8n
      │
      ▼
Databricks: RAW → SILVER → GOLD
      │
      ▼
dashboard (ta strona)`}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Dane pogodowe są agregowane co godzinę, a nie strumieniowane w czasie rzeczywistym.
          </p>
        </section>

        <section aria-labelledby="current-heading" className="mt-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="current-heading" className="text-2xl font-bold tracking-tight text-white">
              Aktualne warunki
            </h2>
            <button
              type="button"
              onClick={() => startRefresh(true)}
              disabled={refreshing}
              aria-busy={refreshing}
              className="rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? 'Odświeżanie...' : 'Odśwież'}
            </button>
          </div>
          <p aria-live="polite" className="mt-2 text-sm text-slate-500">
            {lastChecked ? `Ostatnio sprawdzono: ${lastChecked}` : 'Sprawdzanie danych...'}
          </p>
          {status?.data_status === 'stale' && (
            <p role="status" className="mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              Databricks jest chwilowo niedostÄ™pny. WyĹ›wietlane sÄ… ostatnie poprawne dane.
            </p>
          )}
          <div className="mt-4">
            <CurrentConditionsCard
              status={status}
              loading={loading}
              error={error}
              deviceStatus={deviceStatus}
              deviceStatusError={deviceStatusError}
            />
          </div>
        </section>

        <WeatherHistorySection refreshKey={refreshKey} forceRefresh={forceRefresh} onRefreshComplete={handleRefreshComplete} />

        <TrafficSection />

        <section aria-labelledby="stack-heading" className="mt-16">
          <h2 id="stack-heading" className="text-2xl font-bold tracking-tight text-white">
            Stos technologiczny
          </h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {TECH_STACK.map((item) => (
              <li
                key={item.name}
                className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm"
              >
                {item.name}
                {item.status === 'planned' && (
                  <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                    planned
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
