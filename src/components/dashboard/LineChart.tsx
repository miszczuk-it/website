interface LineChartPoint {
  x: Date
  y: number
}

interface LineChartProps {
  title: string
  unit: string
  points: LineChartPoint[]
  color?: string
  formatValue?: (value: number) => string
}

const CHART_WIDTH = 560
const CHART_HEIGHT = 160
const PADDING_X = 8
const PADDING_Y = 16

export function LineChart({ title, unit, points, color = '#38bdf8', formatValue }: LineChartProps) {
  const format = formatValue ?? ((value: number) => value.toFixed(1))

  if (points.length === 0) {
    return (
      <figure className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <figcaption className="text-sm font-semibold text-slate-200">{title}</figcaption>
        <p className="mt-4 text-sm text-slate-400">Brak danych w wybranym okresie.</p>
      </figure>
    )
  }

  const values = points.map((point) => point.y)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const spanY = maxY - minY || 1

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? CHART_WIDTH / 2 : PADDING_X + (index / (points.length - 1)) * (CHART_WIDTH - PADDING_X * 2)
    const y = CHART_HEIGHT - PADDING_Y - ((point.y - minY) / spanY) * (CHART_HEIGHT - PADDING_Y * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last = points[points.length - 1]
  const summary = `${title}: od ${format(minY)}${unit} do ${format(maxY)}${unit} w wybranym okresie, ostatni odczyt ${format(last.y)}${unit}.`

  return (
    <figure className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <figcaption className="flex items-baseline justify-between text-sm font-semibold text-slate-200">
        <span>{title}</span>
        <span className="font-normal text-slate-400">
          {format(last.y)}
          {unit}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={summary}
        className="mt-3 w-full"
        style={{ color }}
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

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
                <th scope="col" className="pr-4 font-medium">
                  Godzina
                </th>
                <th scope="col" className="font-medium">
                  Wartość
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.x.toISOString()}>
                  <td className="py-0.5 pr-4">
                    {point.x.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-0.5">
                    {format(point.y)}
                    {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
