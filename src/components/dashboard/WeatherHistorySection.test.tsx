import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeatherHistorySection } from './WeatherHistorySection'
import * as dashboardApi from '../../lib/dashboardApi'
import type { DashboardWeatherHistory, DashboardWeatherHourlyPoint } from '../../lib/dashboardTypes'

vi.mock('../../lib/dashboardApi')

function point(overrides: Partial<DashboardWeatherHourlyPoint>): DashboardWeatherHourlyPoint {
  return {
    observation_hour: '2026-08-23T14:00:00Z',
    temperature_avg_c: 17.8,
    temperature_min_c: 16.9,
    temperature_max_c: 18.6,
    humidity_avg_pct: 73.1,
    pressure_avg_hpa: 1014.8,
    precipitation_sum_mm: 0,
    wind_avg_kph: 7.1,
    visibility_avg_km: 10,
    condition_text: 'Clear',
    source_row_count: 4,
    local_temperature_avg_c: null,
    temperature_delta_avg_c: null,
    local_humidity_avg_pct: null,
    humidity_delta_avg_pp: null,
    local_pressure_avg_hpa: null,
    local_light_avg_lux: null,
    local_sample_count: null,
    ...overrides,
  }
}

function renderSection(history: DashboardWeatherHistory) {
  vi.mocked(dashboardApi.getWeatherHistory).mockResolvedValue(history)
  const onRefreshComplete = vi.fn()
  render(<WeatherHistorySection refreshKey={0} forceRefresh={false} onRefreshComplete={onRefreshComplete} />)
  return waitFor(() => expect(dashboardApi.getWeatherHistory).toHaveBeenCalled())
}

describe('WeatherHistorySection', () => {
  it('renders a WeatherAPI/Lokalnie legend and a delta column for temperature when LOCAL data is present', async () => {
    const history: DashboardWeatherHistory = {
      location_id: 'road-001',
      from: '2026-08-22T14:00:00Z',
      to: '2026-08-23T14:00:00Z',
      points: [point({ local_temperature_avg_c: 22.1, temperature_delta_avg_c: 4.3 })],
      data_status: 'fresh',
      last_databricks_success_at: '2026-08-23T14:05:00Z',
      source_data_at: '2026-08-23T14:00:00Z',
    }
    await renderSection(history)

    const temperatureFigure = (await screen.findByText('Temperatura')).closest('figure')!
    expect(within(temperatureFigure).getAllByText('WeatherAPI').length).toBeGreaterThan(0)
    expect(within(temperatureFigure).getAllByText('Lokalnie').length).toBeGreaterThan(0)

    const user = userEvent.setup()
    await user.click(within(temperatureFigure).getByText('Dane w formie tabeli'))
    expect(within(temperatureFigure).getByText('Różnica')).toBeInTheDocument()
    expect(within(temperatureFigure).getByText('+4.3 °C')).toBeInTheDocument()
  })

  it('shows "Brak danych lokalnych" and no delta column for pressure when local pressure is null throughout', async () => {
    const history: DashboardWeatherHistory = {
      location_id: 'road-001',
      from: '2026-08-22T14:00:00Z',
      to: '2026-08-23T14:00:00Z',
      points: [point({ local_temperature_avg_c: 22.1, temperature_delta_avg_c: 4.3, local_pressure_avg_hpa: null })],
      data_status: 'fresh',
      last_databricks_success_at: '2026-08-23T14:05:00Z',
      source_data_at: '2026-08-23T14:00:00Z',
    }
    await renderSection(history)

    const pressureFigure = (await screen.findByText('Ciśnienie')).closest('figure')!
    expect(within(pressureFigure).getByText(/Brak danych lokalnych w tym okresie/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(pressureFigure).getByText('Dane w formie tabeli'))
    expect(within(pressureFigure).queryByText('Różnica')).not.toBeInTheDocument()
    expect(within(pressureFigure).queryByText('Lokalnie')).not.toBeInTheDocument()
  })

  it('renders a LOCAL-only light chart with no legend and no delta column', async () => {
    const history: DashboardWeatherHistory = {
      location_id: 'road-001',
      from: '2026-08-22T14:00:00Z',
      to: '2026-08-23T14:00:00Z',
      points: [point({ local_light_avg_lux: 18420 })],
      data_status: 'fresh',
      last_databricks_success_at: '2026-08-23T14:05:00Z',
      source_data_at: '2026-08-23T14:00:00Z',
    }
    await renderSection(history)

    const lightFigure = (await screen.findByText('Światło (lokalnie)')).closest('figure')!
    const user = userEvent.setup()
    await user.click(within(lightFigure).getByText('Dane w formie tabeli'))
    expect(within(lightFigure).queryByText('Różnica')).not.toBeInTheDocument()
    expect(within(lightFigure).queryByText('Lokalnie')).not.toBeInTheDocument()
  })
})
