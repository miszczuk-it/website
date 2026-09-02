import { useEffect, useState } from 'react'
import { getDeviceStatus, getTrafficOverview } from '../../lib/dashboardApi'
import type { DashboardDeviceStatus, DashboardTrafficOverview, TrafficRange } from '../../lib/dashboardTypes'
import { formatDateTime, formatSpeed, formatSpeedValue } from '../../lib/format'
import { BarChart } from './BarChart'
import { LineChart } from './LineChart'

const radarDeviceId = 'esp32-radar-dev-001'
const ranges: { value: TrafficRange; label: string }[] = [{ value: '24h', label: 'Ruch 24 h' }, { value: '7d', label: 'Ruch 7 dni' }, { value: '30d', label: 'Ruch 30 dni' }]

export function TrafficSection() {
  const [range, setRange] = useState<TrafficRange>('24h')
  const [data, setData] = useState<DashboardTrafficOverview | null>(null)
  const [radar, setRadar] = useState<DashboardDeviceStatus | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getTrafficOverview(radarDeviceId, range), getDeviceStatus(radarDeviceId)])
      .then(([traffic, status]) => { if (!cancelled) { setData(traffic); setRadar(status); setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [range])

  return <section aria-labelledby="traffic-heading" className="mt-16 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="traffic-heading" className="text-2xl font-bold tracking-tight text-white">Ruch drogowy</h2><span className={radar?.online ? 'text-emerald-300' : 'text-rose-300'}>● ESP Radar {radar?.online ? 'ONLINE' : 'OFFLINE'}</span></div>
    <div className="mt-4 flex gap-2" aria-label="Zakres ruchu">{ranges.map(({ value, label }) => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className="rounded border border-slate-700 px-3 py-1">{label}</button>)}</div>
    {error && <p role="alert" className="mt-4 text-rose-300">Statystyka ruchu jest chwilowo niedostępna.</p>}
    {!data && !error && <p className="mt-4 text-slate-400">Ładowanie danych ruchu…</p>}
    {data && <><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Pojazdy', data.total_vehicles], ['INCOMING', data.incoming_vehicles], ['OUTGOING', data.outgoing_vehicles], ['AVG SPEED', formatSpeed(data.avg_speed_kmh)], ['MAX SPEED', formatSpeed(data.max_speed_kmh)]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-800/70 p-3"><p className="text-xs text-slate-400">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
      {data.buckets.length > 0 ? <div className="mt-6 grid gap-4 lg:grid-cols-2"><BarChart title="Pojazdy w czasie" points={data.buckets.map(b => ({ x: new Date(b.bucket_start), y: b.incoming_vehicles + b.outgoing_vehicles }))} /><LineChart title="Prędkość w czasie" unit=" km/h" formatValue={formatSpeedValue} points={data.buckets.map(b => ({ x: new Date(b.bucket_start), y: b.avg_speed_kmh }))} /></div> : <p className="mt-6 text-slate-400">Brak danych w wybranym zakresie.</p>}
      <h3 className="mt-6 font-semibold">Ostatnie przejazdy</h3>{data.recent_passes.length ? <ul className="mt-2 space-y-1 text-sm text-slate-300">{data.recent_passes.map(p => <li key={`${p.detected_at}-${p.direction}`}>{formatDateTime(p.detected_at)} — {p.direction} — {formatSpeedValue(p.speed_avg_kmh)}/{formatSpeedValue(p.speed_max_kmh)} km/h</li>)}</ul> : <p className="mt-2 text-slate-400">Brak przejazdów w wybranym zakresie.</p>}</>}
  </section>
}
