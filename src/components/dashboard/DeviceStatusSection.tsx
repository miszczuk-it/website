import { useEffect, useState } from 'react'
import { getDeviceStatus } from '../../lib/dashboardApi'
import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'
import { MONITORED_DEVICES } from '../../lib/monitoredDevices'
import { DeviceStatusBadge } from './DeviceStatusBadge'

// Mirrors RoadMonitorPage.DEVICE_STATUS_POLL_MS (kept as a local literal to avoid a circular
// import between the page and this section): device-status reads live from Postgres, not the
// hourly-batched Databricks GOLD path, so all monitored devices are polled far more often than
// the Databricks-backed dashboard refresh.
const POLL_MS = 60 * 1000

function useDeviceStatus(deviceId: string) {
  const [status, setStatus] = useState<DashboardDeviceStatus | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchStatus = () => {
      getDeviceStatus(deviceId)
        .then((data) => {
          if (!cancelled) {
            setStatus(data)
            setError(false)
          }
        })
        .catch(() => {
          if (!cancelled) setError(true)
        })
    }

    fetchStatus()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchStatus()
    }, POLL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchStatus()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [deviceId])

  return { status, error }
}

function DeviceTile({ label, status, error }: { label: string; status: DashboardDeviceStatus | null; error: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <span className="text-sm font-semibold text-white">{label}</span>
      <DeviceStatusBadge status={status} error={error} />
    </div>
  )
}

// Three independent devices, three independent liveness signals (ETAP 2 + PROD cutover): the
// weather station's last contact is its regular telemetry POST, the radar's and camera's are
// their heartbeat -- never the last detected vehicle or capture. An empty road must never make
// the radar tile look offline, and a camera with no physical hardware attached yet must show
// OFFLINE (from a stale/absent heartbeat) rather than crash or be hidden.
export function DeviceStatusSection() {
  return (
    <section aria-labelledby="device-status-heading" className="mt-16">
      <h2 id="device-status-heading" className="text-2xl font-bold tracking-tight text-white">
        Status urządzeń
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONITORED_DEVICES.map((device) => (
          <DeviceStatusTile key={device.id} deviceId={device.id} label={device.label} />
        ))}
      </div>
    </section>
  )
}

function DeviceStatusTile({ deviceId, label }: { deviceId: string; label: string }) {
  const { status, error } = useDeviceStatus(deviceId)
  return <DeviceTile label={label} status={status} error={error} />
}
