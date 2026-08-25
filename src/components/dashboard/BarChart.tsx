interface BarChartPoint {
  x: Date
  y: number
}

interface BarChartProps {
  title: string
  unit?: string
  points: BarChartPoint[]
  color?: string
  currentColor?: string
  formatValue?: (value: number) => string
  currentIndex?: number
}

const CHART_WIDTH = 560
const CHART_HEIGHT = 160
const PADDING_X = 8
const PADDING_Y = 16
const BAR_GAP_RATIO = 0.3

function formatHour(date: Date): string {
  return date.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Own-SVG bar chart, matching LineChart.tsx's visual language and accessibility pattern (an
// aria-label summary plus a details/table fallback) instead of pulling in a charting library.
export function BarChart({ title, unit = '', points, color = '#38bdf8', currentColor = '#facc15', formatValue, currentIndex }: BarChartProps) {
  const format = formatValue ?? ((value: number) => String(value))
  const count = points.length
  const maxY = Math.max(1, ...points.map((point) => point.y))
  const plotWidth = CHART_WIDTH - PADDING_X * 2
  const slotWidth = count > 0 ? plotWidth / count : plotWidth
  const barWidth = Math.max(1, slotWidth * (1 - BAR_GAP_RATIO))
  const last = points[points.length - 1]

  const summary = `${title}: ${points
    .map((point, index) => `${formatHour(point.x)}${index === currentIndex ? ' (bieżąca)' : ''}: ${format(point.y)}${unit}`)
    .join(', ')}.`

  return (
    <figure className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <figcaption className="flex items-baseline justify-between text-sm font-semibold text-slate-200">
        <span>{title}</span>
        {last && (
          <span className="font-normal text-slate-400">
            ostatnia godzina: {format(last.y)}
            {unit}
          </span>
        )}
      </figcaption>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={summary} className="mt-3 w-full">
        <line x1={PADDING_X} y1={CHART_HEIGHT - PADDING_Y} x2={CHART_WIDTH - PADDING_X} y2={CHART_HEIGHT - PADDING_Y} stroke="#1e293b" strokeWidth={1} />
        {points.map((point, index) => {
          const plotHeight = CHART_HEIGHT - PADDING_Y * 2
          const barHeight = maxY > 0 ? (point.y / maxY) * plotHeight : 0
          const x = PADDING_X + index * slotWidth + (slotWidth - barWidth) / 2
          const y = CHART_HEIGHT - PADDING_Y - barHeight
          return (
            <rect
              key={point.x.toISOString()}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={barHeight.toFixed(1)}
              fill={index === currentIndex ? currentColor : color}
              rx={1}
            />
          )
        })}
      </svg>

      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{points[0] && formatHour(points[0].x)}</span>
        <span>
          maks {format(maxY)}
          {unit}
        </span>
        <span>{last && formatHour(last.x)}</span>
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
                <th scope="col" className="py-0.5 font-medium">
                  {title}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={point.x.toISOString()}>
                  <td className="py-0.5 pr-4">
                    {formatHour(point.x)}
                    {index === currentIndex && ' (bieżąca)'}
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
