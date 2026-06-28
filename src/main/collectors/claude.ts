import { UsageSnapshot, emptySnapshot } from './types'
import { collectClaudeWeb, hasSession } from './claude-web'
import { t } from '../../shared/i18n'

// Claude shows usage ONLY when logged in (claude.ai sessionKey → 남은 %).
// Not logged in → just a login button, nothing else.

let lastGood: UsageSnapshot | null = null
let lastGoodTs = 0
let lastCallTs = 0
const MIN_INTERVAL = 25 * 1000
const CACHE_GRACE = 5 * 60 * 1000

function loginPrompt(note: string): UsageSnapshot {
  return { ...emptySnapshot('claude', note), needsLogin: true }
}

export async function collectClaude(): Promise<UsageSnapshot> {
  if (lastGood && Date.now() - lastCallTs < MIN_INTERVAL) return lastGood
  lastCallTs = Date.now()

  if (!hasSession()) {
    return loginPrompt(t('claude.loginPrompt'))
  }

  const web = await collectClaudeWeb(true).catch(() => null)
  if (web) { lastGood = web; lastGoodTs = Date.now(); return web }

  // Session present but fetch failed: hold the last good briefly, else re-login.
  if (lastGood && Date.now() - lastGoodTs < CACHE_GRACE) return { ...lastGood, stale: true }
  return loginPrompt(t('claude.sessionExpired'))
}
