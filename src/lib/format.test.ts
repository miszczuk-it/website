import { describe, expect, it } from 'vitest'
import { formatDateTime, formatHour, formatSpeed, formatSpeedValue } from './format'

describe('formatDateTime', () => {
  it('converts a summer (CEST, UTC+2) UTC timestamp to Europe/Warsaw local time', () => {
    expect(formatDateTime('2026-09-02T20:00:00Z')).toBe('02.09.2026, 22:00')
  })

  it('converts a winter (CET, UTC+1) UTC timestamp to Europe/Warsaw local time', () => {
    expect(formatDateTime('2026-01-15T20:00:00Z')).toBe('15.01.2026, 21:00')
  })

  it('does not apply a fixed +2h shift year-round (would be wrong in winter)', () => {
    expect(formatDateTime('2026-01-15T20:00:00Z')).not.toBe('15.01.2026, 22:00')
  })

  it('does not double-convert a UTC instant that is already unambiguous', () => {
    // Same instant expressed with an explicit +00:00 offset must resolve identically to the "Z" form.
    expect(formatDateTime('2026-09-02T20:00:00+00:00')).toBe(formatDateTime('2026-09-02T20:00:00Z'))
  })

  it('formats environmental ESP last_seen_at (device-status endpoint shape)', () => {
    expect(formatDateTime('2026-09-02T20:00:00Z')).toBe('02.09.2026, 22:00')
  })

  it('formats radar ESP last_seen_at (device-status endpoint shape)', () => {
    expect(formatDateTime('2026-09-02T05:00:00Z')).toBe('02.09.2026, 07:00')
  })

  it('formats a recent traffic event detected_at timestamp', () => {
    expect(formatDateTime('2026-09-02T18:30:00Z')).toBe('02.09.2026, 20:30')
  })
})

describe('formatHour', () => {
  it('formats a chart bucket/tooltip Date in Europe/Warsaw during CEST', () => {
    expect(formatHour(new Date('2026-09-02T20:00:00Z'))).toBe('02.09, 22:00')
  })

  it('formats a chart bucket/tooltip Date in Europe/Warsaw during CET', () => {
    expect(formatHour(new Date('2026-01-15T20:00:00Z'))).toBe('15.01, 21:00')
  })
})

describe('formatSpeedValue', () => {
  it('rounds a long decimal to one decimal place', () => {
    expect(formatSpeedValue(6.846666666666667)).toBe('6.8')
  })

  it('pads a whole number to one decimal', () => {
    expect(formatSpeedValue(12)).toBe('12.0')
  })

  it('rounds a two-decimal value', () => {
    expect(formatSpeedValue(41.74)).toBe('41.7')
  })

  it('renders null as an em dash', () => {
    expect(formatSpeedValue(null)).toBe('—')
  })

  it('renders undefined as an em dash', () => {
    expect(formatSpeedValue(undefined)).toBe('—')
  })
})

describe('formatSpeed', () => {
  it('rounds a long decimal to one decimal place with unit', () => {
    expect(formatSpeed(6.846666666666667)).toBe('6.8 km/h')
  })

  it('pads a whole number to one decimal with unit', () => {
    expect(formatSpeed(12)).toBe('12.0 km/h')
  })

  it('rounds a two-decimal value with unit', () => {
    expect(formatSpeed(41.74)).toBe('41.7 km/h')
  })

  it('renders null as an em dash, never "0.0 km/h"', () => {
    expect(formatSpeed(null)).toBe('—')
  })

  it('renders undefined as an em dash', () => {
    expect(formatSpeed(undefined)).toBe('—')
  })
})
