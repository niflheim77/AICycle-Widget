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

/** Limit-reset tickets Anthropic hands out to eligible plans (Settings → Usage →
 *  Resets on claude.ai). */
export interface ResetTickets {
  /** Tickets still unused across all unexpired grants. */
  left: number
  total: number
  /** Earliest expiry among grants that still have a ticket left. */
  expiresAt?: string
  /** A ticket can be redeemed right now (not paused, and the grant allows it). */
  usableNow: boolean
}

/** Read the `cedar_ember` object that `/usage?cedar_ember=1` returns.
 *
 *  Shape seen on a Pro account:
 *    { eligible, grants: [{ resets_total, resets_left, ends_at, usable_now,
 *                            paused, ... }], next_grant_id, cooldown_until, ... }
 *  Returns null when there is nothing worth showing, so callers can just skip
 *  the line rather than print "0 of 0". Grants past their end date are ignored
 *  even if the server still lists them. */
export function parseResetTickets(v: unknown, now = Date.now()): ResetTickets | null {
  const grants = (v as { grants?: unknown } | null | undefined)?.grants
  if (!Array.isArray(grants)) return null

  let left = 0
  let total = 0
  let usableNow = false
  let expires: number | undefined

  for (const g of grants) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const grantLeft = Number(o.resets_left)
    const grantTotal = Number(o.resets_total)
    if (!isFinite(grantLeft) || !isFinite(grantTotal) || grantTotal <= 0) continue

    const ends = typeof o.ends_at === 'string' ? Date.parse(o.ends_at) : NaN
    if (isFinite(ends) && ends <= now) continue // already expired

    left += Math.max(grantLeft, 0)
    total += grantTotal
    if (grantLeft > 0) {
      if (o.usable_now === true && o.paused !== true) usableNow = true
      if (isFinite(ends) && (expires === undefined || ends < expires)) expires = ends
    }
  }

  if (total <= 0) return null
  return {
    left,
    total,
    expiresAt: expires === undefined ? undefined : new Date(expires).toISOString(),
    usableNow
  }
}
