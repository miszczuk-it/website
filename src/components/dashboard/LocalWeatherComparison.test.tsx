import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LocalWeatherComparison } from './LocalWeatherComparison'
import type { DashboardLocalComparison, DashboardWeatherSnapshot } from '../../lib/dashboardTypes'

const weather: DashboardWeatherSnapshot = {
  temperature_c: 16.2,
  humidity_pct: 70,
  pressure_hpa: 1015,
  precipitation_mm: 0,
  wind_kph: 5,
  visibility_km: 10,
  condition_text: 'Clear',
}

const emptyComparison: DashboardLocalComparison = {
  local_temperature_c: null,
  api_temperature_c: null,
  temperature_delta_c: null,
  local_humidity_percent: null,
  api_humidity_percent: null,
  humidity_delta_pp: null,
  local_pressure_hpa: null,
  api_pressure_hpa: null,
  light_lux: null,
  cloud_percent: null,
  local_observed_at: null,
}

const freshComparison: DashboardLocalComparison = {
  local_temperature_c: 22.2,
  api_temperature_c: 16.2,
  temperature_delta_c: 6.0,
  local_humidity_percent: 60,
  api_humidity_percent: 70,
  humidity_delta_pp: -10,
  local_pressure_hpa: 1013,
  api_pressure_hpa: 1015,
  light_lux: 18500,
  cloud_percent: 35,
  local_observed_at: '2026-08-23T11:50:00Z',
}

function renderInTable(comparison: DashboardLocalComparison) {
  render(<LocalWeatherComparison comparison={comparison} weather={weather} />)
  return within(screen.getByRole('table'))
}

describe('LocalWeatherComparison', () => {
  it('renders LOCAL, WeatherAPI, and DELTA from a fresh comparison', () => {
    const table = renderInTable(freshComparison)

    expect(table.getByText('22.2 °C')).toBeInTheDocument()
    expect(table.getByText('16.2 °C')).toBeInTheDocument()
    expect(table.getByText('+6.0°C')).toBeInTheDocument()
    expect(table.getByText('60 %')).toBeInTheDocument()
    expect(table.getByText('70 %')).toBeInTheDocument()
    expect(table.getByText('-10 pp')).toBeInTheDocument()
    expect(table.getByText('1013 hPa')).toBeInTheDocument()
    expect(table.getByText('1015 hPa')).toBeInTheDocument()
    expect(table.getByText(/18.?500 lux/)).toBeInTheDocument()
    expect(table.getByText('Zachmurzenie 35%')).toBeInTheDocument()
  })

  it('falls back to the WeatherAPI snapshot and shows — for LOCAL/DELTA when there is no fresh comparison (pre-M5.6 road-001 case)', () => {
    const table = renderInTable(emptyComparison)

    expect(table.getByText('16.2 °C')).toBeInTheDocument() // WeatherAPI, from the `weather` prop
    expect(table.getByText('70 %')).toBeInTheDocument()
    expect(table.getByText('1015 hPa')).toBeInTheDocument()
    expect(table.getAllByText('—').length).toBeGreaterThan(0)
    // No fallback exists for light/cloud outside the (empty) comparison object.
    const lightRow = table.getByText('Światło').closest('tr')!
    expect(within(lightRow).getAllByText('—')).toHaveLength(3)
  })

  it('shows — for DELTA only when the comparison is fresh but the paired API reading is missing', () => {
    const comparison: DashboardLocalComparison = {
      ...freshComparison,
      api_temperature_c: null,
      temperature_delta_c: null,
    }
    const table = renderInTable(comparison)

    const tempRow = table.getByText('Temperatura').closest('tr')!
    expect(within(tempRow).getByText('22.2 °C')).toBeInTheDocument() // LOCAL still present
    expect(within(tempRow).getAllByText('—')).toHaveLength(2) // WeatherAPI and DELTA, not weather.temperature_c
  })

  it('renders — for pressure LOCAL and DELTA when local_pressure_hpa is null, even with a fresh comparison', () => {
    const comparison: DashboardLocalComparison = { ...freshComparison, local_pressure_hpa: null }
    const table = renderInTable(comparison)

    const pressureRow = table.getByText('Ciśnienie').closest('tr')!
    expect(within(pressureRow).getAllByText('—')).toHaveLength(2)
    expect(within(pressureRow).getByText('1015 hPa')).toBeInTheDocument() // WeatherAPI pressure still shown
  })

  it('never renders NaN, null, or undefined literally', () => {
    const { container: emptyContainer } = render(<LocalWeatherComparison comparison={emptyComparison} weather={weather} />)
    expect(emptyContainer.textContent).not.toMatch(/NaN|null|undefined/)

    const { container: freshContainer } = render(<LocalWeatherComparison comparison={freshComparison} weather={weather} />)
    expect(freshContainer.textContent).not.toMatch(/NaN|null|undefined/)
  })
})
