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

export function getCurrentStatus(locationId?: string): Promise<DashboardCurrentStatus> {
  const query = locationId ? `?location_id=${encodeURIComponent(locationId)}` : ''
  return getJson<DashboardCurrentStatus>(`/iot/v1/dashboard/current${query}`)
}

export function getWeatherHistory(hours: number): Promise<DashboardWeatherHistory> {
  return getJson<DashboardWeatherHistory>(`/iot/v1/dashboard/weather-hourly?hours=${hours}`)
}
