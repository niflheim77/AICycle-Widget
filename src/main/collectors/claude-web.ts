import { session as eSession, BrowserWindow, safeStorage } from 'electron'
import Store from 'electron-store'
import { UsageSnapshot, UsageWindow, ExtraUsage } from './types'
import { t } from '../../shared/i18n'

// Uses the same approach as claude-usage-widget: a real claude.ai browser
// session (sessionKey cookie). The claude.ai web endpoints are what the web app
// itself calls, so they are not throttled like api.anthropic.com/oauth/usage.

const PARTITION = 'persist:claudeweb'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const secretStore = new Store<{ sessionKey_encrypted?: string; sessionKey?: string; connected?: boolean }>({
  name: 'aicycle-secret'
})

let cachedOrgId: string | null = null
let fetchWin: BrowserWindow | null = null

function getSession() {
  const ses = eSession.fromPartition(PARTITION)
  ses.setUserAgent(CHROME_UA)
  return ses
}

export function hasSession(): boolean {
  // The login cookie lives in the persistent partition (survives restarts), so
  // "logged in" is tracked by a flag, independent of safeStorage decryptability.
  return !!secretStore.get('connected')
}

function readSessionKey(): string | null {
  const enc = secretStore.get('sessionKey_encrypted')
  if (enc && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { return null }
  }
  return secretStore.get('sessionKey') ?? null
}

function storeSessionKey(key: string) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      secretStore.set('sessionKey_encrypted', safeStorage.encryptString(key).toString('base64'))
    }
  } catch { /* encryption best-effort */ }
  // Plaintext fallback: safeStorage.decryptString is unreliable across runs on
  // some Windows setups, and the token is also stored in the partition cookie DB
  // anyway — so this is the same local exposure, but reliably re-readable.
  secretStore.set('sessionKey', key)
  secretStore.set('connected', true)
}

const COOKIE_TTL = 365 * 24 * 3600

async function setSessionCookie(value: string) {
  // expirationDate makes it a persistent cookie so it survives app restarts
  // (claude.ai sets sessionKey as a session cookie, which would otherwise vanish).
  await getSession().cookies.set({
    url: 'https://claude.ai', name: 'sessionKey', value,
    domain: '.claude.ai', secure: true, httpOnly: true,
    expirationDate: Math.floor(Date.now() / 1000) + COOKIE_TTL
  })
}

export function clearSession() {
  secretStore.delete('sessionKey_encrypted')
  secretStore.delete('sessionKey')
  secretStore.delete('connected')
  cachedOrgId = null
  getSession().clearStorageData({ storages: ['cookies'] })
}

/** Re-apply the stored key as a cookie when possible. Best-effort: the
 *  persistent partition normally already holds the cookie from login. */
async function applyCookie(): Promise<void> {
  const key = readSessionKey()
  if (!key) return
  try { await setSessionCookie(key) } catch { /* noop */ }
}

async function ensureWin(): Promise<BrowserWindow> {
  if (fetchWin && !fetchWin.isDestroyed()) return fetchWin
  fetchWin = new BrowserWindow({
    show: false,
    webPreferences: { partition: PARTITION, offscreen: false, javascript: true }
  })
  return fetchWin
}

/** Navigate the hidden window to a claude.ai JSON endpoint and parse the body. */
async function fetchJson(url: string): Promise<any> {
  const w = await ensureWin()
  await w.loadURL(url)
  const txt: string = await w.webContents.executeJavaScript('document.body.innerText')
  return JSON.parse(txt)
}

async function getOrgId(): Promise<string | null> {
  if (cachedOrgId) return cachedOrgId
  const data = await fetchJson('https://claude.ai/api/organizations')
  if (!Array.isArray(data) || data.length === 0) return null
  const chat = data.filter((o: any) => o.capabilities?.includes('chat'))
  const def = chat.find((o: any) => o.raven_type === 'team') ?? chat[0] ?? data[0]
  cachedOrgId = def?.uuid ?? def?.id ?? null
  return cachedOrgId
}

function frac(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!isFinite(n) || n < 0) return 0
  return n > 1 ? Math.min(n / 100, 1) : n
}

function mapWindow(type: UsageWindow['window_type'], src: any, label: string): UsageWindow | null {
  if (!src || typeof src !== 'object') return null
  return {
    window_type: type,
    utilization: frac(src.utilization),
    used: src.used ?? src.used_credits,
    limit: src.limit,
    remaining: src.remaining,
    resets_at: src.resets_at ?? src.reset_at,
    label
  }
}

function mapExtra(overage: any, prepaid: any): ExtraUsage | undefined {
  if (!overage && !prepaid) return undefined
  const limitCents = overage?.monthly_credit_limit ?? overage?.spend_limit_amount_cents
  const usedCents = overage?.used_credits ?? overage?.balance_cents
  const balance = prepaid?.amount != null ? prepaid.amount / 100 : undefined
  return {
    used: usedCents != null ? usedCents / 100 : 0,
    limit: limitCents != null ? limitCents / 100 : undefined,
    balance,
    currency: overage?.currency ?? prepaid?.currency ?? 'USD',
    enabled: overage?.is_enabled ?? (usedCents != null)
  }
}

/** Returns a snapshot from claude.ai, or null if not logged in / session invalid. */
export async function collectClaudeWeb(includeExtra: boolean): Promise<UsageSnapshot | null> {
  await applyCookie() // best-effort; the persistent partition usually has the cookie
  try {
    const orgId = await getOrgId()
    if (!orgId) return null
    const usage = await fetchJson(`https://claude.ai/api/organizations/${orgId}/usage`)

    const windows: UsageWindow[] = []
    const push = (w: UsageWindow | null) => { if (w) windows.push(w) }
    push(mapWindow('five_hour', usage.five_hour, t('w.5h')))
    push(mapWindow('seven_day', usage.seven_day, t('w.7d')))
    push(mapWindow('seven_day_opus', usage.seven_day_opus, t('w.7dOpus')))
    if (windows.length === 0) return null // body was not the expected JSON (likely logged out)

    let extra: ExtraUsage | undefined
    if (includeExtra) {
      // Sequential — fetchJson shares one hidden window, so parallel loadURL
      // calls would clobber each other.
      const overage = await fetchJson(`https://claude.ai/api/organizations/${orgId}/overage_spend_limit`).catch(() => null)
      const prepaid = await fetchJson(`https://claude.ai/api/organizations/${orgId}/prepaid/credits`).catch(() => null)
      extra = mapExtra(overage, prepaid)
    }

    return {
      provider: 'claude',
      available: true,
      windows,
      extraUsage: extra,
      plan: usage.plan?.name ?? usage.subscription,
      fetched_at: new Date().toISOString(),
      stale: false,
      source: 'api'
    }
  } catch {
    // Non-JSON body (redirected to login) or network error → session invalid.
    cachedOrgId = null
    return null
  }
}

/** Open claude.ai login; resolve once the sessionKey cookie is captured. */
export function loginClaude(): Promise<boolean> {
  return new Promise((resolve) => {
    const ses = getSession()
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 760,
      title: 'Claude 로그인',
      webPreferences: { partition: PARTITION }
    })
    let done = false
    const onChanged = async (_e: unknown, cookie: Electron.Cookie, _c: string, removed: boolean) => {
      if (cookie.name === 'sessionKey' && cookie.domain?.includes('claude.ai') && !removed && cookie.value) {
        done = true
        ses.cookies.removeListener('changed', onChanged)
        storeSessionKey(cookie.value)
        try { await setSessionCookie(cookie.value) } catch { /* noop */ } // make it persistent
        cachedOrgId = null
        if (!loginWin.isDestroyed()) loginWin.close()
        resolve(true)
      }
    }
    ses.cookies.on('changed', onChanged)
    loginWin.on('closed', () => {
      ses.cookies.removeListener('changed', onChanged)
      if (!done) resolve(false)
    })
    loginWin.loadURL('https://claude.ai/login')
  })
}
