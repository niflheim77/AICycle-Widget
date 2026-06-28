import fs from 'fs'
import os from 'os'
import path from 'path'
import Store from 'electron-store'
import { UsageSnapshot, emptySnapshot } from './types'
import { collectCodexWeb } from './codex-web'
import { t } from '../../shared/i18n'

const CODEX_DIR = path.join(os.homedir(), '.codex')
const DB = path.join(CODEX_DIR, 'logs_2.sqlite')

const cacheStore = new Store<{ codex?: UsageSnapshot }>({ name: 'aicycle-cache' })
let lastWebTry = 0
const WEB_INTERVAL = 90 * 1000

// node:sqlite ships with Node >= 22.5 (Electron >= 35). Load it lazily and
// guard against older runtimes so the whole app never crashes on import.
type SqliteCtor = new (p: string, opts?: { readOnly?: boolean }) => {
  prepare: (sql: string) => { all: (...a: unknown[]) => unknown[] }
  close: () => void
}
let DatabaseSync: SqliteCtor | null | undefined
function loadSqlite(): SqliteCtor | null {
  if (DatabaseSync !== undefined) return DatabaseSync
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseSync = (require('node:sqlite') as { DatabaseSync: SqliteCtor }).DatabaseSync
  } catch {
    DatabaseSync = null
  }
  return DatabaseSync
}

/** Pull the JSON object out of a "SSE event: {...}" log line. */
function parseSse(body: string): any | null {
  const i = body.indexOf('{')
  if (i < 0) return null
  try { return JSON.parse(body.slice(i)) } catch { return null }
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

let tokCache: { tok5h: number; tok7d: number } | null = null
let tokCacheTs = 0

/** Local token usage (5h/7d) from logs_2.sqlite, cached. */
function localTokens(): { tok5h: number; tok7d: number } | null {
  if (tokCache && Date.now() - tokCacheTs < 60_000) return tokCache
  if (!fs.existsSync(DB)) return null
  const Sqlite = loadSqlite()
  if (!Sqlite) return null
  let db: InstanceType<SqliteCtor>
  try { db = new Sqlite(DB, { readOnly: true }) } catch { return null }
  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const cut5h = nowSec - 5 * 60 * 60
    const rows = db
      .prepare(
        "SELECT ts, feedback_log_body AS body FROM logs " +
          "WHERE ts > ? AND feedback_log_body LIKE '%response.completed%' ORDER BY ts ASC"
      )
      .all(nowSec - 7 * 24 * 60 * 60) as Array<{ ts: number; body: string }>
    let tok5h = 0, tok7d = 0
    for (const r of rows) {
      const u = parseSse(r.body)?.response?.usage
      if (!u) continue
      const total = u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
      tok7d += total
      if (r.ts >= cut5h) tok5h += total
    }
    tokCache = { tok5h, tok7d }
    tokCacheTs = Date.now()
    return tokCache
  } catch {
    return null
  } finally {
    try { db.close() } catch { /* noop */ }
  }
}

function localInfo(): string[] {
  const tk = localTokens()
  if (!tk) return []
  return [t('codex.localTokens5h', fmtTok(tk.tok5h)), t('codex.localTokens7d', fmtTok(tk.tok7d))]
}

export async function collectCodex(): Promise<UsageSnapshot> {
  // 1) Official usage % via chatgpt.com (same data as OpenTokenMonitor).
  if (Date.now() - lastWebTry >= WEB_INTERVAL) {
    lastWebTry = Date.now()
    const web = await collectCodexWeb().catch(() => null)
    if (web && web.windows.length) {
      const snap: UsageSnapshot = {
        provider: 'codex', available: true, windows: web.windows,
        plan: web.plan, extraInfo: [...web.info, ...localInfo()],
        fetched_at: new Date().toISOString(), stale: false, source: 'api'
      }
      cacheStore.set('codex', snap)
      return snap
    }
  }
  // Serve a recent official snapshot if the live fetch is throttled/blocked.
  const cached = cacheStore.get('codex') as UsageSnapshot | undefined
  if (cached) return { ...cached, extraInfo: [...(cached.extraInfo ?? []).filter((l) => !l.startsWith('로컬')), ...localInfo()], stale: true }

  // 2) Fallback: local token counts only (no official data available).
  const tk = localTokens()
  if (!tk) return emptySnapshot('codex', t('codex.noData'))
  return {
    provider: 'codex',
    available: true,
    windows: [
      { window_type: 'five_hour', utilization: 0, used: tk.tok5h, label: t('w.5hLocal') },
      { window_type: 'seven_day', utilization: 0, used: tk.tok7d, label: t('w.7dLocal') }
    ],
    fetched_at: new Date().toISOString(),
    stale: false,
    source: 'local',
    note: t('codex.loginNeeded')
  }
}
