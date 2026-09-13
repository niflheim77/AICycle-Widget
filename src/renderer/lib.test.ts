import { describe, it, expect } from 'vitest'
import { pct, arcColor, fmtTokens, compactLabel, compactWindows } from './lib'
import type { UsageWindow } from './types'

const w = (window_type: UsageWindow['window_type'], label: string): UsageWindow =>
  ({ window_type, utilization: 0.5, label })

describe('pct', () => {
  it('rounds a fraction to a percentage', () => {
    expect(pct(0.46)).toBe(46)
    expect(pct(0.005)).toBe(1)
  })

  it('clamps to 0..100', () => {
    expect(pct(1.5)).toBe(100)
    expect(pct(-1)).toBe(0)
  })
})

describe('arcColor', () => {
  it('steps green → amber → red at 75 and 90 percent', () => {
    expect(arcColor(0.74)).toBe(arcColor(0.1))
    expect(arcColor(0.75)).not.toBe(arcColor(0.74))
    expect(arcColor(0.9)).not.toBe(arcColor(0.89))
  })
})

describe('fmtTokens', () => {
  it('scales into k, M and B', () => {
    expect(fmtTokens(999)).toBe('999')
    expect(fmtTokens(1_500)).toBe('1.5k')
    expect(fmtTokens(2_400_000)).toBe('2.4M')
    expect(fmtTokens(3_160_000_000)).toBe('3.16B')
  })

  it('renders a missing count as a dash', () => {
    expect(fmtTokens(undefined)).toBe('—')
  })
})

describe('compactLabel', () => {
  // A compact slot gives the label ~58px next to the percentage, so the
  // descriptive ones have to be cut or they overflow the row.
  it('shortens long labels to a two-letter mark', () => {
    expect(compactLabel('Prompt')).toBe('PR')
    expect(compactLabel('Flow')).toBe('FL')
  })

  it('drops the ·local suffix rather than abbreviating', () => {
    expect(compactLabel('5H·local')).toBe('5H')
    expect(compactLabel('7D·local')).toBe('7D')
  })

  it('passes short labels through untouched', () => {
    expect(compactLabel('5H')).toBe('5H')
    expect(compactLabel('7D')).toBe('7D')
    expect(compactLabel('1D')).toBe('1D')
  })

  it('handles a missing label', () => {
    expect(compactLabel(undefined)).toBe('')
  })
})

describe('compactWindows', () => {
  it('puts the short window over the weekly one', () => {
    const got = compactWindows([w('five_hour', '5H'), w('seven_day', '7D')])
    expect(got.map((x) => x.label)).toEqual(['5H', '7D'])
  })

  it('leaves the opus window to the detail view', () => {
    const got = compactWindows([w('five_hour', '5H'), w('seven_day', '7D'), w('seven_day_opus', '7D-O')])
    expect(got.map((x) => x.label)).toEqual(['5H', '7D'])
  })

  // Gemini reports two 'daily' buckets and no weekly window. Anchoring the
  // second slot to seven_day used to hide Flow entirely in compact mode.
  it('keeps a second daily window when there is no weekly one', () => {
    const got = compactWindows([w('daily', 'Prompt'), w('daily', 'Flow')])
    expect(got.map((x) => x.label)).toEqual(['Prompt', 'Flow'])
  })

  it('returns the single window a provider reports', () => {
    expect(compactWindows([w('daily', '2H')]).map((x) => x.label)).toEqual(['2H'])
  })

  it('returns nothing when there are no windows', () => {
    expect(compactWindows([])).toEqual([])
  })
})
