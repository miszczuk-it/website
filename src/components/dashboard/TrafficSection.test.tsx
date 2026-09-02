import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrafficSection } from './TrafficSection'
import * as api from '../../lib/dashboardApi'
import type { DashboardTrafficOverview } from '../../lib/dashboardTypes'

vi.mock('../../lib/dashboardApi')

const overview: DashboardTrafficOverview = { device_id: 'esp32-radar-dev-001', range: '24h', from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', total_vehicles: 2, incoming_vehicles: 1, outgoing_vehicles: 1, avg_speed_kmh: 30, max_speed_kmh: 40, buckets: [{ bucket_start: '2026-01-01T01:00:00Z', incoming_vehicles: 1, outgoing_vehicles: 1, avg_speed_kmh: 30, max_speed_kmh: 40 }], recent_passes: [{ detected_at: '2026-01-01T01:00:00Z', direction: 'INCOMING', speed_avg_kmh: 30, speed_max_kmh: 40, event_duration_ms: 1 }] }

describe('TrafficSection', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getDeviceStatus).mockResolvedValue({ device_id: 'esp32-radar-dev-001', online: true, last_telemetry_received_at: null, last_seen_at: '2026-01-01T01:00:00Z' }); vi.mocked(api.getTrafficOverview).mockImplementation((_id, range) => Promise.resolve({ ...overview, range })) })
  it('shows radar ONLINE from heartbeat status even with no traffic events', async () => { vi.mocked(api.getTrafficOverview).mockResolvedValue({ ...overview, total_vehicles: 0, incoming_vehicles: 0, outgoing_vehicles: 0, buckets: [], recent_passes: [] }); render(<TrafficSection />); expect(await screen.findByText(/ESP Radar ONLINE/)).toBeInTheDocument(); expect(screen.getByText('Brak przejazdów w wybranym zakresie.')).toBeInTheDocument() })
  it('renders KPIs, charts and recent passes', async () => { render(<TrafficSection />); expect(await screen.findByText('Pojazdy')).toBeInTheDocument(); expect(screen.getByRole('img', { name: /Pojazdy w czasie/ })).toBeInTheDocument(); expect(screen.getAllByText(/INCOMING/)).not.toHaveLength(0) })
  it('formats AVG SPEED and MAX SPEED KPIs via the shared speed helper (one decimal, unit)', async () => { render(<TrafficSection />); await screen.findByText('Pojazdy'); expect(screen.getByText('AVG SPEED').parentElement).toHaveTextContent('30.0 km/h'); expect(screen.getByText('MAX SPEED').parentElement).toHaveTextContent('40.0 km/h') })
  it('renders "—" for null avg/max speed instead of "0.0 km/h"', async () => { vi.mocked(api.getTrafficOverview).mockResolvedValue({ ...overview, avg_speed_kmh: null, max_speed_kmh: null }); render(<TrafficSection />); await screen.findByText('Pojazdy'); expect(screen.getByText('AVG SPEED').parentElement).toHaveTextContent('—'); expect(screen.getByText('MAX SPEED').parentElement).toHaveTextContent('—'); expect(screen.queryByText('0.0 km/h')).not.toBeInTheDocument() })
  it('renders recent-pass detected_at converted to Europe/Warsaw local time, not the raw UTC string', async () => { render(<TrafficSection />); expect(await screen.findByText(/01\.01\.2026, 02:00/)).toBeInTheDocument(); expect(screen.queryByText(/2026-01-01T01:00:00Z/)).not.toBeInTheDocument() })
  it('renders recent-pass speeds via the shared speed helper', async () => { render(<TrafficSection />); expect(await screen.findByText(/30\.0\/40\.0 km\/h/)).toBeInTheDocument() })
  it('formats the speed chart tooltip/summary via the shared speed helper', async () => { render(<TrafficSection />); const chart = await screen.findByRole('img', { name: /Prędkość w czasie/ }); expect(chart.getAttribute('aria-label')).toMatch(/30\.0 km\/h/) })
  it('formats chart bucket timestamps in Europe/Warsaw local time, not raw UTC', async () => { render(<TrafficSection />); const chart = await screen.findByRole('img', { name: /Pojazdy w czasie/ }); expect(chart.getAttribute('aria-label')).toMatch(/01\.01, 02:00/) })
  it.each([['Ruch 7 dni', '7d'], ['Ruch 30 dni', '30d'], ['Ruch 24 h', '24h']] as const)('all traffic widgets refetch with %s', async (label, range) => { const user = userEvent.setup(); render(<TrafficSection />); await screen.findByText('Pojazdy'); await user.click(screen.getByRole('button', { name: label })); await waitFor(() => expect(api.getTrafficOverview).toHaveBeenLastCalledWith('esp32-radar-dev-001', range)) })
})
