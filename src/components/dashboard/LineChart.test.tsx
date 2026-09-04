import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LineChart } from './LineChart'

const points = [
  { x: new Date('2026-08-23T10:00:00Z'), y: 10 },
  { x: new Date('2026-08-23T11:00:00Z'), y: 12.4 },
]

function currentValueEl(title: string) {
  const figcaption = screen.getByText(title).closest('figcaption') as HTMLElement
  return within(figcaption).getByText(/12\.4/)
}

describe('LineChart current value color', () => {
  it('renders the current value in the primary series color (orange)', () => {
    render(<LineChart title="Temperatura" unit=" °C" points={points} color="#f97316" />)

    expect(currentValueEl('Temperatura')).toHaveStyle({ color: '#f97316' })
  })

  it('renders the current value in a different primary series color (sky blue), not a hardcoded class', () => {
    render(<LineChart title="Ciśnienie" unit=" hPa" points={points} color="#38bdf8" />)

    const currentValue = currentValueEl('Ciśnienie')
    expect(currentValue).toHaveStyle({ color: '#38bdf8' })
    expect(currentValue.className).not.toMatch(/text-slate-400/)
  })

  it('uses the default color when no color prop is passed', () => {
    render(<LineChart title="Domyślny" unit=" j." points={points} />)

    expect(currentValueEl('Domyślny')).toHaveStyle({ color: '#38bdf8' })
  })
})
