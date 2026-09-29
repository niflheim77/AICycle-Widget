import { describe, it, expect } from 'vitest'
import { frac, isSpuriousZero, parseResetTickets } from './usage-math'
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

describe('parseResetTickets', () => {
  const NOW = Date.parse('2026-09-29T00:00:00Z')

  // The object claude.ai returned for /usage?cedar_ember=1 on a Pro account
  // (ids and event_props trimmed).
  const real = {
    eligible: true,
    grants: [{
      id: 'opus55-launch-promax-20260921',
      label: 'Claude Opus 5.5 launch: one usage-limit reset for Pro and Max',
      resets_total: 1, resets_left: 1,
      starts_at: '2026-09-22T16:00:00+00:00', ends_at: '2026-10-22T16:00:00+00:00',
      clears: ['five_hour', 'seven_day', 'seven_day_overage_included'],
      paused: false, usable_now: true, use_requires_limit: false
    }],
    next_grant_id: 'opus55-launch-promax-20260921', cooldown_until: null
  }
  const grant = (over: Record<string, unknown>) => ({ ...real.grants[0], ...over })

  it('reads the real response shape', () => {
    expect(parseResetTickets(real, NOW)).toEqual({
      left: 1, total: 1, expiresAt: '2026-10-22T16:00:00.000Z', usableNow: true
    })
  })

  it('sums across grants and reports the earliest expiry that still has a ticket', () => {
    const got = parseResetTickets({ grants: [
      grant({ resets_total: 2, resets_left: 2, ends_at: '2026-11-30T00:00:00Z' }),
      grant({ resets_total: 1, resets_left: 1, ends_at: '2026-10-05T00:00:00Z' })
    ] }, NOW)
    expect(got).toMatchObject({ left: 3, total: 3, expiresAt: '2026-10-05T00:00:00.000Z' })
  })

  it('ignores a grant whose tickets are used up when picking the expiry', () => {
    const got = parseResetTickets({ grants: [
      grant({ resets_total: 1, resets_left: 0, ends_at: '2026-10-01T00:00:00Z' }),
      grant({ resets_total: 1, resets_left: 1, ends_at: '2026-10-22T16:00:00Z' })
    ] }, NOW)
    expect(got).toMatchObject({ left: 1, total: 2, expiresAt: '2026-10-22T16:00:00.000Z' })
  })

  it('shows 0 of N (no expiry) once every ticket is spent', () => {
    const got = parseResetTickets({ grants: [grant({ resets_left: 0 })] }, NOW)
    expect(got).toEqual({ left: 0, total: 1, expiresAt: undefined, usableNow: false })
  })

  it('drops grants that have already expired', () => {
    expect(parseResetTickets({ grants: [grant({ ends_at: '2026-09-01T00:00:00Z' })] }, NOW)).toBeNull()
  })

  it('is not usable now when paused or when the grant says it is not', () => {
    expect(parseResetTickets({ grants: [grant({ paused: true })] }, NOW)?.usableNow).toBe(false)
    expect(parseResetTickets({ grants: [grant({ usable_now: false })] }, NOW)?.usableNow).toBe(false)
  })

  it('returns null when there is nothing to show', () => {
    expect(parseResetTickets(null, NOW)).toBeNull()
    expect(parseResetTickets(undefined, NOW)).toBeNull()
    expect(parseResetTickets({ eligible: false, grants: [] }, NOW)).toBeNull()
    expect(parseResetTickets({ grants: 'nope' }, NOW)).toBeNull()
  })

  it('skips malformed grants instead of throwing', () => {
    const got = parseResetTickets({ grants: [null, 'x', { resets_left: 'a' }, grant({})] }, NOW)
    expect(got).toMatchObject({ left: 1, total: 1 })
  })
})
