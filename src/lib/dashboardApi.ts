import type { DashboardCurrentStatus, DashboardWeatherHistory } from './dashboardTypes'

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
