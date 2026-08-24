import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import * as dashboardApi from './lib/dashboardApi'
import type { DashboardCurrentStatus, DashboardDeviceStatus, DashboardWeatherHistory } from './lib/dashboardTypes'

vi.mock('./lib/dashboardApi')

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

describe('public routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardApi.getCurrentStatus).mockResolvedValue(status)
    vi.mocked(dashboardApi.getWeatherHistory).mockResolvedValue(history)
    vi.mocked(dashboardApi.getDeviceStatus).mockResolvedValue(deviceStatus)
  })

  it('renders the personal portfolio at / with a Road Monitor link and no dashboard requests', () => {
    window.history.replaceState({}, '', '/')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Andrzej Miszczuk' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'IoT Road Monitor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zobacz dashboard IoT Road Monitor/ })).toHaveAttribute('href', '/road-monitor')
    expect(dashboardApi.getCurrentStatus).not.toHaveBeenCalled()
    expect(dashboardApi.getWeatherHistory).not.toHaveBeenCalled()
    expect(dashboardApi.getDeviceStatus).not.toHaveBeenCalled()
  })

  it('renders the existing dashboard at /road-monitor', async () => {
    window.history.replaceState({}, '', '/road-monitor')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'IoT Road Monitor' })).toBeInTheDocument()
    await waitFor(() => expect(dashboardApi.getCurrentStatus).toHaveBeenCalledOnce())
    expect(dashboardApi.getDeviceStatus).toHaveBeenCalledOnce()
  })

  it('keeps the existing fallback behavior for an unknown path', () => {
    window.history.replaceState({}, '', '/nieznana-trasa')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Andrzej Miszczuk' })).toBeInTheDocument()
    expect(dashboardApi.getCurrentStatus).not.toHaveBeenCalled()
  })
})
