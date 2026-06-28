import type { UsageWindow } from './types'
import { t, localeTag } from '../shared/i18n'

export function pct(u: number): number {
  return Math.round(Math.min(Math.max(u, 0), 1) * 100)
}

export function arcColor(u: number): string {
  const p = u * 100
  if (p >= 90) return '#ff4d4f'
  if (p >= 75) return '#faad14'
  return '#52c41a'
}

export function fmtTokens(n?: number): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

/** Absolute reset clock, e.g. "16:42" (24h) or "4:42 PM" (12h). */
export function fmtResetClock(iso?: string, use24h = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(localeTag(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24h
  })
}

/** Reset clock; includes the date when the reset is not today, e.g. "16:42" or "6/30 02:11". */
export function fmtResetWhen(iso?: string, use24h = true): string {
  if (!iso) return t('cd.none')
  const d = new Date(iso)
  if (isNaN(d.getTime())) return t('cd.none')
  const time = d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit', hour12: !use24h })
  // Within 24h → time only; further out → include the date.
  if (d.getTime() - Date.now() < 24 * 60 * 60 * 1000) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** Countdown to reset, e.g. "2시간 13분" / "2h 13m". */
export function fmtCountdown(iso?: string): string {
  if (!iso) return t('cd.none')
  const ms = new Date(iso).getTime() - Date.now()
  if (isNaN(ms)) return t('cd.none')
  if (ms <= 0) return t('cd.soon')
  const mins = Math.floor(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return t('cd.dh', d, h)
  return h > 0 ? t('cd.hm', h, m) : t('cd.m', m)
}

export function fiveHour(windows: UsageWindow[]): UsageWindow | undefined {
  return windows.find((w) => w.window_type === 'five_hour')
}

export const PROVIDER_META: Record<string, { name: string; color: string }> = {
  claude: { name: 'Claude', color: '#d97757' },
  codex: { name: 'Codex', color: '#10a37f' },
  antigravity: { name: 'Antigravity', color: '#4285f4' }
}
