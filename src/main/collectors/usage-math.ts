import { UsageSnapshot, UsageWindow } from './types'

// Pure helpers shared by the collectors. Kept free of electron imports so they
// can be unit-tested directly — both of these encode bugs that shipped once.

/** Convert a reported utilization to a 0..1 fraction.
 *
 *  claude.ai reports it as a percentage (0–100), so this always divides by 100.
 *  An earlier `n > 1 ? n/100 : n` heuristic read a real 1% (API value 1) as the
 *  fraction 1.0, which flashed 100% whenever usage crossed the 0–1% band after
 *  a reset. */
export function frac(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!isFinite(n) || n <= 0) return 0
  return Math.min(n / 100, 1)
}

/** True when a fresh all-zero reading contradicts a cached window that is still
 *  running (nonzero usage, reset time in the future).
 *
 *  The Codex usage endpoint blips to "0% / full window" occasionally. A genuine
 *  reset only zeroes a window after its scheduled reset time, and the weekly
 *  window never drops mid-week, so a contradiction means the reading is bogus. */
export function isSpuriousZero(fresh: UsageWindow[], cached?: UsageSnapshot, now = Date.now()): boolean {
  if (!cached || cached.source !== 'api') return false
  if (fresh.length === 0 || !fresh.every((w) => w.utilization === 0)) return false
  return cached.windows.some(
    (w) => (w.utilization ?? 0) > 0 && !!w.resets_at && Date.parse(w.resets_at) > now
  )
}
