export type ProviderId = 'claude' | 'codex' | 'antigravity'

export interface UsageWindow {
  window_type: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'daily'
  utilization: number
  used?: number
  limit?: number
  remaining?: number
  resets_at?: string
  label?: string
}

export interface ExtraUsage {
  used: number
  limit?: number
  balance?: number
  currency: string
  enabled: boolean
}

export interface UsageSnapshot {
  provider: ProviderId
  available: boolean
  windows: UsageWindow[]
  extraUsage?: ExtraUsage
  plan?: string
  fetched_at: string
  stale: boolean
  note?: string
  source: 'api' | 'local' | 'none'
  needsLogin?: boolean
  extraInfo?: string[]
}

export interface Settings {
  enabledProviders: Record<ProviderId, boolean>
  refreshSeconds: number
  use24h: boolean
  alwaysOnTop: boolean
  launchAtStartup: boolean
  claudeLimit5h: number
  claudeLimit7d: number
}

declare global {
  interface Window {
    aicycle: {
      getLang: () => Promise<'en' | 'ko'>
      getSettings: () => Promise<Settings>
      getSnapshots: () => Promise<Record<string, UsageSnapshot>>
      refresh: () => Promise<Record<string, UsageSnapshot>>
      setEnabled: (provider: ProviderId, enabled: boolean) => Promise<Settings>
      patchSettings: (patch: Partial<Settings>) => Promise<Settings>
      autosize: (height: number) => void
      claudeLogin: () => Promise<boolean>
      claudeLogout: () => Promise<boolean>
      quit: () => void
      onSnapshots: (cb: (data: Record<string, UsageSnapshot>) => void) => () => void
    }
  }
}
