// Mock `window.aicycle` so the real renderer bundle paints with fake (no-PII)
// data for README screenshots. Used only by tools/shot/capture.cjs.
const { ipcRenderer } = require('electron')

const now = Date.now()
const iso = (ms) => new Date(now + ms).toISOString()
const H = 3600e3, M = 60e3, D = 24 * H
const at = new Date(now).toISOString()

const snaps = {
  claude: {
    provider: 'claude', available: true, source: 'api', stale: false, plan: 'Max 20x', fetched_at: at,
    windows: [
      { window_type: 'five_hour', utilization: 0.46, label: '5H', resets_at: iso(2 * H + 13 * M) },
      { window_type: 'seven_day', utilization: 0.82, label: '7D', resets_at: iso(4 * D + 3 * H) }
    ],
    extraUsage: { used: 20.08, limit: 20.0, balance: 68.8, currency: 'USD', enabled: true }
  },
  codex: {
    provider: 'codex', available: true, source: 'api', stale: false, plan: 'Plus', fetched_at: at,
    windows: [
      { window_type: 'five_hour', utilization: 0.34, label: '5H', resets_at: iso(3 * H + 5 * M) },
      { window_type: 'seven_day', utilization: 0.61, label: '7D', resets_at: iso(5 * D) }
    ]
  },
  antigravity: {
    provider: 'antigravity', available: true, source: 'api', stale: false, fetched_at: at,
    windows: [
      { window_type: 'daily', utilization: 0.27, label: 'Daily', resets_at: iso(9 * H + 40 * M) }
    ]
  }
}

const settings = {
  enabledProviders: { claude: true, codex: true, antigravity: true },
  refreshSeconds: 60, use24h: true, alwaysOnTop: true, launchAtStartup: false,
  claudeLimit5h: 0, claudeLimit7d: 0
}

window.aicycle = {
  getLang: () => Promise.resolve('en'),
  getSettings: () => Promise.resolve(settings),
  getSnapshots: () => Promise.resolve(snaps),
  refresh: () => Promise.resolve(snaps),
  setEnabled: () => Promise.resolve(settings),
  patchSettings: () => Promise.resolve(settings),
  autosize: (h) => ipcRenderer.send('shot-autosize', h),
  claudeLogin: () => Promise.resolve(true),
  claudeLogout: () => Promise.resolve(true),
  quit: () => {},
  onSnapshots: () => () => {},
  onOpenSettings: () => () => {}
}
