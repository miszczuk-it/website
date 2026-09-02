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
  it.each([['Ruch 7 dni', '7d'], ['Ruch 30 dni', '30d'], ['Ruch 24 h', '24h']] as const)('all traffic widgets refetch with %s', async (label, range) => { const user = userEvent.setup(); render(<TrafficSection />); await screen.findByText('Pojazdy'); await user.click(screen.getByRole('button', { name: label })); await waitFor(() => expect(api.getTrafficOverview).toHaveBeenLastCalledWith('esp32-radar-dev-001', range)) })
})
