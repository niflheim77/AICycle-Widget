import fs from 'fs'
import os from 'os'
import path from 'path'
import { session as eSession, BrowserWindow } from 'electron'
import { UsageWindow } from './types'
import { t } from '../../shared/i18n'

// Fetch official Codex/ChatGPT usage like OpenTokenMonitor's bearer_fetcher:
//   GET https://chatgpt.com/backend-api/codex/usage  (Bearer from ~/.codex/auth.json)
//   -> rate_limit.primary_window / secondary_window { used_percent, reset_at }
// chatgpt.com is Cloudflare-protected, so a raw Node fetch gets a 403 challenge
// page. We run the request inside a hidden Chromium window (which clears the
// challenge) the same way the claude.ai fetch works.

const AUTH = path.join(os.homedir(), '.codex', 'auth.json')
const PARTITION = 'persist:codexweb'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let win: BrowserWindow | null = null
let primed = false

function readAuth(): { token: string; account?: string } | null {
  try {
    const a = JSON.parse(fs.readFileSync(AUTH, 'utf8'))
    const token = a?.tokens?.access_token ?? a?.tokens?.accessToken ?? a?.access_token
    if (!token) return null
    return { token, account: a?.tokens?.account_id }
  } catch {
    return null
  }
}

async function ensureWin(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win
  eSession.fromPartition(PARTITION).setUserAgent(CHROME_UA)
  win = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION } })
  return win
}

function mapWindow(type: UsageWindow['window_type'], src: any, label: string): UsageWindow | null {
  if (!src || typeof src !== 'object') return null
  const pctUsed = src.used_percent ?? src.usedPercent ?? src.percent_used
  if (pctUsed == null) return null
  const reset = src.reset_at ?? src.resets_at
  const resetIn = src.resets_in_seconds ?? src.reset_in_seconds
  return {
    window_type: type,
    utilization: Math.min(Math.max(Number(pctUsed) / 100, 0), 1),
    resets_at: reset != null
      ? new Date(Number(reset) * 1000).toISOString()
      : resetIn != null
        ? new Date(Date.now() + Number(resetIn) * 1000).toISOString()
        : undefined,
    label
  }
}

export interface CodexWeb { windows: UsageWindow[]; plan?: string; info: string[] }

/** Returns Codex usage from chatgpt.com, or null if unavailable. */
export async function collectCodexWeb(): Promise<CodexWeb | null> {
  const auth = readAuth()
  if (!auth) return null
  try {
    const w = await ensureWin()
    if (!primed) {
      // Load the origin once so Chromium clears the Cloudflare challenge.
      await w.loadURL('https://chatgpt.com/')
      await new Promise((r) => setTimeout(r, 2500))
      primed = true
    }
    // Omit chatgpt-account-id entirely when unknown: sending it empty makes the
    // backend answer for the wrong (default) account context — 0% usage with a
    // full reset window — which flashed bogus values in the widget.
    const headers: Record<string, string> = { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' }
    if (auth.account) headers['chatgpt-account-id'] = auth.account
    const script = `
      fetch('https://chatgpt.com/backend-api/codex/usage', { headers: ${JSON.stringify(headers)} })
        .then(r => r.headers.get('content-type')?.includes('json') ? r.text() : Promise.reject('non-json'))
        .catch(() => null)`
    let body: string | null = await w.webContents.executeJavaScript(script)
    if (!body) {
      // Challenge not cleared yet — reload origin and retry once.
      await w.loadURL('https://chatgpt.com/')
      await new Promise((r) => setTimeout(r, 3500))
      body = await w.webContents.executeJavaScript(script)
    }
    if (!body) return null
    const json = JSON.parse(body)
    const rl = json.rate_limit ?? json.rateLimit ?? json
    const windows: UsageWindow[] = []
    const push = (x: UsageWindow | null) => { if (x) windows.push(x) }
    push(mapWindow('five_hour', rl.primary_window ?? rl.primary, t('w.5h')))
    push(mapWindow('seven_day', rl.secondary_window ?? rl.secondary, t('w.7d')))
    if (!windows.length) return null

    const plan = json.plan_type ? String(json.plan_type).replace(/^\w/, (c: string) => c.toUpperCase()) : undefined
    const info: string[] = []
    if (json.email) info.push(t('codex.account', json.email))
    const credits = json.credits
    if (credits) {
      if (credits.unlimited) info.push(t('codex.creditsUnlimited'))
      else info.push(t('codex.creditBalance', `${credits.balance ?? '0'}${credits.has_credits ? '' : t('codex.creditNone')}`))
    }
    const resetCredits = json.rate_limit_reset_credits?.available_count
    if (resetCredits != null) info.push(t('codex.resetCredits', resetCredits))
    return { windows, plan, info }
  } catch {
    return null
  }
}
