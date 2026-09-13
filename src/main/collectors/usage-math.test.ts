import { describe, it, expect } from 'vitest'
import { frac, isSpuriousZero } from './usage-math'
import { UsageSnapshot, UsageWindow } from './types'

describe('frac', () => {
  it('reads the API value as a percentage', () => {
    expect(frac(46)).toBeCloseTo(0.46)
    expect(frac(100)).toBe(1)
  })

  // The regression: 1 meant 1%, but the old heuristic left it as the fraction
  // 1.0, so the widget flashed 100% whenever usage crossed 0–1% after a reset.
  it('treats 1 as one percent, not as a full window', () => {
    expect(frac(1)).toBeCloseTo(0.01)
  })

  it('clamps above 100 and floors at zero', () => {
    expect(frac(150)).toBe(1)
    expect(frac(0)).toBe(0)
    expect(frac(-5)).toBe(0)
  })

  it('survives junk from the API', () => {
    expect(frac(undefined)).toBe(0)
    expect(frac(null)).toBe(0)
    expect(frac('nope')).toBe(0)
    expect(frac(NaN)).toBe(0)
    expect(frac(Infinity)).toBe(0)
  })

  it('accepts numeric strings', () => {
    expect(frac('46')).toBeCloseTo(0.46)
  })
})

describe('isSpuriousZero', () => {
  const NOW = Date.parse('2026-03-01T12:00:00Z')
  const future = new Date(NOW + 3_600_000).toISOString()
  const past = new Date(NOW - 3_600_000).toISOString()

  const cached = (windows: UsageWindow[], source: UsageSnapshot['source'] = 'api'): UsageSnapshot => ({
    provider: 'codex', available: true, windows,
    fetched_at: new Date(NOW).toISOString(), stale: false, source
  })
  const zeros: UsageWindow[] = [
    { window_type: 'five_hour', utilization: 0 },
    { window_type: 'seven_day', utilization: 0 }
  ]

  it('flags zeros that contradict a window still running', () => {
    const prev = cached([{ window_type: 'seven_day', utilization: 0.61, resets_at: future }])
    expect(isSpuriousZero(zeros, prev, NOW)).toBe(true)
  })

  it('accepts zeros once the window has passed its reset', () => {
    const prev = cached([{ window_type: 'seven_day', utilization: 0.61, resets_at: past }])
    expect(isSpuriousZero(zeros, prev, NOW)).toBe(false)
  })

  it('accepts zeros when the cache was already empty', () => {
    const prev = cached([{ window_type: 'seven_day', utilization: 0, resets_at: future }])
    expect(isSpuriousZero(zeros, prev, NOW)).toBe(false)
  })

  it('does not flag a reading that is not all zero', () => {
    const prev = cached([{ window_type: 'seven_day', utilization: 0.61, resets_at: future }])
    const mixed: UsageWindow[] = [
      { window_type: 'five_hour', utilization: 0 },
      { window_type: 'seven_day', utilization: 0.61 }
    ]
    expect(isSpuriousZero(mixed, prev, NOW)).toBe(false)
  })

  it('needs a cached snapshot from the API to compare against', () => {
    expect(isSpuriousZero(zeros, undefined, NOW)).toBe(false)
    const local = cached([{ window_type: 'seven_day', utilization: 0.61, resets_at: future }], 'local')
    expect(isSpuriousZero(zeros, local, NOW)).toBe(false)
  })

  it('ignores an empty reading', () => {
    const prev = cached([{ window_type: 'seven_day', utilization: 0.61, resets_at: future }])
    expect(isSpuriousZero([], prev, NOW)).toBe(false)
  })
})
