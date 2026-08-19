import Store from 'electron-store'
import { UsageSnapshot, emptySnapshot } from './types'
import { collectGrokWeb, hasGrokSession } from './grok-web'
import { t } from '../../shared/i18n'

// Grok has no local logs, so everything comes from the grok.com session.
// Not logged in -> a login button, same as Claude.

const cacheStore = new Store<{ grok?: UsageSnapshot }>({ name: 'aicycle-cache' })
const MIN_INTERVAL = 60 * 1000
const CACHE_GRACE = 10 * 60 * 1000

let last: UsageSnapshot | null = null
let lastOkTs = 0
let lastCallTs = 0

function loginPrompt(note: string): UsageSnapshot {
  return { ...emptySnapshot('grok', note), needsLogin: true }
}

export async function collectGrok(): Promise<UsageSnapshot> {
  if (!hasGrokSession()) return loginPrompt(t('grok.loginPrompt'))
  if (last && Date.now() - lastCallTs < MIN_INTERVAL) return last
  lastCallTs = Date.now()

  const web = await collectGrokWeb().catch(() => null)
  if (web && web.windows.length) {
    const snap: UsageSnapshot = {
      provider: 'grok',
      available: true,
      windows: web.windows,
      extraInfo: web.info,
      fetched_at: new Date().toISOString(),
      stale: false,
      source: 'api'
    }
    cacheStore.set('grok', snap)
    last = snap
    lastOkTs = Date.now()
    return snap
  }

  // Hold the last good value briefly, then fall back to asking for a re-login.
  const cached = last ?? (cacheStore.get('grok') as UsageSnapshot | undefined)
  if (cached && Date.now() - lastOkTs < CACHE_GRACE) return { ...cached, stale: true }
  return loginPrompt(t('grok.sessionExpired'))
}
