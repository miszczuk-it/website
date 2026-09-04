import { formatHour } from '../../lib/format'

interface LineChartPoint {
  x: Date
  y: number | null
}

interface LineChartSeries {
  label: string
  points: LineChartPoint[]
  color: string
}

interface LineChartProps {
  title: string
  unit: string
  points: LineChartPoint[]
  color?: string
  formatValue?: (value: number) => string
  primaryLabel?: string
  secondary?: { label: string; points: LineChartPoint[]; color?: string }
  deltaPoints?: LineChartPoint[]
  deltaLabel?: string
  deltaUnit?: string
}

const CHART_WIDTH = 560
const CHART_HEIGHT = 160
const PADDING_X = 8
const PADDING_Y = 16

function buildPolyline(points: LineChartPoint[], totalCount: number, minY: number, spanY: number): string {
  return points
    .map((point, index) => {
      if (point.y === null) return null
      const x = totalCount === 1 ? CHART_WIDTH / 2 : PADDING_X + (index / (totalCount - 1)) * (CHART_WIDTH - PADDING_X * 2)
      const y = CHART_HEIGHT - PADDING_Y - ((point.y - minY) / spanY) * (CHART_HEIGHT - PADDING_Y * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter((coord): coord is string => coord !== null)
    .join(' ')
}

export function LineChart({ title, unit, points, color = '#38bdf8', formatValue, primaryLabel, secondary, deltaPoints, deltaLabel = 'Różnica', deltaUnit }: LineChartProps) {
  const format = formatValue ?? ((value: number) => value.toFixed(1))

  const secondaryColor = secondary?.color ?? '#34d399'
  const hasPrimaryData = points.some((point) => point.y !== null)
  const hasSecondaryData = secondary !== undefined && secondary.points.some((point) => point.y !== null)
  const series: LineChartSeries[] = [{ label: primaryLabel ?? title, points, color }]
  if (hasSecondaryData && secondary) series.push({ label: secondary.label, points: secondary.points, color: secondaryColor })

  const allValues = series.flatMap((s) => s.points.map((point) => point.y)).filter((y): y is number => y !== null)

  if (points.length === 0 || allValues.length === 0) {
    return (
      <figure className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <figcaption className="text-sm font-semibold text-slate-200">{title}</figcaption>
        <p className="mt-4 text-sm text-slate-400">Brak danych w wybranym okresie.</p>
      </figure>
    )
  }

  const minY = Math.min(...allValues)
  const maxY = Math.max(...allValues)
  const spanY = maxY - minY || 1

  const last = points[points.length - 1]
  const lastSecondary = hasSecondaryData ? [...(secondary?.points ?? [])].reverse().find((point) => point.y !== null) : undefined
  const summaryParts = [`${title}: od ${format(minY)}${unit} do ${format(maxY)}${unit} w wybranym okresie`]
  if (last.y !== null) summaryParts.push(`ostatni odczyt ${primaryLabel ?? 'WeatherAPI'} ${format(last.y)}${unit}`)
  if (lastSecondary?.y != null) summaryParts.push(`ostatni odczyt ${secondary?.label} ${format(lastSecondary.y)}${unit}`)
  const summary = `${summaryParts.join(', ')}.`

  return (
    <figure className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <figcaption className="flex items-baseline justify-between text-sm font-semibold text-slate-200">
        <span>{title}</span>
        {last.y !== null && (
          <span className="font-normal" style={{ color }}>
            {format(last.y)}
            {unit}
          </span>
        )}
      </figcaption>

      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={summary} className="mt-3 w-full">
        {series.map((s) => (
          <polyline
            key={s.label}
            points={buildPolyline(s.points, points.length, minY, spanY)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {!hasPrimaryData && (
        <p className="mt-2 text-xs text-slate-500">{primaryLabel ?? title} — brak danych w tym okresie.</p>
      )}
      {secondary && !hasSecondaryData && (
        <p className="mt-2 text-xs text-slate-500">{secondary.label} — brak danych w tym okresie.</p>
      )}

      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>
          min {format(minY)}
          {unit}
        </span>
        <span>
          maks {format(maxY)}
          {unit}
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Dane w formie tabeli</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-400">
            <thead>
              <tr>
                <th scope="col" className="py-0.5 pr-4 font-medium">
                  Godzina
                </th>
                <th scope="col" className="py-0.5 pr-4 font-medium">
                  {primaryLabel ?? 'Wartość'}
                </th>
                {hasSecondaryData && (
                  <th scope="col" className="py-0.5 pr-4 font-medium">
                    {secondary?.label}
                  </th>
                )}
                {deltaPoints && (
                  <th scope="col" className="py-0.5 font-medium">
                    {deltaLabel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={point.x.toISOString()}>
                  <td className="py-0.5 pr-4">
                    {formatHour(point.x)}
                  </td>
                  <td className="py-0.5 pr-4">
                    {point.y === null ? '—' : `${format(point.y)}${unit}`}
                  </td>
                  {hasSecondaryData && (
                    <td className="py-0.5 pr-4">
                      {secondary && secondary.points[index]?.y != null ? `${format(secondary.points[index].y as number)}${unit}` : '—'}
                    </td>
                  )}
                  {deltaPoints && (
                    <td className="py-0.5">
                      {deltaPoints[index]?.y != null ? `${(deltaPoints[index].y as number) > 0 ? '+' : ''}${format(deltaPoints[index].y as number)}${deltaUnit ?? unit}` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
