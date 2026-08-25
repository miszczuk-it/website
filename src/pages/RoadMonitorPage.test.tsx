import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoadMonitorPage } from './RoadMonitorPage'
import * as dashboardApi from '../lib/dashboardApi'
import type {
  DashboardCurrentStatus,
  DashboardDeviceActivityHourly,
  DashboardDeviceStatus,
  DashboardWeatherHistory,
} from '../lib/dashboardTypes'

vi.mock('../lib/dashboardApi')

const status: DashboardCurrentStatus = {
  location_id: 'road-001',
  weather: {
    temperature_c: 16.2,
    humidity_pct: 70,
    pressure_hpa: 1015,
    precipitation_mm: 0,
    wind_kph: 5,
    visibility_km: 10,
    condition_text: 'Clear',
  },
  weather_observed_at: '2026-08-23T11:00:00Z',
  weather_age_minutes: 5,
  traffic_available: false,
  calculated_at: '2026-08-23T11:05:00Z',
  data_status: 'fresh',
  last_databricks_success_at: '2026-08-23T11:05:00Z',
  source_data_at: '2026-08-23T11:00:00Z',
}

const history: DashboardWeatherHistory = {
  location_id: 'road-001',
  from: '2026-08-22T11:00:00Z',
  to: '2026-08-23T11:00:00Z',
  points: [],
  data_status: 'fresh',
  last_databricks_success_at: '2026-08-23T11:05:00Z',
  source_data_at: '2026-08-23T11:00:00Z',
}

const deviceStatus: DashboardDeviceStatus = {
  device_id: 'road-001',
  online: true,
  last_telemetry_received_at: '2026-08-23T11:04:00Z',
}

const activity: DashboardDeviceActivityHourly = {
  device_id: 'road-001',
  from: '2026-08-22T11:00:00Z',
  to: '2026-08-23T11:00:00Z',
  points: [],
}

describe('RoadMonitorPage manual refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardApi.getCurrentStatus).mockResolvedValue(status)
    vi.mocked(dashboardApi.getWeatherHistory).mockResolvedValue(history)
    vi.mocked(dashboardApi.getDeviceStatus).mockResolvedValue(deviceStatus)
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(activity)
  })

  it('calls getCurrentStatus with refresh=true when the Refresh button is clicked', async () => {
    const user = userEvent.setup()
    render(<RoadMonitorPage />)

    await waitFor(() => expect(dashboardApi.getCurrentStatus).toHaveBeenCalledTimes(1))
    expect(dashboardApi.getCurrentStatus).toHaveBeenLastCalledWith(undefined, false)

    const refreshButton = await screen.findByRole('button', { name: /^Odśwież$/ })
    await user.click(refreshButton)

    await waitFor(() => expect(dashboardApi.getCurrentStatus).toHaveBeenCalledTimes(2))
    expect(dashboardApi.getCurrentStatus).toHaveBeenLastCalledWith(undefined, true)
  })

  it('never renders a relative-age label like "min temu" anywhere on the page', async () => {
    render(<RoadMonitorPage />)

    await waitFor(() => expect(dashboardApi.getCurrentStatus).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.queryByText(/temu/)).not.toBeInTheDocument()
  })

  it('polls getDeviceStatus independently of getCurrentStatus and shows the ONLINE badge', async () => {
    render(<RoadMonitorPage />)

    await waitFor(() => expect(dashboardApi.getDeviceStatus).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('ESP ONLINE')).toBeInTheDocument()
  })
})
