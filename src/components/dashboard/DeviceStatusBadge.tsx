import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'
import { formatDateTime } from '../../lib/format'

interface DeviceStatusBadgeProps {
  status: DashboardDeviceStatus | null
  error: boolean
}

// Absolute timestamp only -- no relative "x min temu" label (see CurrentConditionsCard.tsx and
// CHANGELOG.md M5.7). Never renders a device key, hash, or other internal identifier.
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
      <span className="text-xs text-slate-500">
        {status.last_telemetry_received_at
          ? `Ostatni odczyt telemetry: ${formatDateTime(status.last_telemetry_received_at)}`
          : 'Brak danych o urządzeniu'}
      </span>
    </div>
  )
}
