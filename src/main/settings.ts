import Store from 'electron-store'
import { ProviderId } from './collectors/types'

export interface Settings {
  enabledProviders: Record<ProviderId, boolean>
  refreshSeconds: number
  use24h: boolean
  alwaysOnTop: boolean
  launchAtStartup: boolean
  /** Local-mode token limits (0 = unset). Used to show 남은 % without login. */
  claudeLimit5h: number
  claudeLimit7d: number
}

const defaults: Settings = {
  enabledProviders: { claude: true, codex: true, antigravity: false },
  refreshSeconds: 60,
  use24h: true,
  alwaysOnTop: true,
  launchAtStartup: false,
  claudeLimit5h: 0,
  claudeLimit7d: 0
}

const store = new Store<Settings>({ name: 'aicycle-settings', defaults })

export function getSettings(): Settings {
  return {
    enabledProviders: { ...defaults.enabledProviders, ...store.get('enabledProviders') },
    refreshSeconds: store.get('refreshSeconds'),
    use24h: store.get('use24h'),
    alwaysOnTop: store.get('alwaysOnTop'),
    launchAtStartup: store.get('launchAtStartup'),
    claudeLimit5h: store.get('claudeLimit5h'),
    claudeLimit7d: store.get('claudeLimit7d')
  }
}

export function setEnabled(provider: ProviderId, enabled: boolean): Settings {
  const cur = getSettings().enabledProviders
  store.set('enabledProviders', { ...cur, [provider]: enabled })
  return getSettings()
}

export function patchSettings(patch: Partial<Settings>): Settings {
  for (const [k, v] of Object.entries(patch)) store.set(k, v as never)
  return getSettings()
}
