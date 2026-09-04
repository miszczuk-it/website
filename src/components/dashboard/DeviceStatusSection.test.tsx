import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { DeviceStatusSection } from './DeviceStatusSection'
import * as api from '../../lib/dashboardApi'
import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'

vi.mock('../../lib/dashboardApi')

const weatherOnline: DashboardDeviceStatus = { device_id: 'road-001', online: true, last_telemetry_received_at: '2026-01-01T01:00:00Z', last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -58 }
const radarOnline: DashboardDeviceStatus = { device_id: 'esp32-radar-dev-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -67 }

describe('DeviceStatusSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getDeviceStatus).mockImplementation((deviceId) =>
      Promise.resolve(deviceId === 'esp32-radar-dev-001' ? radarOnline : weatherOnline),
    )
  })

  it('renders two labeled tiles, one per device, fetched by their own device_id', async () => {
    render(<DeviceStatusSection />)

    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledWith('road-001'))
    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledWith('esp32-radar-dev-001'))
    expect(await screen.findByText('Stacja pogodowa')).toBeInTheDocument()
    expect(screen.getByText('Radar')).toBeInTheDocument()
  })

  it('shows Wi-Fi RSSI in dBm for each device independently', async () => {
    render(<DeviceStatusSection />)

    const weatherTile = (await screen.findByText('Stacja pogodowa')).closest('div') as HTMLElement
    const radarTile = screen.getByText('Radar').closest('div') as HTMLElement

    await waitFor(() => expect(within(weatherTile).getByText('Wi-Fi: -58 dBm')).toBeInTheDocument())
    expect(within(radarTile).getByText('Wi-Fi: -67 dBm')).toBeInTheDocument()
  })

  it('shows a dash for Wi-Fi when online but wifi_rssi is null', async () => {
    vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'esp32-radar-dev-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: null })
    render(<DeviceStatusSection />)

    expect(await screen.findAllByText('Wi-Fi: —')).not.toHaveLength(0)
  })

  it('never presents a stale Wi-Fi value as current for an OFFLINE device', async () => {
    vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'esp32-radar-dev-001', online: false, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -67 })
    render(<DeviceStatusSection />)

    await screen.findAllByText('ESP OFFLINE')
    expect(screen.queryByText(/Wi-Fi/)).not.toBeInTheDocument()
  })

  it('does not crash when the backend response omits wifi_rssi entirely (legacy backend)', async () => {
    vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'road-001', online: true, last_telemetry_received_at: '2026-01-01T01:00:00Z', last_seen_at: '2026-01-01T01:00:00Z' })
    render(<DeviceStatusSection />)

    expect(await screen.findAllByText('Wi-Fi: —')).not.toHaveLength(0)
  })

  it('shows the radar as ONLINE from its heartbeat contact even though last_telemetry_received_at is null', async () => {
    render(<DeviceStatusSection />)

    const radarTile = (await screen.findByText('Radar')).closest('div') as HTMLElement
    await waitFor(() => expect(within(radarTile).getByText('ESP ONLINE')).toBeInTheDocument())
    expect(within(radarTile).getByText(/Ostatni kontakt:/)).toBeInTheDocument()
  })

  it('shows an unknown status tile when a device fetch fails, without affecting the other device', async () => {
    vi.mocked(api.getDeviceStatus).mockImplementation((deviceId) =>
      deviceId === 'esp32-radar-dev-001' ? Promise.reject(new Error('network error')) : Promise.resolve(weatherOnline),
    )
    render(<DeviceStatusSection />)

    expect(await screen.findByText('Status ESP nieznany')).toBeInTheDocument()
    const weatherTile = screen.getByText('Stacja pogodowa').closest('div') as HTMLElement
    await waitFor(() => expect(within(weatherTile).getByText('ESP ONLINE')).toBeInTheDocument())
  })
})
