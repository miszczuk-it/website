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

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 24))
    const chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(chart).toBeInTheDocument()
    expect(chart.querySelectorAll('rect')).toHaveLength(24)
    await waitFor(() => expect(onRefreshComplete).toHaveBeenCalledWith('activity', 0, true))
  })

  it('renders a bar chart with 168 hourly buckets for the 7-day range, all present in the accessible table', async () => {
    const counts = Array.from({ length: 168 }, (_, i) => (i % 7 === 0 ? 0 : 12))
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(counts))

    render(<DeviceActivitySection hours={168} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 168))
    const chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(chart.querySelectorAll('rect')).toHaveLength(168)
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(168)
  })

  it('re-fetches with the new range and does not keep showing the previous range as if it were the new one', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockImplementation((_deviceId, hours = 24) =>
      Promise.resolve(buildActivity(Array(hours).fill(12))),
    )

    const { rerender } = render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)
    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 24))
    let chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(chart.querySelectorAll('rect')).toHaveLength(24)

    rerender(<DeviceActivitySection hours={168} refreshKey={0} onRefreshComplete={onRefreshComplete} />)
    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 168))
    await waitFor(async () => {
      chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
      expect(chart.querySelectorAll('rect')).toHaveLength(168)
    })

    rerender(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)
    await waitFor(() => expect(dashboardApi.getDeviceActivityHourly).toHaveBeenCalledWith(undefined, 24))
    await waitFor(async () => {
      chart = await screen.findByRole('img', { name: /Transmisje na godzinę/ })
      expect(chart.querySelectorAll('rect')).toHaveLength(24)
    })
  })

  it('shows the 24h range in the description and not "7 dni" when hours=24', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(24).fill(4)))

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByText(/ostatnie 24 h/)).toBeInTheDocument()
    expect(screen.queryByText(/ostatnie 7 dni/)).not.toBeInTheDocument()
  })

  it('shows the 7-day range in the description and not "24 h" when hours=168', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(168).fill(4)))

    render(<DeviceActivitySection hours={168} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByText(/ostatnie 7 dni/)).toBeInTheDocument()
    expect(screen.queryByText(/ostatnie 24 h/)).not.toBeInTheDocument()
  })

  it('shows a "no data" message, not a synthetic chart, when every bucket is zero', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(24).fill(0)))

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByText('Brak transmisji ESP w wybranym okresie.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Transmisje na godzinę/ })).not.toBeInTheDocument()
  })

  it('shows an unavailable message when the API call fails with no prior data', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockRejectedValue(new Error('network error'))

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Statystyka transmisji jest chwilowo niedostępna.')
    await waitFor(() => expect(onRefreshComplete).toHaveBeenCalledWith('activity', 0, false))
  })

  it('marks the last bucket as the current (partial) hour in the accessible table', async () => {
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(Array(24).fill(4)))

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    expect(screen.getAllByText(/\(bieżąca\)/).length).toBeGreaterThan(0)
  })

  it('exposes every hourly value in the accessible table, not only visually in the SVG', async () => {
    const counts = Array.from({ length: 24 }, (_, i) => i)
    vi.mocked(dashboardApi.getDeviceActivityHourly).mockResolvedValue(buildActivity(counts))

    render(<DeviceActivitySection hours={24} refreshKey={0} onRefreshComplete={onRefreshComplete} />)

    await screen.findByRole('img', { name: /Transmisje na godzinę/ })
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(24)
  })
})
