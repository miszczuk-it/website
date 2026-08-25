import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DeviceActivitySection } from './DeviceActivitySection'
import * as dashboardApi from '../../lib/dashboardApi'
import type { DashboardDeviceActivityHourly } from '../../lib/dashboardTypes'

vi.mock('../../lib/dashboardApi')

function buildActivity(counts: number[]): DashboardDeviceActivityHourly {
  const base = new Date('2026-08-24T15:00:00Z').getTime()
  return {
    device_id: 'road-001',
    from: new Date(base - (counts.length - 1) * 3_600_000).toISOString(),
    to: new Date(base + 3_600_000).toISOString(),
    points: counts.map((upload_count, index) => ({
      hour_start: new Date(base - (counts.length - 1 - index) * 3_600_000).toISOString(),
      upload_count,
    })),
  }
}

const onRefreshComplete = vi.fn()

describe('DeviceActivitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a bar chart with 24 hourly buckets, including zero-filled hours', async () => {
    const counts = Array.from({ length: 24 }, (_, i) => (i === 5 ? 0 : 12))
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(counts))

    render(<DeviceActivitySection refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 24))
    const chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(chart).toBeInTheDocument()
    expect(chart.querySelectorAll('rect')).toHaveLength(24)
    await waitFor(() => expect(onRefreshComplete).toHaveBeenCalledWith('activity', 0, true))
  })

  it('shows a "no data" message, not a synthetic chart, when every bucket is zero', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(24).fill(0)))

    render(<DeviceActivitySection refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByText('Brak transmisji ESP w wybranym okresie.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Transmisje na godzinę/ })).not.toBeInTheDocument()
  })

  it('shows an unavailable message when the API call fails with no prior data', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockRejectedValue(new Error('network error'))

    render(<DeviceActivitySection refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Statystyka transmisji jest chwilowo niedostępna.')
    await waitFor(() => expect(onRefreshComplete).toHaveBeenCalledWith('activity', 0, false))
  })

  it('marks the last bucket as the current (partial) hour in the accessible table', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(24).fill(4)))

    render(<DeviceActivitySection refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(screen.getAllByText(/\(bieżąca\)/).length).toBeGreaterThan(0)
  })

  it('exposes every hourly value in the accessible table, not only visually in the SVG', async () => {
    const counts = Array.from({ length: 24 }, (_, i) => i)
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(counts))

    render(<DeviceActivitySection refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(24)
  })
})
