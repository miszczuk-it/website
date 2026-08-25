import type {
  DashboardCurrentStatus,
  DashboardDeviceActivityHourly,
  DashboardDeviceStatus,
  DashboardWeatherHistory,
} from './dashboardTypes'

const API_BASE_URL = import.meta.env.VITE_IOT_API_URL ?? 'https://api.miszczuk.it'

export class DashboardApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DashboardApiError'
  }
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: 'application/json' } })
  } catch {
    throw new DashboardApiError('network error')
  }
  if (!response.ok) throw new DashboardApiError(`request failed with status ${response.status}`)
  return (await response.json()) as T
}

export function getCurrentStatus(locationId?: string, refresh = false): Promise<DashboardCurrentStatus> {
  const params = new URLSearchParams()
  if (locationId) params.set('location_id', locationId)
  if (refresh) params.set('refresh', 'true')
  const query = params.size > 0 ? `?${params.toString()}` : ''
  return getJson<DashboardCurrentStatus>(`/iot/v1/dashboard/current${query}`)
}

export function getWeatherHistory(hours: number, refresh = false): Promise<DashboardWeatherHistory> {
  const params = new URLSearchParams({ hours: String(hours) })
  if (refresh) params.set('refresh', 'true')
  return getJson<DashboardWeatherHistory>(`/iot/v1/dashboard/weather-hourly?${params.toString()}`)
}

// M5.7: independent of getCurrentStatus/getWeatherHistory -- no `refresh` param, this endpoint is
// never cached server-side, and it's polled on its own fast interval (see RoadMonitorPage.tsx).
export function getDeviceStatus(deviceId?: string): Promise<DashboardDeviceStatus> {
  const params = new URLSearchParams()
  if (deviceId) params.set('device_id', deviceId)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  return getJson<DashboardDeviceStatus>(`/iot/v1/dashboard/device-status${query}`)
}

// M5.8: independent of getWeatherHistory -- no `refresh` param, this endpoint is never cached
// server-side either. Fetched on the normal dashboard refresh cycle (see RoadMonitorPage.tsx),
// not on DEVICE_STATUS_POLL_MS.
export function getDeviceActivityHourly(deviceId?: string, hours = 24): Promise<DashboardDeviceActivityHourly> {
  const params = new URLSearchParams({ hours: String(hours) })
  if (deviceId) params.set('device_id', deviceId)
  return getJson<DashboardDeviceActivityHourly>(`/iot/v1/dashboard/device-activity-hourly?${params.toString()}`)
}
