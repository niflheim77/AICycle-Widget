import fs from 'fs'
import { execFileSync } from 'child_process'
import Store from 'electron-store'
import { UsageSnapshot, UsageWindow, emptySnapshot } from './types'
import { t } from '../../shared/i18n'

// Antigravity usage via its local Language Server (Codeium/Windsurf based).
// The server only runs while Antigravity is open. Each launch it picks a random
// loopback port and a CSRF token (passed as `--csrf_token` on its command line).
// We discover both from the running process, then call GetUserStatus with the
// header `x-codeium-csrf-token`. When the IDE is closed we show the last value.

const cacheStore = new Store<{ antigravity?: UsageSnapshot }>({ name: 'aicycle-cache' })
let server: { port: number; csrf: string } | null = null

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 8000 })
  } catch {
    return ''
  }
}

const CSRF_RE = /--csrf_token[\s=]+([0-9a-fA-F-]{16,})/

/** Find the running language_server process: its CSRF token + candidate ports. */
function discover(): { csrf: string; ports: number[] } | null {
  return process.platform === 'win32' ? discoverWindows() : discoverUnix()
}

function discoverWindows(): { csrf: string; ports: number[] } | null {
  const out = run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server*' } | " +
    "ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"
  ])
  const line = out.split('\n').find((l) => CSRF_RE.test(l))
  if (!line) return null
  const pid = line.split('|')[0].trim()
  const csrf = line.match(CSRF_RE)?.[1]
  if (!csrf || !pid) return null
  const net = run('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -State Listen -OwningProcess ${pid} | Select-Object -ExpandProperty LocalPort`])
  const ports = [...new Set(net.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0))]
  return ports.length ? { csrf, ports } : null
}

/** Find the language_server PID + CSRF token. Linux: /proc; macOS: ps. */
function findProcessUnix(): { pid: string; csrf: string } | null {
  if (process.platform === 'linux') {
    try {
      for (const pid of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pid)) continue
        let cmd: string
        try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ') } catch { continue }
        if (/language_server/.test(cmd) && CSRF_RE.test(cmd)) {
          const csrf = cmd.match(CSRF_RE)?.[1]
          if (csrf) return { pid, csrf }
        }
      }
    } catch { /* /proc unavailable */ }
    return null
  }
  const out = run('ps', ['-ww', '-A', '-o', 'pid=,args='])
  const line = out.split('\n').find((l) => /language_server/.test(l) && CSRF_RE.test(l))
  const m = line?.trim().match(/^(\d+)\s+(.*)$/)
  const csrf = m?.[2].match(CSRF_RE)?.[1]
  return m?.[1] && csrf ? { pid: m[1], csrf } : null
}

/** Listening loopback ports for a pid. Tries lsof, then `ss` on Linux. */
function listeningPortsUnix(pid: string): number[] {
  const grab = (s: string) =>
    [...new Set([...s.matchAll(/(?:127\.0\.0\.1|\[?::1\]?|localhost):(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => n > 0))]
  let ports = grab(run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pid]))
  if (!ports.length && process.platform === 'linux') {
    const ss = run('ss', ['-tlnpH']).split('\n').filter((l) => l.includes(`pid=${pid},`)).join('\n')
    ports = grab(ss)
  }
  return ports
}

/** macOS / Linux discovery. */
function discoverUnix(): { csrf: string; ports: number[] } | null {
  const proc = findProcessUnix()
  if (!proc) return null
  const ports = listeningPortsUnix(proc.pid)
  return ports.length ? { csrf: proc.csrf, ports } : null
}

async function rpc(port: number, csrf: string, method: string): Promise<any | null> {
  try {
    const r = await fetch(
      `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': csrf },
        body: '{}'
      }
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function offline(note: string): UsageSnapshot {
  const cached = cacheStore.get('antigravity') as UsageSnapshot | undefined
  if (cached) return { ...cached, stale: true, note: t('ag.offline') }
  return emptySnapshot('antigravity', note)
}

/** Resolve a working { port, csrf }, trying the cached one first. */
async function getStatus(): Promise<{ status: any; port: number; csrf: string } | null> {
  if (server) {
    const s = await rpc(server.port, server.csrf, 'GetUserStatus')
    if (s) return { status: s, port: server.port, csrf: server.csrf }
  }
  const d = discover()
  if (!d) return null
  for (const port of d.ports) {
    const s = await rpc(port, d.csrf, 'GetUserStatus')
    if (s) { server = { port, csrf: d.csrf }; return { status: s, port, csrf: d.csrf } }
  }
  return null
}

export async function collectAntigravity(): Promise<UsageSnapshot> {
  const res = await getStatus().catch(() => null)
  if (!res) {
    server = null
    return offline(t('ag.turnOn'))
  }

  const us = res.status.userStatus ?? {}
  const plan = us.planStatus ?? res.status.planStatus ?? {}
  const info = plan.planInfo ?? {}
  // Credit reset time lives on the per-model quotaInfo (all share the same value).
  const resetAt = us.cascadeModelConfigData?.clientModelConfigs?.[0]?.quotaInfo?.resetTime
  const windows: UsageWindow[] = []
  // NOTE: availablePromptCredits is the USED amount (verified: 500/50000 → 남음 99%).
  const addCredit = (label: string, used: unknown, monthly: unknown) => {
    const u = Number(used), m = Number(monthly)
    if (!isFinite(u) || !isFinite(m) || m <= 0) return
    windows.push({ window_type: 'daily', utilization: Math.min(Math.max(u / m, 0), 1), used: u, limit: m, resets_at: resetAt, label })
  }
  addCredit(t('w.promptCredits'), plan.availablePromptCredits, info.monthlyPromptCredits)
  addCredit(t('w.flowCredits'), plan.availableFlowCredits, info.monthlyFlowCredits)

  if (windows.length === 0) return offline(t('ag.noData'))

  // availableX is the USED amount → show "used / total".
  const usedOf = (used: unknown, monthly: unknown) => {
    const u = Number(used), m = Number(monthly)
    return isFinite(u) && isFinite(m) ? `${u.toLocaleString()} / ${m.toLocaleString()}` : '?'
  }
  // -1 means unlimited in this API.
  const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? (x < 0 ? t('ag.unlimited') : x.toLocaleString()) : '?' }
  const feat: string[] = []
  if (info.cascadeWebSearchEnabled) feat.push(t('ag.featWebSearch'))
  if (info.knowledgeBaseEnabled) feat.push(t('ag.featKnowledge'))
  if (info.allowStickyPremiumModels) feat.push(t('ag.featPremium'))
  if (info.cascadeCanAutoRunCommands) feat.push(t('ag.featAutoRun'))
  if (info.canGenerateCommitMessages) feat.push(t('ag.featCommit'))
  if (info.hasAutocompleteFastMode) feat.push(t('ag.featFastAutocomplete'))

  const snap: UsageSnapshot = {
    provider: 'antigravity',
    available: true,
    windows,
    plan: info.planName,
    extraInfo: [
      us.name ? t('ag.user', `${us.name}${us.email ? ` (${us.email})` : ''}`) : '',
      t('ag.plan', info.planName ?? '?'),
      t('ag.promptLeft', usedOf(plan.availablePromptCredits, info.monthlyPromptCredits)),
      t('ag.flowLeft', usedOf(plan.availableFlowCredits, info.monthlyFlowCredits)),
      t('ag.flexLimit', n(info.monthlyFlexCreditPurchaseAmount)),
      t('ag.maxChatTokens', n(info.maxNumChatInputTokens)),
      t('ag.premiumChat', n(info.maxNumPremiumChatMessages)),
      t('ag.canBuy', info.canBuyMoreCredits ? t('ag.yes') : t('ag.no')),
      feat.length ? t('ag.features', feat.join(' · ')) : ''
    ].filter(Boolean),
    fetched_at: new Date().toISOString(),
    stale: false,
    source: 'api'
  }
  cacheStore.set('antigravity', snap)
  return snap
}
