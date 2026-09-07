import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { DeviceStatusSection } from './DeviceStatusSection'
import * as api from '../../lib/dashboardApi'
import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'

vi.mock('../../lib/dashboardApi')

const weatherOnline: DashboardDeviceStatus = { device_id: 'road-001', online: true, last_telemetry_received_at: '2026-01-01T01:00:00Z', last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -58 }
const radarOnline: DashboardDeviceStatus = { device_id: 'road-radar-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -67 }
const cameraOffline: DashboardDeviceStatus = { device_id: 'road-cam-001', online: false, last_telemetry_received_at: null, last_seen_at: '2026-01-01T00:00:00Z', wifi_rssi: null }

function mockStatusByDevice() {
  vi.mocked(api.getDeviceStatus).mockImplementation((deviceId) => {
    if (deviceId === 'road-radar-001') return Promise.resolve(radarOnline)
    if (deviceId === 'road-cam-001') return Promise.resolve(cameraOffline)
    return Promise.resolve(weatherOnline)
  })
}

describe('DeviceStatusSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStatusByDevice()
  })

  it('renders three labeled tiles, one per PROD device, fetched by their own device_id', async () => {
    render(<DeviceStatusSection />)

    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledWith('road-001'))
    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledWith('road-radar-001'))
    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledWith('road-cam-001'))
    expect(await screen.findByText('Stacja pogodowa')).toBeInTheDocument()
    expect(screen.getByText('Radar drogowy')).toBeInTheDocument()
    expect(screen.getByText('ESP32-CAM')).toBeInTheDocument()
  })

  it('never queries a DEV device_id', async () => {
    render(<DeviceStatusSection />)

    await waitFor(() => expect(api.getDeviceStatus).toHaveBeenCalledTimes(3))
    const calledIds = vi.mocked(api.getDeviceStatus).mock.calls.map(([id]) => id)
    expect(calledIds).not.toEqual(expect.arrayContaining(['esp32-dev-001', 'esp32-radar-dev-001', 'esp32-cam-dev-001']))
  })

  it('shows Wi-Fi RSSI in dBm for each device independently', async () => {
    render(<DeviceStatusSection />)

    const weatherTile = (await screen.findByText('Stacja pogodowa')).closest('div') as HTMLElement
    const radarTile = screen.getByText('Radar drogowy').closest('div') as HTMLElement

    await waitFor(() => expect(within(weatherTile).getByText('Wi-Fi: -58 dBm')).toBeInTheDocument())
    expect(within(radarTile).getByText('Wi-Fi: -67 dBm')).toBeInTheDocument()
  })

  it('shows a dash for Wi-Fi when online but wifi_rssi is null', async () => {
    vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'road-radar-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: null })
    render(<DeviceStatusSection />)

    expect(await screen.findAllByText('Wi-Fi: —')).not.toHaveLength(0)
  })

  it('never presents a stale Wi-Fi value as current for an OFFLINE device', async () => {
    vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'road-radar-001', online: false, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -67 })
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

    const radarTile = (await screen.findByText('Radar drogowy')).closest('div') as HTMLElement
    await waitFor(() => expect(within(radarTile).getByText('ESP ONLINE')).toBeInTheDocument())
    expect(within(radarTile).getByText(/Ostatni kontakt:/)).toBeInTheDocument()
  })

  it('shows the camera as OFFLINE while no physical hardware has sent a fresh heartbeat, without hardcoding it', async () => {
    render(<DeviceStatusSection />)

    const cameraTile = (await screen.findByText('ESP32-CAM')).closest('div') as HTMLElement
    await waitFor(() => expect(within(cameraTile).getByText('ESP OFFLINE')).toBeInTheDocument())
    // A provisioning-time heartbeat can leave last_seen_at populated even with no live camera --
    // online/offline must come from the backend's `online` field, never from lastSeenAt != null.
    expect(within(cameraTile).getByText(/Ostatni kontakt:/)).toBeInTheDocument()
  })

  it('would show the camera as ONLINE automatically once the backend reports a fresh heartbeat', async () => {
    vi.mocked(api.getDeviceStatus).mockImplementation((deviceId) => {
      if (deviceId === 'road-cam-001') return Promise.resolve({ device_id: 'road-cam-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z', wifi_rssi: -70 })
      if (deviceId === 'road-radar-001') return Promise.resolve(radarOnline)
      return Promise.resolve(weatherOnline)
    })
    render(<DeviceStatusSection />)

    const cameraTile = (await screen.findByText('ESP32-CAM')).closest('div') as HTMLElement
    await waitFor(() => expect(within(cameraTile).getByText('ESP ONLINE')).toBeInTheDocument())
  })

  it('shows an unknown status tile when one device fetch fails, without affecting the others', async () => {
    vi.mocked(api.getDeviceStatus).mockImplementation((deviceId) => {
      if (deviceId === 'road-radar-001') return Promise.reject(new Error('network error'))
      if (deviceId === 'road-cam-001') return Promise.resolve(cameraOffline)
      return Promise.resolve(weatherOnline)
    })
    render(<DeviceStatusSection />)

    expect(await screen.findByText('Status ESP nieznany')).toBeInTheDocument()
    const weatherTile = screen.getByText('Stacja pogodowa').closest('div') as HTMLElement
    await waitFor(() => expect(within(weatherTile).getByText('ESP ONLINE')).toBeInTheDocument())
    const cameraTile = screen.getByText('ESP32-CAM').closest('div') as HTMLElement
    await waitFor(() => expect(within(cameraTile).getByText('ESP OFFLINE')).toBeInTheDocument())
  })
})
