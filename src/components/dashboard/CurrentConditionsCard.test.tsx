import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CurrentConditionsCard } from './CurrentConditionsCard'
import type { DashboardCurrentStatus, DashboardDeviceStatus, DashboardLocalComparison } from '../../lib/dashboardTypes'

const weather = {
  temperature_c: 15.1,
  humidity_pct: 80,
  pressure_hpa: 1009,
  precipitation_mm: 0.4,
  wind_kph: 8.3,
  visibility_km: 10,
  condition_text: 'Pochmurno',
}

const freshComparison: DashboardLocalComparison = {
  local_temperature_c: 18.7,
  api_temperature_c: 15.1,
  temperature_delta_c: 3.6,
  local_humidity_percent: 68,
  api_humidity_percent: 80,
  humidity_delta_pp: -12,
  local_pressure_hpa: 1007,
  api_pressure_hpa: 1009,
  light_lux: 12450,
  cloud_percent: 40,
  local_observed_at: '2026-09-04T20:15:00Z',
}

function buildStatus(localComparison: DashboardLocalComparison | undefined): DashboardCurrentStatus {
  return {
    location_id: 'road-001',
    weather,
    weather_observed_at: '2026-09-04T20:10:00Z',
    weather_age_minutes: 5,
    traffic_available: true,
    local_comparison: localComparison,
    calculated_at: '2026-09-04T20:16:00Z',
    data_status: 'fresh',
    last_databricks_success_at: '2026-09-04T20:16:00Z',
    source_data_at: '2026-09-04T20:10:00Z',
  }
}

const deviceStatus: DashboardDeviceStatus = { device_id: 'road-001', online: true, last_telemetry_received_at: '2026-09-04T20:15:00Z', last_seen_at: '2026-09-04T20:15:00Z' }

describe('CurrentConditionsCard', () => {
  it('sources temperature/humidity/pressure/light from LOCAL and labels them Lokalnie', () => {
    const { container } = render(<CurrentConditionsCard status={buildStatus(freshComparison)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    // Scoped to the first <dl> (the LOCAL primary grid) -- LocalWeatherComparison below it
    // legitimately repeats the same fresh LOCAL values in its own comparison table.
    const localGrid = container.querySelector('dl') as HTMLElement
    expect(within(localGrid).getByText('18.7 °C')).toBeInTheDocument()
    expect(within(localGrid).getByText('68 %')).toBeInTheDocument()
    expect(within(localGrid).getByText('1007 hPa')).toBeInTheDocument()
    expect(within(localGrid).getByText(/12.*450 lux/)).toBeInTheDocument()
    expect(within(localGrid).getAllByText('Lokalnie')).toHaveLength(4)
  })

  it('sources precipitation/wind/visibility/condition from WeatherAPI and labels them WeatherAPI', () => {
    render(<CurrentConditionsCard status={buildStatus(freshComparison)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    expect(screen.getByText('0.4 mm')).toBeInTheDocument()
    expect(screen.getByText('8.3 km/h')).toBeInTheDocument()
    expect(screen.getByText('10 km')).toBeInTheDocument()
    expect(screen.getByText('Pochmurno')).toBeInTheDocument()
    expect(screen.getAllByText('WeatherAPI').length).toBeGreaterThanOrEqual(4)
  })

  it('shows LOCAL values as unavailable, never falling back to WeatherAPI, when local_comparison is stale/absent', () => {
    const { container } = render(<CurrentConditionsCard status={buildStatus(undefined)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    // The first <dl> is the LOCAL primary grid (rendered before the WeatherAPI grid and before
    // LocalWeatherComparison, which legitimately shows WeatherAPI's own 15.1 °C/80 %/1009 hPa as
    // *its* reference column even when LOCAL is stale -- that must not be confused with this card's
    // LOCAL values).
    const localGrid = container.querySelector('dl') as HTMLElement
    expect(within(localGrid).queryByText('15.1 °C')).not.toBeInTheDocument()
    expect(within(localGrid).queryByText('80 %')).not.toBeInTheDocument()
    expect(within(localGrid).queryByText('1009 hPa')).not.toBeInTheDocument()
    expect(within(localGrid).getAllByText('—')).toHaveLength(4)
  })

  it('shows two separate timestamps: local measurement time and WeatherAPI time', () => {
    render(<CurrentConditionsCard status={buildStatus(freshComparison)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    const local = screen.getByText(/Pomiar lokalny:/)
    const api = screen.getByText(/WeatherAPI:/)
    expect(local).toBeInTheDocument()
    expect(api).toBeInTheDocument()
    expect(local.textContent).not.toEqual(api.textContent)
  })

  it('shows the local timestamp as unavailable ("—") when there is no fresh local_comparison', () => {
    render(<CurrentConditionsCard status={buildStatus(undefined)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    expect(screen.getByText('Pomiar lokalny: —')).toBeInTheDocument()
  })

  it('still renders the LOCAL vs WeatherAPI comparison section', () => {
    render(<CurrentConditionsCard status={buildStatus(freshComparison)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    expect(screen.getByText('Lokalnie vs WeatherAPI')).toBeInTheDocument()
  })

  it('shows the weather-station device status badge', () => {
    render(<CurrentConditionsCard status={buildStatus(freshComparison)} loading={false} error={false} deviceStatus={deviceStatus} deviceStatusError={false} />)

    expect(screen.getByText('ESP ONLINE')).toBeInTheDocument()
  })
})
