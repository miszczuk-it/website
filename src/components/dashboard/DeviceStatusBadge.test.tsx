import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeviceStatusBadge } from './DeviceStatusBadge'
import type { DashboardDeviceStatus } from '../../lib/dashboardTypes'

describe('DeviceStatusBadge', () => {
  it('renders an ONLINE pill with the absolute last-telemetry timestamp, no relative age', () => {
    const status: DashboardDeviceStatus = { device_id: 'road-001', online: true, last_telemetry_received_at: '2026-08-23T22:05:00Z' }
    render(<DeviceStatusBadge status={status} error={false} />)

    expect(screen.getByText('ESP ONLINE')).toBeInTheDocument()
    expect(screen.getByText(/Ostatni odczyt telemetry:/)).toBeInTheDocument()
    expect(screen.queryByText(/temu/)).not.toBeInTheDocument()
  })

  it('renders an OFFLINE pill when the device is not online', () => {
    const status: DashboardDeviceStatus = { device_id: 'road-001', online: false, last_telemetry_received_at: '2026-08-23T21:40:00Z' }
    render(<DeviceStatusBadge status={status} error={false} />)

    expect(screen.getByText('ESP OFFLINE')).toBeInTheDocument()
  })

  it('shows a fallback message when there is no telemetry timestamp at all', () => {
    const status: DashboardDeviceStatus = { device_id: 'road-001', online: false, last_telemetry_received_at: null }
    render(<DeviceStatusBadge status={status} error={false} />)

    expect(screen.getByText('Brak danych o urządzeniu')).toBeInTheDocument()
  })

  it('shows an unknown state without ONLINE/OFFLINE when the status fetch failed', () => {
    render(<DeviceStatusBadge status={null} error={true} />)

    expect(screen.getByText('Status ESP nieznany')).toBeInTheDocument()
    expect(screen.queryByText(/ONLINE|OFFLINE/)).not.toBeInTheDocument()
  })

  it('never renders a device key, hash, or internal identifier', () => {
    const status: DashboardDeviceStatus = { device_id: 'road-001', online: true, last_telemetry_received_at: '2026-08-23T22:05:00Z' }
    const { container } = render(<DeviceStatusBadge status={status} error={false} />)

    expect(container.textContent).not.toMatch(/key|hash|secret/i)
  })
})
