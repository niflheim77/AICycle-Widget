import { session as eSession, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { UsageWindow } from './types'
import { t } from '../../shared/i18n'

// Grok usage via a real grok.com browser session, the same approach used for
// claude.ai. The web app asks its own backend for the quota of the current
// window:
//   POST https://grok.com/rest/rate-limits  {requestKind, modelName}
//   -> { windowSizeSeconds, remainingQueries, totalQueries }
// The request is issued from inside the page so it is same-origin and carries
// the session cookies, whatever they happen to be named.

const PARTITION = 'persist:grokweb'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// The endpoint is per-model; try newest first and keep the first one that answers.
const MODELS = ['grok-4-1', 'grok-4', 'grok-3']

const store = new Store<{ grokConnected?: boolean; grokModel?: string; grokWindowStart?: number }>({
  name: 'aicycle-secret'
})

let win: BrowserWindow | null = null

export function hasGrokSession(): boolean {
  return !!store.get('grokConnected')
}

export function clearGrokSession(): void {
  store.delete('grokConnected')
  store.delete('grokModel')
  store.delete('grokWindowStart')
  eSession.fromPartition(PARTITION).clearStorageData({ storages: ['cookies'] })
}

/** A reaped render process leaves isDestroyed() false on the window itself. */
function alive(w: BrowserWindow | null): w is BrowserWindow {
  return !!w && !w.isDestroyed() && !w.webContents.isDestroyed()
}

export function closeGrokWindow(): void {
  const w = win
  win = null
  if (!w) return
  setImmediate(() => { try { if (!w.isDestroyed()) w.destroy() } catch { /* already gone */ } })
}

async function ensureWin(): Promise<BrowserWindow> {
  if (alive(win)) return win
  closeGrokWindow()
  eSession.fromPartition(PARTITION).setUserAgent(CHROME_UA)
  win = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION } })
  win.webContents.on('render-process-gone', () => closeGrokWindow())
  return win
}

interface RateLimit { windowSizeSeconds?: number; remainingQueries?: number; totalQueries?: number }

/** Ask the page to call its own rate-limit endpoint for one model. */
async function queryModel(w: BrowserWindow, model: string): Promise<RateLimit | null> {
  const script = `
    fetch('/rest/rate-limits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestKind: 'DEFAULT', modelName: ${JSON.stringify(model)} })
    }).then(r => r.ok ? r.text() : null).catch(() => null)`
  try {
    const body: string | null = await w.webContents.executeJavaScript(script)
    if (!body) return null
    const j = JSON.parse(body) as RateLimit
    return typeof j?.totalQueries === 'number' ? j : null
  } catch {
    return null
  }
}

/** Estimate when the quota window rolls over. The endpoint reports the window
 *  length but no reset time, so remember when this window was first seen partly
 *  used and add the length to it. Cleared whenever the quota is full again. */
function estimateReset(rl: RateLimit): string | undefined {
  const size = rl.windowSizeSeconds
  const used = (rl.totalQueries ?? 0) - (rl.remainingQueries ?? 0)
  if (!size) return undefined
  if (used <= 0) {
    store.delete('grokWindowStart')
    return undefined
  }
  let start = store.get('grokWindowStart')
  if (!start || Date.now() - start > size * 1000) {
    start = Date.now()
    store.set('grokWindowStart', start)
  }
  return new Date(start + size * 1000).toISOString()
}

/** Label the window by its length, matching the 5H / 7D convention used
 *  elsewhere (these labels stay English on purpose). */
function windowLabel(seconds?: number): string {
  if (!seconds || seconds <= 0) return t('w.grok')
  const hours = Math.round(seconds / 3600)
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24}D`
  return hours >= 1 ? `${hours}H` : `${Math.round(seconds / 60)}M`
}

export interface GrokWeb { windows: UsageWindow[]; info: string[] }

/** Returns Grok usage from grok.com, or null when not logged in / unavailable. */
export async function collectGrokWeb(): Promise<GrokWeb | null> {
  try {
    const w = await ensureWin()
    // Load the origin so the fetch below is same-origin and carries the session.
    await w.loadURL('https://grok.com/')
    await new Promise((r) => setTimeout(r, 1500))

    const preferred = store.get('grokModel')
    const order = preferred ? [preferred, ...MODELS.filter((m) => m !== preferred)] : MODELS
    let rl: RateLimit | null = null
    let model = ''
    for (const m of order) {
      rl = await queryModel(w, m)
      if (rl) { model = m; break }
    }
    if (!rl) return null
    store.set('grokModel', model)

    const total = rl.totalQueries ?? 0
    const remaining = rl.remainingQueries ?? 0
    const used = Math.max(total - remaining, 0)
    const windows: UsageWindow[] = [{
      window_type: 'daily',
      utilization: total > 0 ? Math.min(used / total, 1) : 0,
      used,
      limit: total,
      remaining,
      resets_at: estimateReset(rl),
      label: windowLabel(rl.windowSizeSeconds)
    }]
    const info = [t('grok.model', model), t('grok.queries', `${used} / ${total}`)]
    return { windows, info }
  } catch {
    return null
  }
}

/** Open grok.com for login; resolves once the rate-limit endpoint answers. */
export function loginGrok(): Promise<boolean> {
  return new Promise((resolve) => {
    eSession.fromPartition(PARTITION).setUserAgent(CHROME_UA)
    const loginWin = new BrowserWindow({
      width: 1000, height: 800, title: 'Grok',
      webPreferences: { partition: PARTITION }
    })
    let done = false
    const check = async () => {
      if (done || loginWin.isDestroyed()) return
      for (const m of MODELS) {
        const rl = await queryModel(loginWin, m)
        if (rl) {
          done = true
          store.set('grokConnected', true)
          store.set('grokModel', m)
          if (!loginWin.isDestroyed()) loginWin.close()
          resolve(true)
          return
        }
      }
    }
    // Re-check after each navigation: the session only works once sign-in lands.
    loginWin.webContents.on('did-finish-load', () => { void check() })
    loginWin.on('closed', () => { if (!done) resolve(false) })
    loginWin.loadURL('https://grok.com/')
  })
}
