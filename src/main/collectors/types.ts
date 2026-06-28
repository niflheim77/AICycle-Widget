export type ProviderId = 'claude' | 'codex' | 'antigravity'

export type WindowType = 'five_hour' | 'seven_day' | 'seven_day_opus' | 'daily'

export interface UsageWindow {
  window_type: WindowType
  /** 0..1 fraction used */
  utilization: number
  used?: number
  limit?: number
  remaining?: number
  /** ISO timestamp when this window resets */
  resets_at?: string
  label?: string
}

export interface ExtraUsage {
  /** spent so far, in the smallest unit converted to major (e.g. dollars) */
  used: number
  limit?: number
  /** prepaid credit balance remaining */
  balance?: number
  currency: string
  enabled: boolean
}

export interface UsageSnapshot {
  provider: ProviderId
  /** false when no data source is available on this machine */
  available: boolean
  windows: UsageWindow[]
  extraUsage?: ExtraUsage
  plan?: string
  fetched_at: string
  /** true when returned from cache because the live fetch failed */
  stale: boolean
  /** human readable note about the data source / errors */
  note?: string
  source: 'api' | 'local' | 'none'
  /** true when a claude.ai login is required to get full usage data */
  needsLogin?: boolean
  /** extra info lines shown in the detail view (plan, credits, local tokens…) */
  extraInfo?: string[]
}

export function emptySnapshot(provider: ProviderId, note?: string): UsageSnapshot {
  return {
    provider,
    available: false,
    windows: [],
    fetched_at: new Date().toISOString(),
    stale: false,
    source: 'none',
    note
  }
}
