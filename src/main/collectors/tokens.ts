import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'

// Cumulative token usage, read from the local logs each tool keeps.
//
// Claude: ~/.claude/projects/**/*.jsonl, one JSON object per line; assistant
// lines carry message.usage. Nearly half of those lines are repeats (resumed or
// forked sessions replay earlier turns), so entries are de-duplicated on
// message.id + requestId — without it the totals come out ~2x too high.

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects')
const TTL = 5 * 60 * 1000

export interface TokenTotals {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  total: number
  /** ISO timestamp of the oldest entry counted */
  since?: string
  /** true when the source only retains a recent slice, so this is not all-time */
  partial?: boolean
}

const empty = (): TokenTotals => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0 })

function listJsonl(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listJsonl(p, out)
    else if (e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

let claudeCache: { at: number; totals: TokenTotals } | null = null
let claudeInFlight: Promise<TokenTotals> | null = null

async function scanClaude(): Promise<TokenTotals> {
  const t = empty()
  const seen = new Set<string>()
  for (const file of listJsonl(CLAUDE_DIR)) {
    let rl: readline.Interface
    try {
      rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
    } catch { continue }
    try {
      for await (const line of rl) {
        // Cheap reject first: these files reach tens of MB and most lines have no usage.
        if (!line || line.indexOf('"usage"') < 0) continue
        let j: any
        try { j = JSON.parse(line) } catch { continue }
        const u = j?.message?.usage
        if (!u) continue
        // Synthetic messages are placeholders, not billed API calls.
        if (j.message?.model === '<synthetic>') continue
        const key = `${j.message?.id ?? ''}|${j.requestId ?? ''}`
        if (key !== '|') {
          if (seen.has(key)) continue
          seen.add(key)
        }
        t.input += u.input_tokens ?? 0
        t.output += u.output_tokens ?? 0
        t.cacheWrite += u.cache_creation_input_tokens ?? 0
        t.cacheRead += u.cache_read_input_tokens ?? 0
        if (typeof j.timestamp === 'string' && (!t.since || j.timestamp < t.since)) t.since = j.timestamp
      }
    } catch { /* unreadable file — skip it */ }
    finally { rl.close() }
  }
  t.total = t.input + t.output + t.cacheWrite + t.cacheRead
  return t
}

/** Cumulative Claude tokens from local logs. Cached; a full scan is ~1s. */
export async function claudeTokenTotals(): Promise<TokenTotals | null> {
  if (claudeCache && Date.now() - claudeCache.at < TTL) return claudeCache.totals
  if (claudeInFlight) return claudeInFlight
  claudeInFlight = scanClaude()
    .then((totals) => {
      claudeCache = { at: Date.now(), totals }
      return totals
    })
    .catch(() => claudeCache?.totals ?? null as any)
    .finally(() => { claudeInFlight = null })
  return claudeInFlight
}

/** Build totals from Codex's rotating log. `partial` because it keeps only a recent slice. */
export function codexTotalsFrom(rows: Array<{ ts: number; input: number; output: number }>): TokenTotals | undefined {
  if (!rows.length) return undefined
  const t = empty()
  let min = Infinity
  for (const r of rows) {
    t.input += r.input
    t.output += r.output
    if (r.ts < min) min = r.ts
  }
  t.total = t.input + t.output
  t.since = isFinite(min) ? new Date(min * 1000).toISOString() : undefined
  t.partial = true
  return t
}
