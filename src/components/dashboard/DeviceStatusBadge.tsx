import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'
import { formatDateTime } from '../../lib/format'

interface DeviceStatusBadgeProps {
  status: DashboardDeviceStatus | null
  error: boolean
}

// Absolute timestamp only -- no relative "x min temu" label (see CurrentConditionsCard.tsx and
// CHANGELOG.md M5.7). Never renders a device key, hash, or other internal identifier.
// Uses last_seen_at (device liveness: last accepted telemetry OR heartbeat), never
// last_telemetry_received_at (only populated for devices posting to /iot/v1/telemetry) -- the
// radar's own liveness signal is its heartbeat, not a telemetry_raw row, so last_seen_at is the
// only field that is correct for both the weather station and the radar (see ETAP 2).
export function DeviceStatusBadge({ status, error }: DeviceStatusBadgeProps) {
  if (error || !status) {
    return (
      <span
        role="status"
        className="rounded-full border border-slate-700 bg-slate-800/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
      >
        Status ESP nieznany
      </span>
    )
  }

  const pillClass = status.online
    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
    : 'border-rose-400/40 bg-rose-400/10 text-rose-300'

  return (
    <div className="flex flex-col items-end gap-1">
      <span role="status" className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${pillClass}`}>
        ESP {status.online ? 'ONLINE' : 'OFFLINE'}
      </span>
      {status.online && (
        <span className="text-xs text-slate-500">Wi-Fi: {status.wifi_rssi != null ? `${status.wifi_rssi} dBm` : '—'}</span>
      )}
      <span className="text-xs text-slate-500">
        {status.last_seen_at
          ? `Ostatni kontakt: ${formatDateTime(status.last_seen_at)}`
          : 'Brak danych o urządzeniu'}
      </span>
    </div>
  )
}
